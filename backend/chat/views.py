import os
from datetime import timedelta

from django.contrib.auth.hashers import check_password, make_password
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
    CallHistory, Block,
)
from .serializers import (
    UserSerializer, ChatSerializer, MessageSerializer, ChatRequestSerializer,
    StatusSerializer, CallHistorySerializer,
)
from .realtime import notify_users, send_to_user

UNLOCK_MINUTES = 10
MAX_UPLOAD = 25 * 1024 * 1024
BLOCKED_EXT = {'.exe', '.bat', '.cmd', '.sh', '.msi', '.js', '.vbs', '.scr', '.jar', '.apk', '.com', '.ps1'}
CHAT_THEMES = {'default', 'ocean', 'forest', 'rose', 'midnight', 'light'}
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
    if c.startswith('[VIEW_ONCE]'):
        return '💣 View once message'
    t = msg.message_type
    if t == 'system':
        return c[:80]
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
    """Push a live 'message' event to everybody in the chat (muted/locked aware)."""
    if not chat:
        return
    members = list(chat.participants.values_list('id', flat=True))
    sets = {s.user_id: s for s in ChatUserSetting.objects.filter(chat=chat, user_id__in=members)}
    preview = message_preview(msg)
    title = f"{msg.sender.username} • {chat.group_name}" if chat.is_group else msg.sender.username
    for uid in members:
        s = sets.get(uid)
        send_to_user(uid, {
            "event": "message", "action": action, "chat_id": chat.id, "is_group": chat.is_group,
            "message_id": message_id or msg.id, "sender_id": msg.sender_id,
            "sender_name": msg.sender.username, "title": title, "mine": uid == msg.sender_id,
            "body": 'New message' if (s and s.pin_hash) else preview,
            "muted": bool(s and s.is_muted),
        })


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

        for u in data:
            u['unread_count'] = unread_map.get(u['id'], 0)
            u['is_locked'] = u['id'] in locked_ids
            u['is_blocked'] = u['id'] in i_blocked
            if u['id'] in blocked_me:                      # a blocker can't be tracked
                u['is_online'] = False
                u['typing_with'] = None
                u['last_seen'] = None
        return Response(data)

    def retrieve(self, request, *args, **kwargs):
        user = self.get_object()
        data = self.get_serializer(user).data
        if Block.objects.filter(blocker=user, blocked=request.user).exists():
            data['is_online'] = False
            data['typing_with'] = None
            data['last_seen'] = None
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
                "is_muted": bool(s and s.is_muted),
                "is_locked": locked,
                "disappearing_time": chat.disappearing_time,
                "theme": chat.theme,
            }
            if chat.is_group:
                row.update({"group_name": chat.group_name, "member_count": len(chat.participants.all())})
                groups.append(row)
            else:
                row["friend_id"] = other.id
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
            "is_muted": s.is_muted,
            "participants": [{"id": p.id, "username": p.username} for p in chat.participants.all()],
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
        s.save()
        return Response({"is_pinned": s.is_pinned, "is_muted": s.is_muted})

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
        """Clear for ME only (works for groups and 1:1)."""
        chat = self.get_object()
        through = Message.hidden_for.through
        ids = list(Message.objects.filter(chat=chat).exclude(hidden_for=request.user)
                   .values_list('id', flat=True))
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
        notify_users([receiver_id], 'request')
        return Response(self.get_serializer(chat_req).data, status=201)

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
        return Response(self.get_serializer(req).data)


# ============================================================== messages
class MessageViewSet(viewsets.ModelViewSet):
    serializer_class = MessageSerializer
    queryset = Message.objects.all()
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        user = self.request.user
        base = Message.objects.select_related('sender', 'chat').prefetch_related('read_by')

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

    def perform_create(self, serializer):
        user = self.request.user
        chat_id = to_int(self.request.data.get('chat'))
        receiver_id = to_int(self.request.data.get('receiver'))
        extra = self._file_extras()

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
            if updated:
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
class StatusViewSet(viewsets.ModelViewSet):
    queryset = Status.objects.all()
    serializer_class = StatusSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        user = self.request.user
        Status.objects.filter(created_at__lt=timezone.now() - timedelta(hours=24)).delete()
        visible = friend_ids_of(user) | {user.id}
        return (Status.objects.filter(user_id__in=visible)
                .select_related('user').prefetch_related('views__viewer').order_by('-created_at'))

    def perform_create(self, serializer):
        f = self.request.FILES.get('media_file')
        media_type = 'video' if f and (f.content_type or '').startswith('video') else 'image'
        serializer.save(user=self.request.user, media_type=media_type)
        notify_users(friend_ids_of(self.request.user), 'status')

    def perform_update(self, serializer):
        if serializer.instance.user_id != self.request.user.id:
            raise PermissionDenied("Not your status.")
        serializer.save()

    def perform_destroy(self, instance):
        if instance.user_id != self.request.user.id:
            raise PermissionDenied("Not your status.")
        instance.delete()

    @action(detail=True, methods=['post'])
    def view(self, request, pk=None):
        st = self.get_object()
        if st.user_id != request.user.id:
            _, created = StatusView.objects.get_or_create(status=st, viewer=request.user)
            if created:
                notify_users([st.user_id], 'status_view', status_id=st.id)
        return Response({"status": "viewed"})

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
        chat = get_or_create_direct_chat(user, st.user)
        msg = Message.objects.create(
            chat=chat, sender=user, receiver=st.user,
            content=f"↩️ Replied to your status ({st.media_type}): {text}")
        notify_message(chat, msg, 'new')
        return Response({"status": "reply sent"})


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
