"""Pinned message (shared), 2-step verification, custom stickers, broadcast lists, announcements,
quick replies, per-chat tones and storage usage.

POST chats/pin-message/        {chat_id|friend_id, message_id|null}   pin / unpin for everybody in the chat
GET  account/2fa/              {enabled}
POST account/2fa/setup/        -> {secret, uri}      (not active until enabled)
POST account/2fa/enable/       {code}
POST account/2fa/disable/      {password, code}
GET/POST stickers/             list mine / upload one (multipart image)
POST stickers/delete/          {id}
GET/POST broadcasts/           list mine / create {name, recipient_ids}
POST broadcasts/update/        {id, name?, recipient_ids?}
POST broadcasts/delete/        {id}
POST broadcasts/send/          {id, content}
POST admin-api/announce/       {title, text}   (admin) shows a pop-up to every user + phone push
GET  announcements/latest/     newest announcement of the last 14 days (or null)
GET/POST quick-replies/        list / save {shortcut, text}
POST quick-replies/delete/     {id}
GET  tones/                    every chat's tone + call tone for me
GET  storage/                  how much media I have sent / received, by type
"""
import base64
import hashlib
import hmac
import io
import re
import secrets
import struct
import time
from datetime import timedelta
from urllib.parse import quote

from django.contrib.auth.hashers import check_password
from django.core.files.base import ContentFile
from django.db.models import Q, Sum, Count
from django.utils import timezone
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .admin_api import IsChatzyAdmin
from .models import (Announcement, BroadcastList, Chat, ChatUserSetting, CustomUser, Message, QuickReply, Sticker)
from .music import clean_text
from .realtime import notify_users
from .views import (ChatLocked, are_friends, blocked_between, ensure_unlocked, friend_ids_of,
                    get_or_create_direct_chat, notify_message, resolve_chat, to_int)

TONES = {'', 'pop', 'chime', 'bell', 'drop', 'bubble', 'silent'}


# =========================================================== shared pinned message
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def pin_message_view(request):
    chat = resolve_chat(request.user, request.data)
    ensure_unlocked(request.user, chat)
    if chat.is_group and chat.announce_only and not (chat.created_by_id == request.user.id
                                                     or chat.admins.filter(id=request.user.id).exists()):
        raise PermissionDenied("Only admins can pin in this group.")
    mid = to_int(request.data.get('message_id'))
    if mid:
        msg = Message.objects.filter(id=mid, chat=chat, is_deleted=False).first()
        if not msg:
            raise ValidationError({"error": "Message not found."})
        chat.pinned_message = msg
    else:
        chat.pinned_message = None
    chat.save(update_fields=['pinned_message'])
    notify_users(list(chat.participants.values_list('id', flat=True)), 'chat_updated', chat_id=chat.id)
    return Response({"ok": True, "pinned_message": pinned_payload(chat)})


def pinned_payload(chat):
    m = chat.pinned_message
    if not m or m.is_deleted:
        return None
    return {"id": m.id, "content": m.content, "message_type": m.message_type, "file_name": m.file_name}


# =========================================================== 2-step verification (TOTP, works with Google Authenticator)
def _hotp(secret, counter):
    key = base64.b32decode(secret.upper() + '=' * (-len(secret) % 8))
    digest = hmac.new(key, struct.pack('>Q', counter), hashlib.sha1).digest()
    off = digest[-1] & 15
    return '%06d' % ((struct.unpack('>I', digest[off:off + 4])[0] & 0x7fffffff) % 1000000)


def verify_totp(secret, code):
    code = re.sub(r'\D', '', str(code or ''))
    if not secret or len(code) != 6:
        return False
    now = int(time.time() // 30)
    return any(hmac.compare_digest(_hotp(secret, now + d), code) for d in (-1, 0, 1))


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def twofa_status_view(request):
    return Response({"enabled": request.user.totp_enabled})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def twofa_setup_view(request):
    user = request.user
    if user.totp_enabled:
        raise ValidationError({"error": "2-step verification is already on."})
    user.totp_secret = base64.b32encode(secrets.token_bytes(10)).decode().rstrip('=')
    user.save(update_fields=['totp_secret'])
    uri = f"otpauth://totp/Chatzy:{quote(user.username)}?secret={user.totp_secret}&issuer=Chatzy"
    return Response({"secret": user.totp_secret, "uri": uri})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def twofa_enable_view(request):
    user = request.user
    if not verify_totp(user.totp_secret, request.data.get('code')):
        raise ValidationError({"error": "That code is not correct. Try the newest code."})
    user.totp_enabled = True
    user.save(update_fields=['totp_enabled'])
    return Response({"enabled": True})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def twofa_disable_view(request):
    user = request.user
    if not user.check_password(str(request.data.get('password') or '')):
        raise ValidationError({"error": "Wrong password."})
    if not verify_totp(user.totp_secret, request.data.get('code')):
        raise ValidationError({"error": "That code is not correct."})
    user.totp_enabled = False
    user.totp_secret = ''
    user.save(update_fields=['totp_enabled', 'totp_secret'])
    return Response({"enabled": False})


# =========================================================== custom stickers
MAX_STICKERS = 60


def _sticker_png(upload):
    from PIL import Image, ImageDraw, ImageOps
    if upload.size > 6 * 1024 * 1024:
        raise ValidationError({"error": "Photo is too big (max 6 MB)."})
    try:
        img = Image.open(upload)
        img = ImageOps.exif_transpose(img).convert('RGBA')
    except Exception:
        raise ValidationError({"error": "That file is not a picture."})
    img = ImageOps.fit(img, (512, 512))                                     # square, centred
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, 511, 511), radius=96, fill=255)
    img.putalpha(mask)                                                      # rounded corners: looks like a sticker
    out = io.BytesIO()
    img.save(out, 'PNG', optimize=True)
    return out.getvalue()


