import os
from datetime import timedelta

from django.contrib.auth.hashers import check_password, make_password
from django.db import connection, transaction
from django.db.models import Q, Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.exceptions import (
    APIException, ValidationError, PermissionDenied, Throttled)
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response

from .models import (
    CustomUser, Chat, ChatUserSetting, Message, ChatRequest, Status, StatusView,
    CallHistory, Block, CloseFriend,
)
from .serializers import (
    UserSerializer, ChatSerializer, MessageSerializer, ChatRequestSerializer,
    StatusSerializer, CallHistorySerializer,
)
from .realtime import notify_users, send_to_user
from .push import send_push
from .privacy import visible, effective_muted

UNLOCK_MINUTES = 10
MAX_UPLOAD = 25 * 1024 * 1024
BLOCKED_EXT = {'.exe', '.bat', '.cmd', '.sh', '.msi', '.js', '.vbs', '.scr', '.jar', '.apk', '.com', '.ps1'}
CHAT_THEMES = {'default', 'ocean', 'forest', 'rose', 'midnight', 'light', 'classic'}
EDIT_WINDOW = timedelta(minutes=5)


class ChatLocked(APIException):
    status_code = 423
    default_detail = 'Chat is locked'
    default_code = 'chat_locked'


# =============================================================== helpers
def to_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def to_bool(value):
    return str(value).lower() in ('1', 'true', 'yes', 'on')


def friend_ids_of(user):
    pairs = (ChatRequest.objects.filter(status='accepted')
             .filter(Q(sender=user) | Q(receiver=user))
             .values_list('sender_id', 'receiver_id'))
    ids = set()
    for s, r in pairs:
        ids.update((s, r))
    ids.discard(user.id)
    return ids


def are_friends(user, other_id):
    other_id = to_int(other_id)
    if other_id is None:
        return False
    return ChatRequest.objects.filter(status='accepted').filter(
        Q(sender=user, receiver_id=other_id) | Q(sender_id=other_id, receiver=user)).exists()


def blocked_between(a_id, b_id):
    return Block.objects.filter(
        Q(blocker_id=a_id, blocked_id=b_id) | Q(blocker_id=b_id, blocked_id=a_id)).exists()


def get_direct_chat(user, other_id):
    other_id = to_int(other_id)
    if other_id is None:
        return None
    return (Chat.objects.filter(is_group=False, participants=user)
            .filter(participants=other_id).first())


def get_or_create_direct_chat(user, other):
    chat = get_direct_chat(user, other.id)
    if not chat:
        chat = Chat.objects.create()
        chat.participants.add(user, other)
    return chat


def other_user(chat, user):
    return chat.participants.exclude(id=user.id).first()


def resolve_chat(user, data):
    """chat_id -> group/any chat the user is in.  friend_id -> the 1:1 chat (created lazily)."""
    chat_id = to_int(data.get('chat_id') or data.get('chat'))
    friend_id = to_int(data.get('friend_id'))
    if chat_id:
        return get_object_or_404(Chat, id=chat_id, participants=user)
    if friend_id:
        other = get_object_or_404(CustomUser, id=friend_id)
        if not are_friends(user, other.id):
            raise PermissionDenied("You are not connected with this user.")
        return get_or_create_direct_chat(user, other)
    raise ValidationError({"error": "chat_id or friend_id required"})


def chat_setting(user, chat):
    return ChatUserSetting.objects.get_or_create(user=user, chat=chat)[0]


def ensure_unlocked(user, chat, extend=True):
    s = ChatUserSetting.objects.filter(user=user, chat=chat).first()
    if not s or not s.pin_hash:
        return
    now = timezone.now()
    if not (s.unlocked_until and s.unlocked_until > now):
        raise ChatLocked()
    if extend:
        s.unlocked_until = now + timedelta(minutes=UNLOCK_MINUTES)
        s.save(update_fields=['unlocked_until'])


def verify_pin(s, pin):
    now = timezone.now()
    if s.blocked_until and s.blocked_until > now:
        raise Throttled(wait=int((s.blocked_until - now).total_seconds()))
    if s.pin_hash and check_password(str(pin or ''), s.pin_hash):
        s.failed_attempts = 0
        s.blocked_until = None
        s.save(update_fields=['failed_attempts', 'blocked_until'])
        return True
    s.failed_attempts += 1
    left = 5 - s.failed_attempts
    if left <= 0:
        s.blocked_until = now + timedelta(minutes=5)
        s.failed_attempts = 0
    s.save(update_fields=['failed_attempts', 'blocked_until'])
    raise ValidationError({"error": "Wrong PIN", "attempts_left": max(left, 0)})


def purge_expired(chat):
    """Server-side disappearing messages: only messages sent AFTER the timer was switched on."""
    if chat.disappearing_time > 0 and chat.disappearing_started_at:
        cutoff = timezone.now() - timedelta(seconds=chat.disappearing_time)
        (Message.objects.filter(chat=chat, created_at__lt=cutoff,
                                created_at__gte=chat.disappearing_started_at)
         .exclude(message_type='system').delete())


def visible_to(qs, user):
    return (qs.filter(is_deleted=False)
            .exclude(sender=user, deleted_for_sender=True)
            .exclude(receiver=user, deleted_for_receiver=True)
            .exclude(hidden_for=user))


def human_duration(s):
    if s % 86400 == 0:
        d = s // 86400
        return f"{d} day{'s' if d > 1 else ''}"
    if s % 3600 == 0:
        h = s // 3600
        return f"{h} hour{'s' if h > 1 else ''}"
    if s % 60 == 0:
        m = s // 60
        return f"{m} minute{'s' if m > 1 else ''}"
    return f"{s} seconds"


def message_preview(msg):
    c = msg.content or ''
    if msg.unlock_at and msg.unlock_at > timezone.now():
        return '🔒 Time capsule'
    if msg.whisper_to.exists():
        return '🤫 Whisper'
    if msg.message_type == 'expense':
        return '💸 ' + (c[:60] or 'Expense')
    if c.startswith('[VIEW_ONCE]'):
        return '💣 View once message'
    t = msg.message_type
    if t == 'system':
        return c[:80]
    if c.startswith('[STICKER]'):
        return (c[9:].strip()[:8] + ' Sticker').strip()
    if c.startswith('[GIF]'):
        return '🎞️ GIF'
    if t == 'poll':
        return '📊 ' + (c[:60] or 'Poll')
    if msg.status_ref_id:
        return ('↩️ ' + c)[:80]
    if t == 'image':
        return '📷 ' + (c[:60] or 'Photo')
    if t == 'video':
        return '🎥 ' + (c[:60] or 'Video')
    if t == 'audio' or msg.voice_note:
        return '🎤 Voice message'
    if t == 'document':
        return '📄 ' + (msg.file_name or 'Document')
    if t == 'location':
        return '📍 Location'
    return c[:80] or '📎 Attachment'


