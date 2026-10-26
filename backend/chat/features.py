"""New feature endpoints: privacy, login devices, starred messages, media gallery,
group admin tools, polls and muted status updates.

All URLs are registered in urls.py (above the router include)."""
import re
from datetime import timedelta

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import (
    Chat, ChatUserSetting, CustomUser, DeviceSession, Message, Poll, PollOption, PollVote, StatusMute,
)
from .realtime import notify_users
from .serializers import MessageSerializer
from .views import (
    resolve_chat, ensure_unlocked, other_user, blocked_between, notify_message, notify_chat,
    friend_ids_of, visible_to, purge_expired, to_bool, to_int, MAX_UPLOAD,
)

PRIVACY_VALUES = ('everyone', 'friends', 'nobody')
URL_RE = re.compile(r'https?://[^\s<>"\']+')
MAX_POLL_OPTIONS = 10


def _ctx(request):
    return {'request': request}


def _message_qs():
    return (Message.objects.select_related('sender', 'receiver', 'chat', 'status_ref__user')
            .prefetch_related('read_by', 'starred_by', 'poll__options__votes', 'whisper_to', 'time_unlocked_by', 'expense__shares__user'))


# ================================================================ privacy
def _privacy_payload(u):
    return {'last_seen': u.privacy_last_seen, 'photo': u.privacy_photo, 'read_receipts': u.read_receipts}


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def privacy_view(request):
    u = request.user
    if request.method == 'POST':
        changed = []
        for key, field in (('last_seen', 'privacy_last_seen'), ('photo', 'privacy_photo')):
            if key in request.data:
                value = str(request.data.get(key))
                if value not in PRIVACY_VALUES:
                    return Response({'error': 'Invalid option'}, status=400)
                setattr(u, field, value)
                changed.append(field)
        if 'read_receipts' in request.data:
            u.read_receipts = to_bool(request.data.get('read_receipts'))
            changed.append('read_receipts')
        if changed:
            u.save(update_fields=changed)
            notify_users(list(friend_ids_of(u)), 'friends_changed')        # friends reload my profile
    return Response(_privacy_payload(u))


