"""Saved messages, group invite links, translate, link preview, backup."""
import hashlib
import ipaddress
import json
import re
import secrets
import socket
import urllib.error
import urllib.parse
import urllib.request
from html import unescape

from django.core.cache import cache
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Chat, ChatUserSetting, CustomUser, Message, Note
from .views import ensure_unlocked, friend_ids_of, notify_chat, notify_message, to_int, visible_to


def _h(text):
    return hashlib.sha1(text.encode('utf-8')).hexdigest()[:20]


# ================================================================ Saved messages (a chat with yourself)
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def self_chat_view(request):
    user = request.user
    chat = Chat.objects.filter(is_self=True, participants=user).first()
    if not chat:
        chat = Chat.objects.create(is_group=True, is_self=True, group_name='Saved messages', created_by=user)
        chat.participants.add(user)
    return Response({"chat_id": chat.id, "name": chat.group_name})


# ================================================================ group invite link
def _group_admin(user, chat_id):
    from .features import is_group_admin
    chat = get_object_or_404(Chat, id=to_int(chat_id), is_group=True, participants=user)
    if chat.is_self or not is_group_admin(chat, user):
        raise PermissionDenied('Only group admins can do that.')
    return chat


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def invite_manage_view(request):
    """{chat_id, action: 'get' | 'reset' | 'revoke'} (admins only)."""
    chat = _group_admin(request.user, request.data.get('chat_id'))
    act = request.data.get('action') or 'get'
    if act == 'revoke':
        chat.invite_code = None
    elif act == 'reset' or not chat.invite_code:
        chat.invite_code = secrets.token_urlsafe(9)
    chat.save(update_fields=['invite_code'])
    return Response({"code": chat.invite_code})


def _code(raw):
    raw = str(raw or '').strip()
    return raw.rstrip('/').rsplit('/', 1)[-1][:24]            # accepts a full link or just the code


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def invite_info_view(request):
    chat = Chat.objects.filter(invite_code=_code(request.query_params.get('code')), is_group=True).first() if _code(request.query_params.get('code')) else None
    if not chat:
        raise ValidationError({"error": "This invite link is not valid any more."})
    pic = request.build_absolute_uri(chat.group_photo.url) if chat.group_photo else None
    return Response({"name": chat.group_name, "description": chat.group_description, "photo": pic,
                     "members": chat.participants.count(), "already": chat.participants.filter(id=request.user.id).exists(),
                     "chat_id": chat.id})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def invite_join_view(request):
    user = request.user
    code = _code(request.data.get('code'))
    chat = Chat.objects.filter(invite_code=code, is_group=True).first() if code else None
    if not chat:
        raise ValidationError({"error": "This invite link is not valid any more."})
    if chat.participants.count() >= 256:
        raise ValidationError({"error": "This group is full."})
    if not chat.participants.filter(id=user.id).exists():
        chat.participants.add(user)
        msg = Message.objects.create(chat=chat, sender=user, message_type='system', content=f"{user.username} joined using the invite link")
        notify_message(chat, msg, 'new')
        notify_chat(chat, 'chat_updated')
    return Response({"chat_id": chat.id, "name": chat.group_name})


# ================================================================ translate
LANGS = {'en': 'English', 'ta': 'Tamil', 'hi': 'Hindi', 'te': 'Telugu', 'ml': 'Malayalam', 'kn': 'Kannada'}


def _readable_message(user, message_id):
    """The message text, only if this user may read it normally (nothing locked, secret or whispered)."""
    m = Message.objects.select_related('chat').filter(pk=to_int(message_id)).first()
    if not m or not m.chat or not m.chat.participants.filter(id=user.id).exists():
        raise PermissionDenied('Not your message.')
    ensure_unlocked(user, m.chat)
    if not visible_to(Message.objects.filter(pk=m.pk), user).exists():
        raise PermissionDenied('Not available.')
    if m.time_lock or m.message_type != 'text' or (m.unlock_at and m.unlock_at > timezone.now()):
        raise ValidationError({"error": "This message can't be translated."})
    if m.whisper_to.exists() and not m.whisper_to.filter(id=user.id).exists():
        raise PermissionDenied('Not available.')
    text = (m.content or '').strip()
    if not text or text.startswith('['):
        raise ValidationError({"error": "Nothing to translate."})
    return text[:500]


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def translate_view(request):
    to = request.data.get('to')
    if to not in LANGS:
        raise ValidationError({"error": "Pick a language."})
    text = _readable_message(request.user, request.data.get('message_id'))
    key = f"tr:{to}:{_h(text)}"
    hit = cache.get(key)
    if hit:
        return Response({"text": hit, "to": LANGS[to]})
    rate = f"trrate:{request.user.id}"
    n = cache.get(rate, 0)
    if n >= 30:
        raise ValidationError({"error": "Too many translations, wait a minute."})
    cache.set(rate, n + 1, 60)
    url = 'https://api.mymemory.translated.net/get?' + urllib.parse.urlencode({'q': text, 'langpair': f'Autodetect|{to}'})
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Chatzy'}), timeout=8) as r:
            data = json.loads(r.read().decode('utf-8', 'replace'))
        out = unescape((data.get('responseData') or {}).get('translatedText') or '').strip()
    except Exception:
        out = ''
    if not out or out.upper().startswith(('MYMEMORY WARNING', 'PLEASE SELECT')):
        raise ValidationError({"error": "Translate is busy right now, try again in a bit."})
    cache.set(key, out, 24 * 3600)
    return Response({"text": out, "to": LANGS[to]})