def notify_message(chat, msg, action, message_id=None):
    """Push a live 'message' event to everybody in the chat (muted/locked aware),
    and send a phone push (OneSignal) for brand-new messages."""
    if not chat:
        return
    members = list(chat.participants.values_list('id', flat=True))
    sets = {s.user_id: s for s in ChatUserSetting.objects.filter(chat=chat, user_id__in=members)}
    preview = message_preview(msg)
    title = f"{msg.sender.username} • {chat.group_name}" if chat.is_group else msg.sender.username
    push_normal, push_locked = [], []
    for uid in members:
        s = sets.get(uid)
        send_to_user(uid, {
            "event": "message", "action": action, "chat_id": chat.id, "is_group": chat.is_group,
            "message_id": message_id or msg.id, "sender_id": msg.sender_id,
            "sender_name": msg.sender.username, "title": title, "mine": uid == msg.sender_id,
            "body": 'New message' if (s and s.pin_hash) else preview,
            "muted": effective_muted(s),
        })
        # phone push: only new messages from others, never system messages, never muted chats
        if (action == 'new' and uid != msg.sender_id and msg.message_type != 'system'
                and not effective_muted(s)):
            (push_locked if (s and s.pin_hash) else push_normal).append(uid)
    data = {"chat_id": chat.id}

    # 1:1 chat: once OneSignal accepts the push, mark the message delivered (double tick)
    mark = None
    if action == 'new' and not chat.is_group and msg.status == 'sent':
        def mark():
            try:
                if Message.objects.filter(id=msg.id, status='sent').update(status='delivered'):
                    notify_message(chat, msg, 'update')
            except Exception:
                pass
            finally:
                connection.close()

    send_push(push_normal, title, preview, data, on_success=mark)
    send_push(push_locked, title, 'New message', data, on_success=mark)


def notify_chat(chat, event, **data):
    notify_users(list(chat.participants.values_list('id', flat=True)), event, chat_id=chat.id, **data)


def expire_stale_calls():
    now = timezone.now()
    CallHistory.objects.filter(status='ringing', started_at__lt=now - timedelta(seconds=60)).update(
        status='missed', ended_at=now)


# ================================================================ users
class UserViewSet(viewsets.ModelViewSet):
    queryset = CustomUser.objects.all().order_by('username')
    serializer_class = UserSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['username']
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_permissions(self):
        # sign-up now goes through auth/register/ (see auth_views.py); only admins use these
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAdminUser()]
        return [IsAuthenticated()]

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        data = self.get_serializer(queryset, many=True).data

        unread_map = {
            row['sender_id']: row['c']
            for row in Message.objects.filter(
                receiver=request.user, is_deleted=False, deleted_for_receiver=False
            ).exclude(status='read').exclude(hidden_for=request.user)
            .values('sender_id').annotate(c=Count('id'))
        }
        i_blocked = set(Block.objects.filter(blocker=request.user).values_list('blocked_id', flat=True))
        blocked_me = set(Block.objects.filter(blocked=request.user).values_list('blocker_id', flat=True))
        locked_ids = set()
        locked = ChatUserSetting.objects.filter(user=request.user, chat__is_group=False).exclude(pin_hash='')
        for s in locked.select_related('chat').prefetch_related('chat__participants'):
            locked_ids.update(p.id for p in s.chat.participants.all())

        my_friends = friend_ids_of(request.user)
        privacy = {r['id']: r for r in CustomUser.objects.values('id', 'privacy_last_seen', 'privacy_photo')}
        for u in data:
            u['unread_count'] = unread_map.get(u['id'], 0)
            u['is_locked'] = u['id'] in locked_ids
            u['is_blocked'] = u['id'] in i_blocked
            if u['id'] in blocked_me:                      # a blocker can't be tracked
                u['is_online'] = False
                u['typing_with'] = None
                u['last_seen'] = None
            p = privacy.get(u['id'])
            if p:
                if not visible(p['privacy_last_seen'], request.user.id, u['id'], my_friends):
                    u['is_online'] = False
                    u['last_seen'] = None
                if not visible(p['privacy_photo'], request.user.id, u['id'], my_friends):
                    u['profile_picture'] = None
        return Response(data)

    def retrieve(self, request, *args, **kwargs):
        user = self.get_object()
        data = self.get_serializer(user).data
        if Block.objects.filter(blocker=user, blocked=request.user).exists():
            data['is_online'] = False
            data['typing_with'] = None
            data['last_seen'] = None
        my_friends = friend_ids_of(request.user)
        if not visible(user.privacy_last_seen, request.user.id, user.id, my_friends):
            data['is_online'] = False
            data['last_seen'] = None
        if not visible(user.privacy_photo, request.user.id, user.id, my_friends):
            data['profile_picture'] = None
        return Response(data)

    @action(detail=False, methods=['get'])
    def me(self, request):
        return Response(self.get_serializer(request.user).data)

    @action(detail=False, methods=['post'])
    def heartbeat(self, request):
        now = timezone.now()
        CustomUser.objects.filter(pk=request.user.pk).update(last_seen=now, is_online=True)
        CustomUser.objects.filter(last_seen__lt=now - timedelta(minutes=1)).update(
            is_online=False, typing_with=None)
        Message.objects.filter(receiver=request.user, status='sent').update(status='delivered')
        return Response({"status": "online"})

    @action(detail=False, methods=['patch'])
    def update_profile(self, request):
        user = request.user
        if request.data.get('remove_picture') == 'true':
            user.profile_picture = None
        elif 'profile_picture' in request.FILES:
            user.profile_picture = request.FILES['profile_picture']
        username = request.data.get('username')
        if username:
            username = username.strip()
            if CustomUser.objects.filter(username=username).exclude(id=user.id).exists():
                return Response({"error": "Name exists"}, status=400)
            user.username = username
        bio = request.data.get('bio')
        if bio is not None:
            user.bio = bio
        user.save()
        return Response(self.get_serializer(user).data)

    @action(detail=False, methods=['post'])
    def delete_account(self, request):
        """Permanently delete MY account (needs my password). Cannot be undone."""
        user = request.user
        if not user.check_password(str(request.data.get('password') or '')):
            return Response({"error": "Wrong password"}, status=400)

        # everybody who shares a chat / friendship with me must refresh their lists afterwards
        others = set(friend_ids_of(user))
        others.update(Chat.objects.filter(participants=user).values_list('participants', flat=True))
        others.discard(user.id)
        picture = user.profile_picture

        with transaction.atomic():
            Chat.objects.filter(participants=user, is_group=False).delete()   # 1:1 chats + their messages
            user.delete()          # messages, statuses, requests, blocks, tokens... cascade away
        try:
            if picture:
                picture.delete(save=False)
        except Exception:
            pass
        notify_users(list(others), 'friends_changed')
        return Response({"status": "deleted"})

    @action(detail=False, methods=['post'])
    def typing(self, request):                      # REST fallback when WebSocket is down
        receiver_id = to_int(request.data.get('receiver_id'))
        if receiver_id is None:
            return Response({"error": "receiver_id required"}, status=400)
        CustomUser.objects.filter(pk=request.user.pk).update(typing_with=receiver_id)
        return Response({"status": "typing"})

    @action(detail=False, methods=['post'])
    def stop_typing(self, request):
        CustomUser.objects.filter(pk=request.user.pk).update(typing_with=None)
        return Response({"status": "stopped"})

    # ---------------------------------------------------- block / unfriend
    @action(detail=False, methods=['post'])
    def block(self, request):
        uid = to_int(request.data.get('user_id'))
        if not uid or uid == request.user.id:
            return Response({"error": "Invalid user"}, status=400)
        target = get_object_or_404(CustomUser, id=uid)
        Block.objects.get_or_create(blocker=request.user, blocked=target)
        notify_users([request.user.id], 'blocklist')
        return Response({"status": "blocked"})

    @action(detail=False, methods=['post'])
    def unblock(self, request):
        uid = to_int(request.data.get('user_id'))
        Block.objects.filter(blocker=request.user, blocked_id=uid).delete()
        notify_users([request.user.id], 'blocklist')
        return Response({"status": "unblocked"})

    @action(detail=False, methods=['get'])
    def blocked(self, request):
        users = CustomUser.objects.filter(blocked_by__blocker=request.user)
        return Response(self.get_serializer(users, many=True).data)

    @action(detail=False, methods=['post'])
    def unfriend(self, request):
        uid = to_int(request.data.get('user_id'))
        if not uid:
            return Response({"error": "user_id required"}, status=400)
        ChatRequest.objects.filter(
            Q(sender=request.user, receiver_id=uid) | Q(sender_id=uid, receiver=request.user)).delete()
        notify_users([request.user.id, uid], 'friends_changed')
        return Response({"status": "unfriended"})