@api_view(['GET', 'POST'])
@parser_classes([MultiPartParser, FormParser, JSONParser])
@permission_classes([IsAuthenticated])
def stickers_view(request):
    user = request.user
    if request.method == 'POST':
        f = request.FILES.get('image')
        if not f:
            raise ValidationError({"error": "Pick a photo."})
        if Sticker.objects.filter(user=user).count() >= MAX_STICKERS:
            raise ValidationError({"error": f"You can keep {MAX_STICKERS} stickers. Delete one first."})
        s = Sticker(user=user)
        s.image.save(f'{secrets.token_hex(8)}.png', ContentFile(_sticker_png(f)), save=True)
    return Response({"stickers": [{"id": s.id, "url": request.build_absolute_uri(s.image.url)}
                                  for s in Sticker.objects.filter(user=user)]})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def sticker_delete_view(request):
    Sticker.objects.filter(user=request.user, id=to_int(request.data.get('id'))).delete()
    return Response({"ok": True})


# =========================================================== broadcast lists
def _bl_row(b):
    return {"id": b.id, "name": b.name,
            "recipients": [{"id": u.id, "username": u.username} for u in b.recipients.all()]}


def _friend_recipients(user, raw):
    ids = {i for i in (to_int(x) for x in (raw or [])) if i}
    ids &= friend_ids_of(user)
    if not ids:
        raise ValidationError({"error": "Pick at least one friend."})
    if len(ids) > 100:
        raise ValidationError({"error": "A list can hold 100 friends."})
    return CustomUser.objects.filter(id__in=ids, is_active=True)


def _own_list(request):
    b = BroadcastList.objects.filter(owner=request.user, id=to_int(request.data.get('id'))).first()
    if not b:
        raise ValidationError({"error": "List not found."})
    return b


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def broadcasts_view(request):
    user = request.user
    if request.method == 'POST':
        name = clean_text(request.data.get('name'), 40)
        if not name:
            raise ValidationError({"error": "Give the list a name."})
        if BroadcastList.objects.filter(owner=user).count() >= 20:
            raise ValidationError({"error": "You can have 20 lists."})
        recipients = _friend_recipients(user, request.data.get('recipient_ids'))
        b = BroadcastList.objects.create(owner=user, name=name)
        b.recipients.set(recipients)
    return Response({"lists": [_bl_row(b) for b in BroadcastList.objects.filter(owner=user).prefetch_related('recipients')]})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def broadcast_update_view(request):
    b = _own_list(request)
    if 'name' in request.data:
        name = clean_text(request.data.get('name'), 40)
        if name:
            b.name = name
            b.save(update_fields=['name'])
    if 'recipient_ids' in request.data:
        b.recipients.set(_friend_recipients(request.user, request.data.get('recipient_ids')))
    return Response(_bl_row(b))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def broadcast_delete_view(request):
    _own_list(request).delete()
    return Response({"ok": True})