# ================================================================ link preview
META_RE = re.compile(r'<meta\s+[^>]*>', re.I)
ATTR_RE = re.compile(r'([a-zA-Z:_-]+)\s*=\s*("([^"]*)"|\'([^\']*)\')')
TITLE_RE = re.compile(r'<title[^>]*>(.*?)</title>', re.I | re.S)


def _safe_host(host):
    """Only public internet addresses (stops the server being used to reach internal services)."""
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
            return False
    return bool(infos)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def _fetch_html(url, hops=3):
    opener = urllib.request.build_opener(_NoRedirect)
    for _ in range(hops + 1):
        p = urllib.parse.urlparse(url)
        if p.scheme not in ('http', 'https') or not p.hostname or not _safe_host(p.hostname):
            return None, url
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (compatible; ChatzyLinkPreview/1.0)',
                                                   'Accept': 'text/html'})
        try:
            with opener.open(req, timeout=5) as r:
                if 'html' not in (r.headers.get('Content-Type') or ''):
                    return None, url
                return r.read(300_000).decode('utf-8', 'replace'), url
        except urllib.error.HTTPError as e:
            loc = e.headers.get('Location') if e.code in (301, 302, 303, 307, 308) else None
            if not loc:
                return None, url
            url = urllib.parse.urljoin(url, loc)
        except Exception:
            return None, url
    return None, url


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def link_preview_view(request):
    url = (request.query_params.get('url') or '').strip()[:500]
    if not re.match(r'^https?://', url, re.I):
        raise ValidationError({"error": "Bad link."})
    key = f"lp:{_h(url)}"
    hit = cache.get(key)
    if hit is not None:
        return Response(hit or {})
    n = cache.get(f"lprate:{request.user.id}", 0)
    if n > 60:
        return Response({})
    cache.set(f"lprate:{request.user.id}", n + 1, 60)
    html, final = _fetch_html(url)
    out = {}
    if html:
        meta = {}
        for tag in META_RE.findall(html[:150_000]):
            attrs = {m[0].lower(): unescape(m[2] or m[3]) for m in ATTR_RE.findall(tag)}
            k = (attrs.get('property') or attrs.get('name') or '').lower()
            if k and attrs.get('content') and k not in meta:
                meta[k] = attrs['content'].strip()
        t = TITLE_RE.search(html)
        title = meta.get('og:title') or meta.get('twitter:title') or (unescape(t.group(1)).strip() if t else '')
        img = meta.get('og:image') or meta.get('twitter:image') or ''
        if img:
            img = urllib.parse.urljoin(final, img)
            if not img.startswith('https://'):
                img = ''
        if title:
            out = {"url": final, "title": title[:140], "description": (meta.get('og:description') or meta.get('description') or '')[:200],
                   "image": img, "site": meta.get('og:site_name') or urllib.parse.urlparse(final).hostname}
    cache.set(key, out, 6 * 3600)
    return Response(out)


# ================================================================ backup (profile, friends, chat text)
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def backup_view(request):
    """A readable copy of my profile, friends and the plain text of my chats. Locked chats, whispers, view-once
    and still-sealed messages are never included."""
    user = request.user
    locked = set(ChatUserSetting.objects.filter(user=user).exclude(pin_hash='').values_list('chat_id', flat=True))
    chats = []
    for chat in Chat.objects.filter(participants=user).exclude(id__in=locked).prefetch_related('participants'):
        other = None if chat.is_group else next((p for p in chat.participants.all() if p.id != user.id), None)
        rows = (visible_to(Message.objects.filter(chat=chat), user)
                .filter(time_lock=False, whisper_to=None).exclude(content__startswith='[VIEW_ONCE]')
                .exclude(unlock_at__gt=timezone.now()).select_related('sender').order_by('created_at')[:5000])
        chats.append({"chat": chat.group_name if chat.is_group else (other.username if other else ''),
                      "is_group": chat.is_group, "saved_messages": chat.is_self,
                      "messages": [{"time": m.created_at.isoformat(), "from": m.sender.username, "type": m.message_type,
                                    "text": m.content or ''} for m in rows]})
    note = Note.objects.filter(user=user).first()
    data = {"app": "Chatzy", "kind": "backup", "version": 1, "exported_at": timezone.now().isoformat(),
            "profile": {"username": user.username, "email": user.email, "phone": user.phone_number, "bio": user.bio,
                        "joined": user.date_joined.isoformat()},
            "friends": list(CustomUser.objects.filter(id__in=friend_ids_of(user)).values_list('username', flat=True)),
            "note": note.text if note else None, "chats": chats}
    resp = HttpResponse(json.dumps(data, ensure_ascii=False, indent=1), content_type='application/json; charset=utf-8')
    resp['Content-Disposition'] = 'attachment; filename="chatzy-backup.json"'
    return resp