# ================================================================ chats
class ChatViewSet(viewsets.ModelViewSet):
    serializer_class = ChatSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_queryset(self):
        return (Chat.objects.filter(participants=self.request.user)
                .distinct().prefetch_related('participants'))

    def create(self, request, *args, **kwargs):
        return Response({"error": "Use /chats/create_group/"}, status=405)

    # ------------------------------------------------ overview (Home screen)
    @action(detail=False, methods=['get'])
    def overview(self, request):
        user = request.user
        friends = friend_ids_of(user)
        settings_map = {s.chat_id: s for s in ChatUserSetting.objects.filter(user=user)}
        direct, groups = [], []
        for chat in Chat.objects.filter(participants=user).prefetch_related('participants').distinct():
            s = settings_map.get(chat.id)
            locked = bool(s and s.pin_hash)
            purge_expired(chat)
            qs = visible_to(Message.objects.filter(chat=chat), user)
            last = qs.select_related('sender').order_by('-created_at').first()

            if chat.is_group:
                unread = (qs.exclude(sender=user).exclude(message_type='system')
                          .exclude(read_by=user).count())
                other = None
            else:
                other = next((p for p in chat.participants.all() if p.id != user.id), None)
                if not other or other.id not in friends:
                    continue
                unread = qs.filter(sender=other, receiver=user).exclude(status='read').count()

            row = {
                "chat_id": chat.id,
                "last_message": None if not last else {
                    "id": last.id,
                    "preview": '🔒 Locked chat' if locked else message_preview(last),
                    "created_at": last.created_at,
                    "sender_id": last.sender_id,
                    "status": last.status,
                },
                "unread_count": unread,
                "is_pinned": bool(s and s.is_pinned),
                "is_muted": effective_muted(s),
                "is_archived": bool(s and s.is_archived),
                "is_locked": locked,
                "disappearing_time": chat.disappearing_time,
                "theme": chat.theme,
            }
            if chat.is_group:
                row.update({
                    "group_name": chat.group_name, "member_count": len(chat.participants.all()),
                    "group_photo": request.build_absolute_uri(chat.group_photo.url) if chat.group_photo else None,
                })
                groups.append(row)
            else:
                row["friend_id"] = other.id
                # the friend switched read receipts off: no blue tick on my last message
                if (row["last_message"] and row["last_message"]["status"] == 'read'
                        and row["last_message"]["sender_id"] == user.id and not other.read_receipts):
                    row["last_message"]["status"] = 'delivered'
                direct.append(row)
        return Response({"direct": direct, "groups": groups})

    @action(detail=False, methods=['get'])
    def targets(self, request):
        """Friends + groups the user can forward a message to."""
        user = request.user
        blocked = set()
        for a, b in Block.objects.filter(Q(blocker=user) | Q(blocked=user)).values_list('blocker_id', 'blocked_id'):
            blocked.update((a, b))
        blocked.discard(user.id)
        out = [{"type": "friend", "friend_id": u.id, "name": u.username}
               for u in CustomUser.objects.filter(id__in=friend_ids_of(user)).order_by('username')
               if u.id not in blocked]
        out += [{"type": "group", "chat_id": c.id, "name": c.group_name}
                for c in Chat.objects.filter(is_group=True, participants=user).order_by('group_name')]
        return Response(out)

    # ------------------------------------------------ one chat's meta
    @action(detail=False, methods=['get'])
    def meta(self, request):
        user = request.user
        chat = resolve_chat(user, request.query_params)
        purge_expired(chat)
        s = chat_setting(user, chat)
        now = timezone.now()
        data = {
            "chat_id": chat.id,
            "is_group": chat.is_group,
            "group_name": chat.group_name,
            "theme": chat.theme,
            "created_by": chat.created_by_id,
            "disappearing_time": chat.disappearing_time,
            "disappearing_started_at": chat.disappearing_started_at,
            "is_locked": bool(s.pin_hash),
            "is_unlocked": (not s.pin_hash) or bool(s.unlocked_until and s.unlocked_until > now),
            "is_pinned": s.is_pinned,
            "is_muted": effective_muted(s),
            "muted_until": s.muted_until,
            "is_archived": s.is_archived,
            "participants": [{"id": p.id, "username": p.username} for p in chat.participants.all()],
            "group_description": chat.group_description,
            "group_photo": request.build_absolute_uri(chat.group_photo.url) if chat.group_photo else None,
            "admin_ids": sorted(set(chat.admins.values_list('id', flat=True))
                                | ({chat.created_by_id} if chat.created_by_id else set())) if chat.is_group else [],
            "is_admin": bool(chat.is_group and (chat.created_by_id == user.id
                                                or chat.admins.filter(id=user.id).exists())),
            "blocked_by_me": False,
            "blocked_me": False,
        }
        if not chat.is_group:
            other = other_user(chat, user)
            if other:
                data["blocked_by_me"] = Block.objects.filter(blocker=user, blocked=other).exists()
                data["blocked_me"] = Block.objects.filter(blocker=other, blocked=user).exists()
        return Response(data)

    # ------------------------------------------------ pin / mute
    @action(detail=False, methods=['post'], url_path='settings')
    def chat_settings(self, request):
        chat = resolve_chat(request.user, request.data)
        s = chat_setting(request.user, chat)
        if 'is_pinned' in request.data:
            s.is_pinned = to_bool(request.data.get('is_pinned'))
        if 'is_muted' in request.data:
            s.is_muted = to_bool(request.data.get('is_muted'))
            s.muted_until = None
        if 'mute_hours' in request.data:           # 0 = unmute, -1 = until I unmute, N = N hours
            hours = to_int(request.data.get('mute_hours'))
            if hours is None or hours < -1 or hours > 24 * 365:
                return Response({"error": "Invalid mute time"}, status=400)
            s.is_muted = hours != 0
            s.muted_until = timezone.now() + timedelta(hours=hours) if hours > 0 else None
        if 'is_archived' in request.data:
            s.is_archived = to_bool(request.data.get('is_archived'))
        s.save()
        return Response({"is_pinned": s.is_pinned, "is_muted": effective_muted(s),
                         "muted_until": s.muted_until, "is_archived": s.is_archived})

    # ------------------------------------------------ secure chat lock
    @action(detail=False, methods=['post'])
    def lock(self, request):
        """Set / change / remove the PIN. pin='' removes it. Changing needs old_pin."""
        chat = resolve_chat(request.user, request.data)
        s = chat_setting(request.user, chat)
        pin = str(request.data.get('pin') or '')
        if s.pin_hash:
            verify_pin(s, request.data.get('old_pin'))
        if pin == '':
            s.pin_hash = ''
            s.unlocked_until = None
        else:
            if not (pin.isdigit() and len(pin) == 4):
                return Response({"error": "PIN must be exactly 4 digits"}, status=400)
            s.pin_hash = make_password(pin)
            s.unlocked_until = timezone.now() + timedelta(minutes=UNLOCK_MINUTES)
        s.failed_attempts = 0
        s.blocked_until = None
        s.save()
        return Response({"is_locked": bool(s.pin_hash)})

    @action(detail=False, methods=['post'])
    def unlock(self, request):
        chat = resolve_chat(request.user, request.data)
        s = chat_setting(request.user, chat)
        if s.pin_hash:
            verify_pin(s, request.data.get('pin'))
        s.unlocked_until = timezone.now() + timedelta(minutes=UNLOCK_MINUTES)
        s.save(update_fields=['unlocked_until'])
        return Response({"ok": True})

    @action(detail=False, methods=['post'])
    def relock(self, request):
        chat = resolve_chat(request.user, request.data)
        ChatUserSetting.objects.filter(user=request.user, chat=chat).update(unlocked_until=None)
        return Response({"ok": True})

    # ------------------------------------------------ disappearing / theme
    @action(detail=False, methods=['post'])
    def disappearing(self, request):
        user = request.user
        chat = resolve_chat(user, request.data)
        ensure_unlocked(user, chat)
        seconds = to_int(request.data.get('seconds'))
        if seconds is None or seconds < 0 or seconds > 60 * 60 * 24 * 90:
            return Response({"error": "Invalid duration"}, status=400)
        chat.disappearing_time = seconds
        chat.disappearing_started_at = timezone.now() if seconds > 0 else None
        chat.save(update_fields=['disappearing_time', 'disappearing_started_at'])
        text = (f"{user.username} turned on disappearing messages: {human_duration(seconds)}"
                if seconds > 0 else f"{user.username} turned off disappearing messages")
        other = None if chat.is_group else other_user(chat, user)
        msg = Message.objects.create(chat=chat, sender=user, receiver=other,
                                     message_type='system', content=text)
        notify_chat(chat, 'chat_updated')
        notify_message(chat, msg, 'new')
        return Response({"disappearing_time": seconds})

    @action(detail=False, methods=['post'])
    def theme(self, request):
        chat = resolve_chat(request.user, request.data)
        theme = request.data.get('theme')
        if theme not in CHAT_THEMES:
            return Response({"error": "Unknown theme"}, status=400)
        chat.theme = theme
        chat.save(update_fields=['theme'])
        notify_chat(chat, 'chat_updated')
        return Response({"theme": theme})

    # ------------------------------------------------ groups
    @action(detail=False, methods=['post'])
    def create_group(self, request):
        group_name = (request.data.get('group_name') or '').strip()
        participant_ids = request.data.get('participants', [])
        if not isinstance(participant_ids, list):
            participant_ids = [participant_ids]
        ids = [to_int(p) for p in participant_ids if to_int(p)]
        if not group_name or not ids:
            return Response({"error": "Group name and at least one friend required!"}, status=400)

        chat = Chat.objects.create(is_group=True, group_name=group_name, created_by=request.user)
        chat.participants.add(request.user)
        chat.participants.add(*CustomUser.objects.filter(id__in=ids))
        notify_chat(chat, 'chat_updated')
        return Response({"status": "Group Created Successfully!", "chat_id": chat.id})

    @action(detail=True, methods=['post'])
    def leave_group(self, request, pk=None):
        chat = self.get_object()
        if not chat.is_group:
            return Response({"error": "Not a group"}, status=400)
        chat.participants.remove(request.user)
        remaining = chat.participants.first()
        if remaining is None:
            chat.delete()
        else:
            if chat.created_by_id == request.user.id:
                chat.created_by = remaining
                chat.save(update_fields=['created_by'])
            notify_chat(chat, 'chat_updated')
        return Response({"status": "Left group successfully"})

    @action(detail=True, methods=['post'])
    def clear_chat(self, request, pk=None):
        """Clear for ME only (works for groups and 1:1).
        keep_starred=true keeps my starred messages; keep_ids=[...] keeps those messages (the pinned one)."""
        chat = self.get_object()
        through = Message.hidden_for.through
        qs = Message.objects.filter(chat=chat).exclude(hidden_for=request.user)
        if to_bool(request.data.get('keep_starred')):
            qs = qs.exclude(starred_by=request.user)
        raw_keep = request.data.get('keep_ids')
        keep = [int(i) for i in raw_keep if str(i).isdigit()] if isinstance(raw_keep, (list, tuple)) else []
        if keep:
            qs = qs.exclude(id__in=keep)
        ids = list(qs.values_list('id', flat=True))
        through.objects.bulk_create(
            [through(message_id=i, customuser_id=request.user.id) for i in ids], ignore_conflicts=True)
        return Response({"status": "Chat cleared for you"})

    def destroy(self, request, *args, **kwargs):
        chat = self.get_object()
        if not chat.is_group:
            return Response({"error": "Only groups can be deleted"}, status=400)
        if chat.created_by_id and chat.created_by_id != request.user.id:
            raise PermissionDenied("Only the group creator can delete the group.")
        notify_chat(chat, 'chat_updated')
        chat.delete()
        return Response({"status": "Group deleted successfully"})