@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser, JSONParser])
@permission_classes([IsAuthenticated])
def broadcast_send_view(request):
    """Text, or a photo / video / document / voice note (with an optional caption)."""
    import os
    from .views import BLOCKED_EXT, MAX_UPLOAD
    user = request.user
    b = _own_list(request)
    content = str(request.data.get('content') or '').strip()[:4000]
    upload = request.FILES.get('file')
    extra = {}
    if upload:
        if upload.size > MAX_UPLOAD:
            raise ValidationError({"error": "File too large (max 25 MB)"})
        if os.path.splitext(upload.name)[1].lower() in BLOCKED_EXT:
            raise ValidationError({"error": "This file type is not allowed"})
        ct = upload.content_type or ''
        extra = {"file_name": upload.name[:255], "file_size": upload.size,
                 "message_type": ('image' if ct.startswith('image') else 'video' if ct.startswith('video')
                                  else 'audio' if ct.startswith('audio') else 'document')}
    elif not content:
        raise ValidationError({"error": "Type a message or pick a photo / video."})
    stored_name = None                                       # the file is saved once and every message points to it
    sent = skipped = 0
    friends = friend_ids_of(user)
    for r in b.recipients.filter(is_active=True):
        if r.id not in friends or blocked_between(user.id, r.id):
            skipped += 1
            continue
        chat = get_or_create_direct_chat(user, r)
        try:
            ensure_unlocked(user, chat)                      # a chat I locked and have not opened is skipped
        except ChatLocked:
            skipped += 1
            continue
        fields = dict(chat=chat, sender=user, receiver=r, content=content, status='delivered' if r.is_online else 'sent')
        if upload and stored_name:
            msg = Message.objects.create(message_type=extra['message_type'], file_name=extra['file_name'],
                                         file_size=extra['file_size'], file_url=stored_name, **fields)
        elif upload:
            upload.seek(0)
            msg = Message(message_type=extra['message_type'], file_name=extra['file_name'],
                          file_size=extra['file_size'], **fields)
            msg.file_url.save(upload.name, upload, save=True)
            stored_name = msg.file_url.name
        else:
            msg = Message.objects.create(message_type='text', **fields)
        notify_message(chat, msg, 'new')
        sent += 1
    return Response({"sent": sent, "skipped": skipped})


# =========================================================== announcements
@api_view(['POST'])
@permission_classes([IsChatzyAdmin])
def announce_view(request):
    title = clean_text(request.data.get('title'), 80)
    text = clean_text(request.data.get('text'), 500)
    if not text:
        raise ValidationError({"error": "Write the announcement."})
    a = Announcement.objects.create(title=title, text=text, created_by=request.user)
    from .admin_api import log_action
    log_action(request.user, 'announcement', None, (title + ': ' if title else '') + text[:200])
    ids = list(CustomUser.objects.filter(is_active=True).values_list('id', flat=True))
    notify_users(ids, 'announcement', id=a.id, title=a.title, text=a.text)
    try:
        from .push import send_push
        send_push(ids, title or 'Chatzy', text, {"announcement": a.id})
    except Exception:
        pass
    return Response({"ok": True, "id": a.id, "sent_to": len(ids)})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def announcement_latest_view(request):
    a = Announcement.objects.filter(created_at__gte=timezone.now() - timedelta(days=14)).first()
    return Response({"announcement": None if not a else {"id": a.id, "title": a.title, "text": a.text,
                                                         "created_at": a.created_at}})


# =========================================================== quick replies
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def quick_replies_view(request):
    user = request.user
    if request.method == 'POST':
        shortcut = re.sub(r'[^a-z0-9_]', '', str(request.data.get('shortcut') or '').lower().lstrip('/'))[:20]
        text = str(request.data.get('text') or '').strip()[:500]
        if not shortcut or not text:
            raise ValidationError({"error": "Add a shortcut (letters / numbers) and the text."})
        if not QuickReply.objects.filter(user=user, shortcut=shortcut).exists() and QuickReply.objects.filter(user=user).count() >= 30:
            raise ValidationError({"error": "You can keep 30 quick replies."})
        QuickReply.objects.update_or_create(user=user, shortcut=shortcut, defaults={"text": text})
    return Response({"replies": [{"id": q.id, "shortcut": q.shortcut, "text": q.text}
                                 for q in QuickReply.objects.filter(user=user)]})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def quick_reply_delete_view(request):
    QuickReply.objects.filter(user=request.user, id=to_int(request.data.get('id'))).delete()
    return Response({"ok": True})


# =========================================================== tones (read; they are written by chats/settings/)
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def tones_view(request):
    user = request.user
    out = []
    for s in ChatUserSetting.objects.filter(user=user).exclude(tone='', call_tone='').select_related('chat'):
        other = None if s.chat.is_group else s.chat.participants.exclude(id=user.id).values_list('id', flat=True).first()
        out.append({"chat_id": s.chat_id, "friend_id": other, "tone": s.tone, "call_tone": s.call_tone})
    return Response({"tones": out})


# =========================================================== storage usage
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def storage_view(request):
    mine = Message.objects.filter(chat__participants=request.user, is_deleted=False,
                                  message_type__in=('image', 'video', 'audio', 'document'))
    rows = mine.values('message_type').annotate(n=Count('id'), size=Sum('file_size'))
    kinds = {}
    for r in rows:
        k = r['message_type']
        kinds[k] = {"count": r['n'], "bytes": int(r['size'] or 0)}
    return Response({"kinds": kinds, "total_bytes": sum(v['bytes'] for v in kinds.values())})