# ================================================================ devices
def _current_uid(request):
    return request.auth.uid if isinstance(request.auth, DeviceSession) else None


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def devices_view(request):
    cur = _current_uid(request)
    rows = [{
        'id': s.uid, 'name': s.device_name or 'Unknown device', 'ip': s.ip,
        'created': s.created, 'last_used': s.last_used, 'current': s.uid == cur,
    } for s in DeviceSession.objects.filter(user=request.user).order_by('-last_used')]
    # logged in before per-device tokens existed: that login is shown as one older device
    legacy = cur is None and Token.objects.filter(user=request.user).exists()
    if legacy:
        rows.append({'id': 'legacy', 'name': 'This device (older login)', 'ip': None,
                     'created': None, 'last_used': timezone.now(), 'current': True})
    return Response({'devices': rows})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def device_revoke_view(request):
    uid = str(request.data.get('id') or '')
    if uid == 'legacy':
        Token.objects.filter(user=request.user).delete()
    else:
        DeviceSession.objects.filter(user=request.user, uid=uid).delete()
    return Response({'status': 'signed out'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def device_revoke_others_view(request):
    cur = request.auth
    if isinstance(cur, DeviceSession):
        DeviceSession.objects.filter(user=request.user).exclude(pk=cur.pk).delete()
        Token.objects.filter(user=request.user).delete()               # older shared token
    else:
        DeviceSession.objects.filter(user=request.user).delete()       # keep only this old-style login
    return Response({'status': 'signed out everywhere else'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    """Ends THIS device's login on the server."""
    if isinstance(request.auth, DeviceSession):
        request.auth.delete()
    else:
        Token.objects.filter(user=request.user).delete()
    return Response({'status': 'logged out'})


# ================================================================ starred messages
def _can_access(msg, user):
    if msg.chat_id:
        return msg.chat.participants.filter(id=user.id).exists()
    return user.id in (msg.sender_id, msg.receiver_id)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def star_view(request):
    msg = get_object_or_404(Message.objects.select_related('chat'), id=to_int(request.data.get('message_id')))
    if not _can_access(msg, request.user) or msg.message_type == 'system':
        raise PermissionDenied('Not your message.')
    if msg.starred_by.filter(id=request.user.id).exists():
        msg.starred_by.remove(request.user)
        return Response({'starred': False})
    msg.starred_by.add(request.user)
    return Response({'starred': True})


def _locked_chat_ids(user):
    """Chats with a PIN that are not unlocked right now (their messages stay hidden everywhere)."""
    now = timezone.now()
    return list(ChatUserSetting.objects.filter(user=user).exclude(pin_hash='')
                .filter(Q(unlocked_until__isnull=True) | Q(unlocked_until__lte=now))
                .values_list('chat_id', flat=True))


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def starred_list_view(request):
    user = request.user
    qs = (visible_to(_message_qs().filter(starred_by=user), user)
          .exclude(chat_id__in=_locked_chat_ids(user))
          .exclude(content__startswith='[VIEW_ONCE]')
          .order_by('-created_at')[:200])
    out = []
    for m in qs:
        if not m.chat_id:
            continue
        if m.chat.is_group:
            title, friend_id = m.chat.group_name, None
        else:
            other = other_user(m.chat, user)
            title, friend_id = (other.username if other else 'Chat'), (other.id if other else None)
        out.append({
            'message': MessageSerializer(m, context=_ctx(request)).data,
            'chat_id': m.chat_id, 'is_group': m.chat.is_group, 'title': title, 'friend_id': friend_id,
        })
    return Response(out)


# ================================================================ media gallery
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def gallery_view(request):
    user = request.user
    chat = resolve_chat(user, request.query_params)
    ensure_unlocked(user, chat)
    purge_expired(chat)
    base = (visible_to(_message_qs().filter(chat=chat), user)
            .exclude(content__startswith='[VIEW_ONCE]').order_by('-created_at'))
    media = list(base.filter(message_type__in=['image', 'video'], file_url__isnull=False)[:300])
    docs = list(base.filter(message_type='document')[:300])
    links = []
    for m in base.filter(message_type='text', content__icontains='http')[:400]:
        for url in URL_RE.findall(m.content or ''):
            links.append({'id': m.id, 'url': url.rstrip('.,);'), 'created_at': m.created_at,
                          'sender_name': m.sender.username})
    ctx = _ctx(request)
    return Response({
        'media': MessageSerializer(media, many=True, context=ctx).data,
        'docs': MessageSerializer(docs, many=True, context=ctx).data,
        'links': links[:300],
    })


# ================================================================ groups
def is_group_admin(chat, user):
    return chat.created_by_id == user.id or chat.admins.filter(id=user.id).exists()


def _admin_group(request, chat_id):
    chat = get_object_or_404(Chat, id=to_int(chat_id), is_group=True, participants=request.user)
    if not is_group_admin(chat, request.user):
        raise PermissionDenied('Only group admins can do that.')
    return chat


def _system(chat, user, text):
    msg = Message.objects.create(chat=chat, sender=user, message_type='system', content=text)
    notify_message(chat, msg, 'new')


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def group_update_view(request):
    user = request.user
    chat = _admin_group(request, request.data.get('chat_id'))
    notes = []

    if 'group_name' in request.data:
        name = (request.data.get('group_name') or '').strip()[:255]
        if not name:
            return Response({'error': 'Group name cannot be empty'}, status=400)
        if name != chat.group_name:
            chat.group_name = name
            notes.append(f'{user.username} changed the group name to "{name}"')
    if 'group_description' in request.data:
        desc = (request.data.get('group_description') or '').strip()[:500]
        if desc != chat.group_description:
            chat.group_description = desc
            notes.append(f'{user.username} updated the group description')
    photo = request.FILES.get('group_photo')
    if photo:
        if photo.size > MAX_UPLOAD:
            return Response({'error': 'Image too large'}, status=400)
        if not (photo.content_type or '').startswith('image'):
            return Response({'error': 'Please choose an image'}, status=400)
        chat.group_photo = photo
        notes.append(f'{user.username} changed the group photo')
    elif to_bool(request.data.get('remove_photo')) and chat.group_photo:
        chat.group_photo = None
        notes.append(f'{user.username} removed the group photo')

    chat.save()
    for text in notes:
        _system(chat, user, text)
    notify_chat(chat, 'chat_updated')
    return Response({'status': 'updated'})


def _id_list(raw):
    if raw is None:
        return []
    if not isinstance(raw, (list, tuple)):
        raw = [raw]
    return [i for i in (to_int(x) for x in raw) if i]


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def group_members_view(request):
    """{chat_id, add: [user ids], remove: [user ids]}  (admins only)."""
    user = request.user
    chat = _admin_group(request, request.data.get('chat_id'))
    current = set(chat.participants.values_list('id', flat=True))

    my_friends = friend_ids_of(user)
    add_ids = [i for i in _id_list(request.data.get('add')) if i in my_friends and i not in current
               and not blocked_between(user.id, i)]
    removable = {i for i in _id_list(request.data.get('remove')) if i in current and i != user.id
                 and i != chat.created_by_id}

    added = list(CustomUser.objects.filter(id__in=add_ids))
    removed = list(CustomUser.objects.filter(id__in=removable))
    if added:
        chat.participants.add(*added)
        _system(chat, user, f"{user.username} added {', '.join(u.username for u in added)}")
    if removed:
        chat.participants.remove(*removed)
        chat.admins.remove(*removed)
        _system(chat, user, f"{user.username} removed {', '.join(u.username for u in removed)}")
        notify_users([u.id for u in removed], 'chat_updated', chat_id=chat.id)
    notify_chat(chat, 'chat_updated')
    notify_users([u.id for u in added], 'chat_updated', chat_id=chat.id)
    return Response({'added': len(added), 'removed': len(removed)})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def group_admin_view(request):
    """{chat_id, user_id, make: true|false}.  Any admin can promote; only the creator can demote."""
    user = request.user
    chat = _admin_group(request, request.data.get('chat_id'))
    target = get_object_or_404(chat.participants, id=to_int(request.data.get('user_id')))
    make = to_bool(request.data.get('make'))
    if make:
        chat.admins.add(target)
        _system(chat, user, f'{user.username} made {target.username} an admin')
    else:
        if target.id == chat.created_by_id:
            return Response({'error': 'The group creator is always an admin'}, status=400)
        if chat.created_by_id != user.id and target.id != user.id:
            raise PermissionDenied('Only the group creator can remove an admin.')
        chat.admins.remove(target)
        _system(chat, user, f'{user.username} removed {target.username} as admin')
    notify_chat(chat, 'chat_updated')
    return Response({'status': 'ok'})


# ================================================================ polls
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def poll_create_view(request):
    user = request.user
    chat = resolve_chat(user, request.data)
    ensure_unlocked(user, chat)
    other = None if chat.is_group else other_user(chat, user)
    if other and blocked_between(user.id, other.id):
        raise PermissionDenied("You can't message this user.")

    question = (request.data.get('question') or '').strip()[:300]
    raw = request.data.get('options')
    if not isinstance(raw, (list, tuple)):
        raw = []
    options, seen = [], set()
    for o in raw:
        text = str(o).strip()[:100]
        if text and text.lower() not in seen:
            seen.add(text.lower())
            options.append(text)
    if not question:
        raise ValidationError({'error': 'Write a question for the poll'})
    if len(options) < 2:
        raise ValidationError({'error': 'Add at least 2 different options'})
    if len(options) > MAX_POLL_OPTIONS:
        raise ValidationError({'error': f'A poll can have at most {MAX_POLL_OPTIONS} options'})

    msg = Message.objects.create(
        chat=chat, sender=user, receiver=other, message_type='poll', content=question,
        status='delivered' if (other and other.is_online) else 'sent')
    poll = Poll.objects.create(message=msg, question=question, multiple=to_bool(request.data.get('multiple')))
    PollOption.objects.bulk_create([PollOption(poll=poll, text=t, position=i) for i, t in enumerate(options)])
    notify_message(chat, msg, 'new')
    msg = _message_qs().get(pk=msg.pk)
    return Response(MessageSerializer(msg, context=_ctx(request)).data, status=201)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def poll_vote_view(request):
    user = request.user
    opt = get_object_or_404(PollOption.objects.select_related('poll__message__chat'),
                            id=to_int(request.data.get('option_id')))
    poll, msg = opt.poll, opt.poll.message
    chat = msg.chat
    if not chat or not chat.participants.filter(id=user.id).exists():
        raise PermissionDenied('Not your poll.')
    ensure_unlocked(user, chat)
    if poll.closed:
        return Response({'error': 'This poll is closed'}, status=400)

    mine = PollVote.objects.filter(option=opt, user=user)
    if mine.exists():
        mine.delete()                                           # tap again = take the vote back
    else:
        if not poll.multiple:
            PollVote.objects.filter(option__poll=poll, user=user).delete()
        PollVote.objects.create(option=opt, user=user)
    notify_message(chat, msg, 'update')
    msg = _message_qs().get(pk=msg.pk)
    return Response(MessageSerializer(msg, context=_ctx(request)).data)


# ================================================================ muted status updates
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def status_mutes_view(request):
    user = request.user
    if request.method == 'POST':
        uid = to_int(request.data.get('user_id'))
        if not uid or uid == user.id:
            return Response({'error': 'Invalid user'}, status=400)
        row = StatusMute.objects.filter(user=user, muted_id=uid)
        if row.exists():
            row.delete()
        else:
            target = get_object_or_404(CustomUser, id=uid)
            StatusMute.objects.get_or_create(user=user, muted=target)
    return Response({'ids': sorted(StatusMute.objects.filter(user=user).values_list('muted_id', flat=True))})