# ============================================================== requests
class ChatRequestViewSet(viewsets.ModelViewSet):
    serializer_class = ChatRequestSerializer
    queryset = ChatRequest.objects.all()
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'patch', 'put', 'delete', 'head', 'options']

    def get_queryset(self):
        user = self.request.user
        return ChatRequest.objects.filter(Q(receiver=user) | Q(sender=user))

    def create(self, request, *args, **kwargs):
        sender = request.user
        receiver_id = to_int(request.data.get('receiver'))
        if receiver_id is None:
            return Response({"error": "Missing ID!"}, status=400)
        if sender.id == receiver_id:
            return Response({"error": "Neeye unaku anuppa mudiyaathu!"}, status=400)
        if not CustomUser.objects.filter(id=receiver_id).exists():
            return Response({"error": "User not found!"}, status=404)
        if blocked_between(sender.id, receiver_id):
            return Response({"error": "You can't send a request to this user."}, status=403)

        existing = ChatRequest.objects.filter(
            Q(sender=sender, receiver_id=receiver_id) | Q(sender_id=receiver_id, receiver=sender))
        if existing.filter(status='accepted').exists():
            return Response({"error": "Already connected!"}, status=400)
        if existing.filter(status='pending').exists():
            return Response({"error": "Request already pending!"}, status=400)
        existing.filter(status='declined').delete()

        chat_req = ChatRequest.objects.create(sender=sender, receiver_id=receiver_id, status='pending')
        notify_users([receiver_id], 'request', action='new', from_name=sender.username, from_id=sender.id)
        send_push([receiver_id], sender.username, 'sent you a friend request', {'type': 'request'})
        return Response(self.get_serializer(chat_req).data, status=201)

    def destroy(self, request, *args, **kwargs):
        """The sender can take back a request that is still pending (like "Requested" -> cancel)."""
        req = self.get_object()
        if req.sender_id != request.user.id or req.status != 'pending':
            raise PermissionDenied("Only your own pending request can be cancelled.")
        receiver_id = req.receiver_id
        req.delete()
        notify_users([receiver_id, request.user.id], 'request', action='cancel')
        return Response(status=204)

    def update(self, request, *args, **kwargs):
        req = self.get_object()
        if req.receiver_id != request.user.id:
            raise PermissionDenied("Only the receiver can answer a request.")
        new_status = request.data.get('status')
        if new_status not in ('accepted', 'declined'):
            raise ValidationError({"error": "status must be accepted or declined"})
        req.status = new_status
        req.save(update_fields=['status'])
        notify_users([req.sender_id, req.receiver_id], 'friends_changed')
        if new_status == 'accepted':
            send_push([req.sender_id], request.user.username, 'accepted your friend request', {'type': 'request'})
        return Response(self.get_serializer(req).data)


