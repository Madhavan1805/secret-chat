import re
import sys
import threading
import time
from datetime import timedelta, timezone as dt_timezone

from django.db import close_old_connections
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Message, ScheduledMessage
from .views import (
    resolve_chat, chat_setting, ensure_unlocked, other_user,
    are_friends, blocked_between, notify_message, to_bool,
)

WALLPAPER_PRESETS = {'midnight', 'ocean', 'forest', 'sunset', 'rose', 'graphite'}
COLOR_WALLPAPER_RE = re.compile(r'^color:#[0-9a-fA-F]{6}$')      # 13 characters, fits wallpaper_preset (max_length 20)
MAX_WALLPAPER = 5 * 1024 * 1024


# ============================================================ wallpaper
def _wp_payload(request, s):
    url = request.build_absolute_uri(s.wallpaper_image.url) if s.wallpaper_image else ''
    return {"wallpaper_preset": s.wallpaper_preset, "wallpaper_url": url}


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def wallpaper_view(request):
    data = request.query_params if request.method == 'GET' else request.data
    chat = resolve_chat(request.user, data)
    s = chat_setting(request.user, chat)

    if request.method == 'POST':
        upload = request.FILES.get('image')
        preset = (request.data.get('preset') or '').strip()
        if to_bool(request.data.get('clear')):
            s.wallpaper_preset = ''
            s.wallpaper_image = None
        elif upload:
            if upload.size > MAX_WALLPAPER:
                return Response({"error": "Image too large (max 5 MB)"}, status=400)
            if not (upload.content_type or '').startswith('image'):
                return Response({"error": "Please choose an image"}, status=400)
            s.wallpaper_image = upload
            s.wallpaper_preset = ''
        elif preset:
            if COLOR_WALLPAPER_RE.match(preset):
                preset = preset.lower()          # a plain colour: "color:#1e293b"
            elif preset not in WALLPAPER_PRESETS:
                return Response({"error": "Unknown wallpaper"}, status=400)
            s.wallpaper_preset = preset
            s.wallpaper_image = None
        else:
            return Response({"error": "Nothing to change"}, status=400)
        s.save()
    return Response(_wp_payload(request, s))


# ====================================================== scheduled messages
def send_due_scheduled():
    now = timezone.now()
    due = list(ScheduledMessage.objects.filter(sent=False, send_at__lte=now)
               .select_related('chat', 'sender')[:50])
    for sm in due:
        # claim first, so the same message can never be sent twice
        if ScheduledMessage.objects.filter(id=sm.id, sent=False).update(sent=True) != 1:
            continue
        try:
            chat, sender = sm.chat, sm.sender
            if chat.is_group:
                if not chat.participants.filter(id=sender.id).exists():
                    continue
                receiver = None
            else:
                receiver = other_user(chat, sender)
                if (not receiver or not are_friends(sender, receiver.id)
                        or blocked_between(sender.id, receiver.id)):
                    continue
            msg = Message.objects.create(
                chat=chat, sender=sender, receiver=receiver, content=sm.content,
                status='delivered' if (receiver and receiver.is_online) else 'sent')
            notify_message(chat, msg, 'new')
        except Exception:
            pass
    ScheduledMessage.objects.filter(sent=True, send_at__lt=now - timedelta(days=1)).delete()


_started = False
_lock = threading.Lock()


def _loop():
    while True:
        try:
            send_due_scheduled()
        except Exception:
            pass
        finally:
            close_old_connections()
        time.sleep(10)


def ensure_scheduler():
    global _started
    with _lock:
        if _started:
            return
        _started = True
    threading.Thread(target=_loop, daemon=True, name='scheduled-sender').start()


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def schedule_view(request):
    ensure_scheduler()
    user = request.user
    chat = resolve_chat(user, request.data)
    ensure_unlocked(user, chat)

    content = (request.data.get('content') or '').strip()
    if not content:
        return Response({"error": "Message cannot be empty"}, status=400)
    if len(content) > 4000:
        return Response({"error": "Message too long"}, status=400)

    send_at = parse_datetime(str(request.data.get('send_at') or ''))
    if not send_at:
        return Response({"error": "Pick a valid date and time"}, status=400)
    if timezone.is_naive(send_at):
        send_at = timezone.make_aware(send_at, dt_timezone.utc)
    now = timezone.now()
    if send_at < now + timedelta(seconds=15):
        return Response({"error": "Pick a time in the future"}, status=400)
    if send_at > now + timedelta(days=90):
        return Response({"error": "Maximum 90 days ahead"}, status=400)

    if not chat.is_group:
        other = other_user(chat, user)
        if not other or blocked_between(user.id, other.id):
            raise PermissionDenied("You can't message this user.")
    if ScheduledMessage.objects.filter(sender=user, sent=False).count() >= 50:
        return Response({"error": "Too many scheduled messages (max 50)"}, status=400)

    sm = ScheduledMessage.objects.create(chat=chat, sender=user, content=content, send_at=send_at)
    return Response({"id": sm.id, "send_at": sm.send_at}, status=201)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def scheduled_list_view(request):
    ensure_scheduler()
    chat = resolve_chat(request.user, request.query_params)
    ensure_unlocked(request.user, chat, extend=False)
    rows = ScheduledMessage.objects.filter(chat=chat, sender=request.user, sent=False).order_by('send_at')
    return Response([{"id": r.id, "content": r.content, "send_at": r.send_at} for r in rows])


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def cancel_scheduled_view(request):
    try:
        sid = int(request.data.get('id'))
    except (TypeError, ValueError):
        return Response({"error": "id required"}, status=400)
    deleted, _ = ScheduledMessage.objects.filter(id=sid, sender=request.user, sent=False).delete()
    if not deleted:
        return Response({"error": "Already sent or not found"}, status=404)
    return Response({"status": "cancelled"})


# start the background sender once the server loads (skip for manage.py commands)
if not ({'migrate', 'makemigrations', 'collectstatic', 'check', 'shell', 'test', 'createsuperuser'} & set(sys.argv)):
    ensure_scheduler()