# ============================================================== messages
class MessageViewSet(viewsets.ModelViewSet):
    serializer_class = MessageSerializer
    queryset = Message.objects.all()
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        user = self.request.user
        base = (Message.objects.select_related('sender', 'receiver', 'chat', 'status_ref__user')
                .prefetch_related('read_by', 'starred_by', 'poll__options__votes', 'whisper_to', 'expense__shares__user'))

        if self.action != 'list':
            return base.filter(Q(sender=user) | Q(receiver=user) | Q(chat__participants=user)).distinct()

        receiver_id = to_int(self.request.query_params.get('receiver'))
        chat_id = to_int(self.request.query_params.get('chat'))

        if chat_id:
            chat = get_object_or_404(Chat, id=chat_id, participants=user)
            ensure_unlocked(user, chat)
            purge_expired(chat)
            return visible_to(base.filter(chat=chat), user).order_by('created_at')

        if receiver_id:
            chat = get_direct_chat(user, receiver_id)
            if chat:
                ensure_unlocked(user, chat)
                purge_expired(chat)
            qs = base.filter(Q(sender=user, receiver_id=receiver_id) |
                             Q(sender_id=receiver_id, receiver=user))
            return visible_to(qs, user).order_by('created_at')

        return Message.objects.none()

    # ----------------------------------------------------------- create
    def _file_extras(self):
        extra = {}
        for key in ('file_url', 'voice_note'):
            f = self.request.FILES.get(key)
            if not f:
                continue
            if f.size > MAX_UPLOAD:
                raise ValidationError({"error": "File too large (max 25 MB)"})
            if os.path.splitext(f.name)[1].lower() in BLOCKED_EXT:
                raise ValidationError({"error": "This file type is not allowed"})
            if key == 'file_url':
                ct = f.content_type or ''
                extra['file_name'] = f.name[:255]
                extra['file_size'] = f.size
                if self.request.data.get('message_type') != 'location':
                    extra['message_type'] = ('image' if ct.startswith('image') else
                                             'video' if ct.startswith('video') else
                                             'audio' if ct.startswith('audio') else 'document')
        return extra

    def _whisper_ids(self):
        data = self.request.data
        raw = data.getlist('whisper_to') if hasattr(data, 'getlist') else (data.get('whisper_to') or [])
        out = []
        for x in raw:
            for part in str(x).split(','):
                i = to_int(part.strip())
                if i:
                    out.append(i)
        return out

    def perform_create(self, serializer):
        user = self.request.user
        chat_id = to_int(self.request.data.get('chat'))
        receiver_id = to_int(self.request.data.get('receiver'))
        extra = self._file_extras()
        from .plus import parse_unlock_at                      # time capsule (optional)
        unlock_at = parse_unlock_at(self.request.data.get('unlock_at'))
        if unlock_at:
            extra['unlock_at'] = unlock_at
        whisper_ids = self._whisper_ids()

        if chat_id:
            chat = get_object_or_404(Chat, id=chat_id, participants=user)
            ensure_unlocked(user, chat)
            msg = serializer.save(sender=user, chat=chat, **extra)
        elif receiver_id:
            receiver = get_object_or_404(CustomUser, id=receiver_id)
            if not are_friends(user, receiver.id):
                raise PermissionDenied("You are not connected with this user.")
            if blocked_between(user.id, receiver.id):
                raise PermissionDenied("You can't message this user.")
            chat = get_or_create_direct_chat(user, receiver)
            ensure_unlocked(user, chat)
            msg = serializer.save(sender=user, chat=chat, receiver=receiver,
                                  status='delivered' if receiver.is_online else 'sent', **extra)
        else:
            raise ValidationError({"error": "'chat' or 'receiver' is required"})
        if whisper_ids and chat.is_group:
            members = set(chat.participants.values_list('id', flat=True))
            chosen = (set(whisper_ids) & members) - {user.id}
            if chosen:
                msg.whisper_to.set(chosen)
                msg.whisper_to.add(user)                       # the sender keeps seeing their own whisper
        notify_message(chat, msg, 'new')

    # ----------------------------------------------- update / delete flags
    def update(self, request, *args, **kwargs):
        msg = self.get_object()
        user = request.user
        data = request.data
        if not set(data.keys()) <= {'is_deleted', 'deleted_for_sender', 'deleted_for_receiver'}:
            raise ValidationError({"error": "Only delete flags can be edited"})
        if ('is_deleted' in data or 'deleted_for_sender' in data) and msg.sender_id != user.id:
            raise PermissionDenied("Only the sender can do that.")
        if 'deleted_for_receiver' in data and msg.receiver_id != user.id:
            raise PermissionDenied("Only the receiver can do that.")
        kwargs['partial'] = True
        response = super().update(request, *args, **kwargs)
        if 'is_deleted' in data:
            notify_message(msg.chat, msg, 'delete')
        return response

    def destroy(self, request, *args, **kwargs):
        msg = self.get_object()
        if request.user.id not in (msg.sender_id, msg.receiver_id):
            raise PermissionDenied("Not your message.")
        chat, mid = msg.chat, msg.id
        response = super().destroy(request, *args, **kwargs)
        notify_message(chat, msg, 'delete', message_id=mid)
        return response

    @action(detail=True, methods=['post'])
    def hide(self, request, pk=None):
        """Delete for me (works for 1:1 and groups)."""
        msg = self.get_object()
        msg.hidden_for.add(request.user)
        return Response({"status": "hidden"})

    # ----------------------------------------------------------- read
    @action(detail=False, methods=['post'])
    def mark_as_read(self, request):
        sender_id = to_int(request.data.get('sender_id'))
        if sender_id:
            updated = Message.objects.filter(
                sender_id=sender_id, receiver=request.user).exclude(status='read').update(status='read')
            if updated and request.user.read_receipts:
                notify_users([sender_id], 'read', reader_id=request.user.id)
        return Response({"status": "read updated"})

    @action(detail=False, methods=['post'])
    def mark_group_read(self, request):
        chat = get_object_or_404(Chat, id=to_int(request.data.get('chat_id')),
                                 is_group=True, participants=request.user)
        ids = list(Message.objects.filter(chat=chat).exclude(sender=request.user)
                   .exclude(read_by=request.user).values_list('id', flat=True))
        if ids:
            through = Message.read_by.through
            through.objects.bulk_create(
                [through(message_id=i, customuser_id=request.user.id) for i in ids], ignore_conflicts=True)
            notify_chat(chat, 'group_read', reader_id=request.user.id)
        return Response({"marked": len(ids)})

    # ----------------------------------------------------------- react / edit / forward / search
    @action(detail=True, methods=['post'])
    def react(self, request, pk=None):
        msg = self.get_object()
        emoji = request.data.get('emoji')
        if not emoji:
            return Response({"error": "No emoji provided"}, status=400)
        reactions = dict(msg.reactions or {})
        uid = str(request.user.id)
        if reactions.get(uid) == emoji:
            reactions.pop(uid)
        else:
            reactions[uid] = emoji
        msg.reactions = reactions
        msg.save(update_fields=['reactions'])
        notify_message(msg.chat, msg, 'update')
        return Response({"status": "reaction updated", "reactions": msg.reactions})

    @action(detail=True, methods=['post'])
    def edit(self, request, pk=None):
        msg = self.get_object()
        if msg.sender_id != request.user.id:
            raise PermissionDenied("You can only edit your own messages.")
        if msg.message_type != 'text' or msg.is_deleted or (msg.content or '').startswith('[VIEW_ONCE]'):
            return Response({"error": "This message can't be edited"}, status=400)
        if timezone.now() - msg.created_at > EDIT_WINDOW:
            return Response({"error": "Edit window (5 minutes) is over"}, status=400)
        content = (request.data.get('content') or '').strip()
        if not content:
            return Response({"error": "Message cannot be empty"}, status=400)
        msg.content = content
        msg.edited_at = timezone.now()
        msg.save(update_fields=['content', 'edited_at'])
        notify_message(msg.chat, msg, 'update')
        return Response(self.get_serializer(msg).data)

    @action(detail=True, methods=['post'])
    def forward(self, request, pk=None):
        src = self.get_object()
        user = request.user
        if src.message_type == 'system' or (src.content or '').startswith('[VIEW_ONCE]') or src.is_deleted:
            return Response({"error": "This message can't be forwarded"}, status=400)
        targets = request.data.get('targets') or []
        if not isinstance(targets, list) or not targets:
            return Response({"error": "Pick at least one chat"}, status=400)

        sent = 0
        for t in targets[:10]:
            try:
                chat = resolve_chat(user, t)
                ensure_unlocked(user, chat, extend=False)
            except (ValidationError, PermissionDenied, ChatLocked, Exception):
                continue
            other = None if chat.is_group else other_user(chat, user)
            if other and blocked_between(user.id, other.id):
                continue
            new = Message(chat=chat, sender=user, receiver=other, message_type=src.message_type,
                          content=src.content, file_name=src.file_name, file_size=src.file_size,
                          forwarded=True)
            if src.file_url:
                new.file_url = src.file_url
            if src.voice_note:
                new.voice_note = src.voice_note
            new.save()
            notify_message(chat, new, 'new')
            sent += 1
        return Response({"forwarded_to": sent})

    @action(detail=False, methods=['get'])
    def search(self, request):
        q = (request.query_params.get('q') or '').strip()
        if not q:
            return Response([])
        chat = resolve_chat(request.user, request.query_params)
        ensure_unlocked(request.user, chat)
        qs = (visible_to(Message.objects.filter(chat=chat), request.user)
              .filter(content__icontains=q)
              .exclude(content__startswith='[VIEW_ONCE]').exclude(message_type='system')
              .select_related('sender', 'chat').prefetch_related('read_by')
              .order_by('-created_at')[:50])
        return Response(self.get_serializer(qs, many=True).data)

    @action(detail=False, methods=['post'])
    def screenshot_alert(self, request):
        receiver_id = to_int(request.data.get('receiver_id'))
        if not receiver_id or not are_friends(request.user, receiver_id):
            return Response({"error": "Receiver missing"}, status=400)
        chat = get_direct_chat(request.user, receiver_id)
        msg = Message.objects.create(
            sender=request.user, receiver_id=receiver_id, chat=chat,
            is_screenshot=True, content="📸 Took a screenshot!")
        notify_message(chat, msg, 'new')
        return Response({"status": "alert sent"})


# ================================================================ status
AUDIO_EXTS = {'mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac', 'weba'}
MAX_MUSIC_BYTES = 12 * 1024 * 1024
from .music import clean_music_url, clean_text      # noqa: E402


class StatusViewSet(viewsets.ModelViewSet):
    queryset = Status.objects.all()
    serializer_class = StatusSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    # ---- who can see what -------------------------------------------------
    def get_queryset(self):
        user = self.request.user
        Status.objects.filter(created_at__lt=timezone.now() - timedelta(hours=24)).delete()

        friends = set(friend_ids_of(user))
        for a, b in Block.objects.filter(Q(blocker=user) | Q(blocked=user)).values_list('blocker_id', 'blocked_id'):
            friends.discard(a)
            friends.discard(b)

        qs = Status.objects.filter(
            Q(user=user)                                                      # my own
            | Q(user_id__in=friends, privacy='all')                           # friends: public
            | Q(user_id__in=friends, privacy='close',
                user__close_friends__friend=user)                             # only if I am in THEIR close list
            | Q(user_id__in=friends, privacy='only', privacy_users=user)      # "only share with" - I was picked
            | (Q(user_id__in=friends, privacy='except') & ~Q(privacy_users=user))   # "all except" - I was not excluded
        ).distinct()
        return qs.select_related('user').prefetch_related('views__viewer').order_by('created_at')

    # ---- create (caption + privacy) --------------------------------------
    def perform_create(self, serializer):
        user = self.request.user
        f = self.request.FILES.get('media_file')
        media_type = 'video' if f and (f.content_type or '').startswith('video') else 'image'
        privacy = self.request.data.get('privacy') or 'all'
        if privacy not in ('all', 'close', 'except', 'only'):
            raise ValidationError({"error": "Invalid privacy option"})
        caption = (self.request.data.get('caption') or '').strip()[:300]

        friends = set(friend_ids_of(user))
        raw = self.request.data.getlist('privacy_ids') if hasattr(self.request.data, 'getlist') else self.request.data.get('privacy_ids') or []
        picked = set()
        for x in raw:
            for part in str(x).split(','):
                i = to_int(part.strip())
                if i in friends:
                    picked.add(i)

        if privacy == 'close':
            audience = set(CloseFriend.objects.filter(owner=user).values_list('friend_id', flat=True)) & friends
            if not audience:
                raise ValidationError({"error": "Your Close Friends list is empty. Add some friends first."})
        elif privacy == 'only':
            audience = picked
            if not audience:
                raise ValidationError({"error": "Pick at least one friend to share with."})
        elif privacy == 'except':
            audience = friends - picked
        else:
            audience = friends

        # optional song (photo statuses only): an audio file from the phone
        music = self.request.FILES.get('music_file')
        music_kwargs = {"music_file": None, "music_title": "", "music_artist": "", "music_url": ""}
        picked_url = clean_music_url(self.request.data.get('music_url'))     # a song chosen from the search
        if picked_url and media_type == 'image' and not music:
            music_kwargs = {"music_file": None, "music_url": picked_url,
                            "music_title": clean_text(self.request.data.get('music_title'), 80) or 'Song',
                            "music_artist": clean_text(self.request.data.get('music_artist'), 60)}
        if music and media_type == 'image':
            ext = (music.name.rsplit('.', 1)[-1] if '.' in music.name else '').lower()
            if not ((music.content_type or '').startswith('audio') or ext in AUDIO_EXTS):
                raise ValidationError({"error": "Please choose an audio file for the song."})
            if music.size > MAX_MUSIC_BYTES:
                raise ValidationError({"error": "That song is too big (max 12 MB)."})
            title = (self.request.data.get('music_title') or '').strip()[:80]
            if not title:
                title = music.name.rsplit('.', 1)[0].replace('_', ' ').strip()[:80] or 'Song'
            music_kwargs = {"music_file": music, "music_url": "", "music_title": title,
                            "music_artist": clean_text(self.request.data.get('music_artist'), 60)}

        st = serializer.save(user=user, media_type=media_type, privacy=privacy, caption=caption, **music_kwargs)
        if privacy in ('only', 'except'):
            st.privacy_users.set(picked)
        notify_users(list(audience), 'status')

    def perform_update(self, serializer):
        if serializer.instance.user_id != self.request.user.id:
            raise PermissionDenied("Not your status.")
        serializer.save()

    def perform_destroy(self, instance):
        if instance.user_id != self.request.user.id:
            raise PermissionDenied("Not your status.")
        instance.delete()

    # ---- helpers ----------------------------------------------------------
    def _my_view_row(self, st, user):
        row, created = StatusView.objects.get_or_create(status=st, viewer=user)
        return row, created

    def _chat_note(self, st, user, text):
        """Drop a message into the status owner's chat (used for reactions and replies).
        The message keeps a link to the status, so the chat can show a small preview of it."""
        chat = get_or_create_direct_chat(user, st.user)
        msg = Message.objects.create(chat=chat, sender=user, receiver=st.user, content=text, status_ref=st)
        notify_message(chat, msg, 'new')      # live event + phone push (= the notification)
        return msg

    def _drop_reaction_note(self, row):
        """Remove the viewer's previous reaction line, so the chat only ever shows the LATEST one."""
        old = row.reaction_message
        if not old:
            return
        chat, mid = old.chat, old.id
        row.reaction_message = None
        row.save(update_fields=['reaction_message'])
        old.delete()
        notify_message(chat, old, 'delete', message_id=mid)

    def _status_label(self, st):
        cap = f" - {st.caption[:40]}" if st.caption else ''
        return f"{st.media_type}{cap}"

    # ---- viewed -----------------------------------------------------------
    @action(detail=True, methods=['post'])
    def view(self, request, pk=None):
        st = self.get_object()
        if st.user_id != request.user.id:
            _, created = self._my_view_row(st, request.user)
            if created:
                notify_users([st.user_id], 'status_view', status_id=st.id)
        return Response({"status": "viewed"})

    # ---- like (toggle) ----------------------------------------------------
    @action(detail=True, methods=['post'])
    def like(self, request, pk=None):
        st = self.get_object()
        user = request.user
        if st.user_id == user.id:
            return Response({"error": "You can't like your own status"}, status=400)
        row, _ = self._my_view_row(st, user)
        row.liked = not row.liked
        row.save(update_fields=['liked'])
        if row.liked:
            # a like is only a notification - it is NOT added to the chat
            title = user.username
            body = f"❤️ Liked your status ({self._status_label(st)})"
            notify_users([st.user_id], 'status_like', status_id=st.id, title=title, body=body)
            send_push([st.user_id], title, body, {"status_id": st.id})
        notify_users([st.user_id], 'status_view', status_id=st.id)
        return Response({"liked": row.liked})

    # ---- emoji reaction (tap same emoji again = remove) -------------------
    @action(detail=True, methods=['post'])
    def react(self, request, pk=None):
        st = self.get_object()
        user = request.user
        emoji = (request.data.get('emoji') or '').strip()
        if not emoji or len(emoji) > 8:
            return Response({"error": "Invalid emoji"}, status=400)
        if st.user_id == user.id:
            return Response({"error": "You can't react to your own status"}, status=400)
        row, _ = self._my_view_row(st, user)
        row.reaction = '' if row.reaction == emoji else emoji
        row.save(update_fields=['reaction'])
        # always remove the older reaction line first -> the chat keeps only the latest reaction
        self._drop_reaction_note(row)
        if row.reaction:
            msg = self._chat_note(st, user, f"{row.reaction} Reacted to your status")
            row.reaction_message = msg
            row.save(update_fields=['reaction_message'])
        notify_users([st.user_id], 'status_view', status_id=st.id)
        return Response({"reaction": row.reaction})

    # ---- text reply -> goes to the owner's chat ---------------------------
    @action(detail=True, methods=['post'])
    def reply(self, request, pk=None):
        st = self.get_object()
        user = request.user
        text = (request.data.get('content') or '').strip()
        if not text:
            return Response({"error": "Reply cannot be empty"}, status=400)
        if st.user_id == user.id:
            return Response({"error": "You can't reply to your own status"}, status=400)
        if blocked_between(user.id, st.user_id):
            raise PermissionDenied("You can't message this user.")
        self._my_view_row(st, user)
        self._chat_note(st, user, text)
        return Response({"status": "reply sent"})

    # ---- Close Friends list (GET = my list, POST {ids:[..]} = save) -------
    @action(detail=False, methods=['get', 'post'], url_path='close_friends')
    def close_friends(self, request):
        user = request.user
        friends = set(friend_ids_of(user))
        if request.method == 'POST':
            raw = request.data.get('ids', [])
            if not isinstance(raw, list):
                raw = [raw]
            ids = {to_int(i) for i in raw if to_int(i)} & friends
            CloseFriend.objects.filter(owner=user).exclude(friend_id__in=ids).delete()
            for fid in ids:
                CloseFriend.objects.get_or_create(owner=user, friend_id=fid)
        current = list(CloseFriend.objects.filter(owner=user, friend_id__in=friends)
                       .values_list('friend_id', flat=True))
        return Response({"ids": sorted(current)})


# ================================================================= calls
class CallViewSet(viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = CallHistorySerializer

    def get_queryset(self):
        u = self.request.user
        return CallHistory.objects.filter(Q(caller=u) | Q(receiver=u)).select_related('caller', 'receiver')

    def _data(self, call):
        return CallHistorySerializer(call, context={'request': self.request}).data

    def list(self, request):
        expire_stale_calls()
        return Response(self.get_serializer(self.get_queryset().order_by('-started_at')[:100], many=True).data)

    @action(detail=False, methods=['post'])
    def start(self, request):
        user = request.user
        receiver = get_object_or_404(CustomUser, id=to_int(request.data.get('receiver_id')))
        call_type = request.data.get('call_type', 'audio')
        if call_type not in ('audio', 'video'):
            return Response({"error": "Invalid call type"}, status=400)
        if not are_friends(user, receiver.id):
            raise PermissionDenied("You are not connected with this user.")
        if blocked_between(user.id, receiver.id):
            raise PermissionDenied("You can't call this user.")
        expire_stale_calls()
        call = CallHistory.objects.create(caller=user, receiver=receiver, call_type=call_type)
        send_to_user(receiver.id, {
            "event": "call_incoming", "call_id": call.id, "room_id": f"call_{call.id}",
            "caller_id": user.id, "caller_name": user.username, "call_type": call_type, "is_group": False,
        })
        return Response(self._data(call), status=201)

    @action(detail=False, methods=['post'])
    def start_group(self, request):
        user = request.user
        chat = get_object_or_404(Chat, id=to_int(request.data.get('chat_id')),
                                 is_group=True, participants=user)
        call_type = request.data.get('call_type', 'audio')
        room_id = f"group_room_{chat.id}"
        others = chat.participants.exclude(id=user.id).values_list('id', flat=True)
        notify_users(others, 'call_incoming', call_id=None, room_id=room_id, caller_id=user.id,
                     caller_name=user.username, call_type=call_type, is_group=True,
                     group_name=chat.group_name, chat_id=chat.id)
        return Response({"room_id": room_id, "group_name": chat.group_name})

    def _finish(self, call, status, who_to_notify, event):
        now = timezone.now()
        call.status = status
        call.ended_at = now
        if status == 'completed' and call.answered_at:
            call.duration = int((now - call.answered_at).total_seconds())
        call.save()
        notify_users([who_to_notify], event, call_id=call.id)

    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        call = self.get_object()
        if call.receiver_id != request.user.id or call.status != 'ringing':
            return Response({"error": "Call is no longer available"}, status=400)
        call.status = 'ongoing'
        call.answered_at = timezone.now()
        call.save()
        notify_users([call.caller_id], 'call_accepted', call_id=call.id)
        return Response(self._data(call))

    @action(detail=True, methods=['post'])
    def decline(self, request, pk=None):
        call = self.get_object()
        if call.receiver_id == request.user.id and call.status == 'ringing':
            self._finish(call, 'declined', call.caller_id, 'call_declined')
        return Response(self._data(call))

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        call = self.get_object()
        if call.caller_id == request.user.id and call.status == 'ringing':
            self._finish(call, 'missed', call.receiver_id, 'call_cancelled')
        return Response(self._data(call))

    @action(detail=True, methods=['post'])
    def end(self, request, pk=None):
        call = self.get_object()
        me = request.user.id
        peer = call.receiver_id if call.caller_id == me else call.caller_id
        if call.status == 'ongoing':
            self._finish(call, 'completed', peer, 'call_ended')
        elif call.status == 'ringing' and call.caller_id == me:
            self._finish(call, 'missed', peer, 'call_cancelled')
        return Response(self._data(call))