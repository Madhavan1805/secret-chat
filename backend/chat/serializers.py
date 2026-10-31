from django.core.exceptions import ObjectDoesNotExist
from django.utils import timezone
from rest_framework import serializers
from .models import CustomUser, Chat, Message, ChatRequest, Status, CallHistory


def _abs(request, url):
    return request.build_absolute_uri(url) if request else url


class UserSerializer(serializers.ModelSerializer):
    is_admin = serializers.SerializerMethodField()
    mood = serializers.SerializerMethodField()
    birthday = serializers.SerializerMethodField()
    away = serializers.SerializerMethodField()

    def get_birthday(self, obj):
        return f"{obj.birthday_month:02d}-{obj.birthday_day:02d}" if obj.birthday_month and obj.birthday_day else None

    def get_away(self, obj):                           # only you see your own auto-reply
        req = self.context.get('request')
        if req and req.user.is_authenticated and req.user.id == obj.id and obj.auto_reply:
            return {"text": obj.auto_reply, "until": obj.auto_reply_until}
        return None

    def get_mood(self, obj):
        from .extras2 import mood_of
        return mood_of(obj)

    def get_is_admin(self, obj):                       # only ever true for yourself
        from .admin_api import is_admin
        req = self.context.get('request')
        return bool(req and req.user.is_authenticated and req.user.id == obj.id and is_admin(obj))

    class Meta:
        model = CustomUser
        fields = ['id', 'username', 'password', 'phone_number', 'profile_picture',
                  'bio', 'is_online', 'last_seen', 'typing_with', 'public_key', 'is_admin', 'mood', 'birthday', 'away']
        read_only_fields = ['is_online', 'last_seen', 'typing_with', 'is_admin', 'mood', 'birthday', 'away']
        extra_kwargs = {
            'password': {'write_only': True},
            'phone_number': {'required': False, 'allow_blank': True, 'allow_null': True},
        }

    def create(self, validated_data):
        phone = validated_data.get('phone_number') or None
        return CustomUser.objects.create_user(
            username=validated_data['username'],
            password=validated_data['password'],
            phone_number=phone,
            bio=validated_data.get('bio', 'Available'),
        )


RELOCK_AFTER_SECONDS = 30 * 60


class MessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source='sender.username', read_only=True)
    # only the SENDER of a group message gets the names of who has seen it
    read_by_names = serializers.SerializerMethodField()
    is_starred = serializers.SerializerMethodField()
    poll = serializers.SerializerMethodField()
    status_preview = serializers.SerializerMethodField()
    expense = serializers.SerializerMethodField()
    album = serializers.SerializerMethodField()
    live = serializers.SerializerMethodField()
    game = serializers.SerializerMethodField()
    whisper = serializers.SerializerMethodField()

    class Meta:
        model = Message
        exclude = ['hidden_for', 'starred_by', 'status_ref', 'whisper_to', 'unlock_notified']
        read_only_fields = ['sender', 'receiver', 'chat', 'status', 'reactions', 'is_screenshot', 'created_at',
                            'file_name', 'file_size', 'edited_at', 'forwarded', 'read_by', 'unlock_at', 'time_lock', 'time_lock_relock']

    def get_read_by_names(self, obj):
        request = self.context.get('request')
        if request and obj.sender_id == request.user.id and obj.chat_id and obj.chat and obj.chat.is_group:
            return [{"id": u.id, "username": u.username} for u in obj.read_by.all()]
        return []

    def get_is_starred(self, obj):
        request = self.context.get('request')
        if not request:
            return False
        return any(u.id == request.user.id for u in obj.starred_by.all())

    def get_poll(self, obj):
        if obj.message_type != 'poll':
            return None
        try:
            poll = obj.poll
        except ObjectDoesNotExist:
            return None
        request = self.context.get('request')
        me = request.user.id if request else None
        options, voters = [], set()
        for o in poll.options.all():
            ids = [v.user_id for v in o.votes.all()]
            voters.update(ids)
            row = {"id": o.id, "text": o.text, "votes": len(ids), "voted_by_me": me in ids}
            if poll.event_at:
                row["names"] = [v.user.username for v in o.votes.all()][:12]
            options.append(row)
        return {"question": poll.question, "multiple": poll.multiple, "closed": poll.closed,
                "options": options, "total_voters": len(voters),
                "event_at": poll.event_at, "event_place": poll.event_place}

    def get_live(self, obj):
        if obj.message_type != 'live':
            return None
        try:
            live = obj.live
        except ObjectDoesNotExist:
            return None
        from .extras3 import live_data
        return live_data(live)

    def get_game(self, obj):
        if obj.message_type != 'game':
            return None
        try:
            g = obj.game
        except ObjectDoesNotExist:
            return None
        request = self.context.get('request')
        from .extras3 import game_data
        return game_data(g, request.user.id if request else 0)

    def get_album(self, obj):
        if obj.message_type != 'album':
            return None
        try:
            a = obj.album
        except ObjectDoesNotExist:
            return None
        request = self.context.get('request')
        gone = a.purged or a.expires_at <= timezone.now()
        photos = [] if gone else [{"id": p.id, "url": request.build_absolute_uri(p.file.url) if request else p.file.url,
                                   "by": p.user.username} for p in a.photos.all()]
        return {"id": a.id, "title": a.title, "expires_at": a.expires_at, "expired": gone, "photos": photos}

    # ---- split expense
    def get_expense(self, obj):
        if obj.message_type != 'expense':
            return None
        try:
            e = obj.expense
        except ObjectDoesNotExist:
            return None
        shares = [{"user_id": s.user_id, "username": s.user.username, "amount": str(s.amount), "paid": s.paid}
                  for s in e.shares.all()]
        return {"id": e.id, "title": e.title, "amount": str(e.amount), "payer_id": e.payer_id,
                "payer_name": e.payer.username, "shares": shares}

    # ---- whisper: who it is for (everybody sees the names, only they can read it)
    def get_whisper(self, obj):
        users = list(obj.whisper_to.all())
        if not users:
            return None
        return {"to": [{"id": u.id, "username": u.username} for u in users]}

    def _is_masked(self, obj):
        """True when this viewer must not see the content yet: a closed time capsule, or someone else's whisper."""
        request = self.context.get('request')
        uid = request.user.id if request else None
        if obj.sender_id == uid:
            return None
        if obj.unlock_at and obj.unlock_at > timezone.now():
            return 'capsule'
        if any(True for _ in obj.whisper_to.all()) and not any(u.id == uid for u in obj.whisper_to.all()):
            return 'whisper'
        if obj.time_lock:
            open_now = False
            for t in obj.time_unlocks.all():
                if t.user_id == uid:
                    # "lock again" messages also close by themselves after a while, in case the app was killed
                    open_now = (not obj.time_lock_relock) or (timezone.now() - t.unlocked_at).total_seconds() < RELOCK_AFTER_SECONDS
            if not open_now:
                return 'timelock'
        return None

    def get_status_preview(self, obj):
        if not obj.status_ref_id:
            return None
        st = obj.status_ref
        request = self.context.get('request')
        url = None
        if st.media_file:
            url = request.build_absolute_uri(st.media_file.url) if request else st.media_file.url
        return {"id": st.id, "media_type": st.media_type, "media_file": url,
                "caption": st.caption, "owner": st.user.username, "created_at": st.created_at}

    def to_representation(self, instance):
        data = super().to_representation(instance)
        masked = self._is_masked(instance)
        if masked:
            for key in ('content', 'file_url', 'voice_note', 'file_name', 'file_size', 'status_preview', 'reply_to', 'expense', 'album', 'live', 'game'):
                if key in data:
                    data[key] = None if key != 'content' else ''
            data['masked'] = masked
        else:
            data['masked'] = None
        # the receiver switched "read receipts" off: the sender never gets the blue tick
        request = self.context.get('request')
        if (request and data.get('status') == 'read' and instance.sender_id == request.user.id
                and instance.receiver_id and not (instance.chat and instance.chat.is_group)):
            if instance.receiver and not instance.receiver.read_receipts:
                data['status'] = 'delivered'
        return data

    def validate(self, attrs):
        if attrs.get('message_type') == 'system':
            raise serializers.ValidationError("Invalid message type.")
        if self.instance is None and not (
            attrs.get('content') or attrs.get('file_url') or attrs.get('voice_note')
        ):
            raise serializers.ValidationError("Message cannot be empty.")
        return attrs


class ChatSerializer(serializers.ModelSerializer):
    class Meta:
        model = Chat
        exclude = ['chat_pin']


class ChatRequestSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source='sender.username', read_only=True)
    receiver_name = serializers.CharField(source='receiver.username', read_only=True)

    class Meta:
        model = ChatRequest
        fields = ['id', 'sender', 'sender_name', 'receiver', 'receiver_name', 'status', 'created_at']
        read_only_fields = ['sender', 'created_at']
        extra_kwargs = {'receiver': {'required': True}}


class StatusSerializer(serializers.ModelSerializer):
    username = serializers.ReadOnlyField(source='user.username')
    profile_picture = serializers.SerializerMethodField()
    view_count = serializers.SerializerMethodField()
    like_count = serializers.SerializerMethodField()
    viewers = serializers.SerializerMethodField()
    viewed_by_me = serializers.SerializerMethodField()
    liked_by_me = serializers.SerializerMethodField()
    my_reaction = serializers.SerializerMethodField()

    class Meta:
        model = Status
        fields = ['id', 'user', 'username', 'profile_picture', 'media_file', 'media_type',
                  'caption', 'privacy', 'created_at', 'music_file', 'music_title', 'music_artist', 'music_url', 'music_start', 'music_len',
                  'view_count', 'like_count', 'viewers',
                  'viewed_by_me', 'liked_by_me', 'my_reaction']
        read_only_fields = ['user', 'media_type', 'created_at', 'music_title', 'music_artist', 'music_url', 'music_start', 'music_len']

    def get_profile_picture(self, obj):
        request = self.context.get('request')
        if obj.user.privacy_photo == 'nobody' and not (request and request.user.id == obj.user_id):
            return None
        if obj.user.profile_picture:
            return _abs(request, obj.user.profile_picture.url)
        return None

    def _is_owner(self, obj):
        request = self.context.get('request')
        return bool(request and obj.user_id == request.user.id)

    def _my_view(self, obj):
        request = self.context.get('request')
        if not request:
            return None
        for v in obj.views.all():
            if v.viewer_id == request.user.id:
                return v
        return None

    # --- owner-only numbers / lists
    def get_view_count(self, obj):
        return len(obj.views.all()) if self._is_owner(obj) else None

    def get_like_count(self, obj):
        return sum(1 for v in obj.views.all() if v.liked) if self._is_owner(obj) else None

    def get_viewers(self, obj):
        if not self._is_owner(obj):
            return []
        return [{"id": v.viewer_id, "username": v.viewer.username, "viewed_at": v.viewed_at,
                 "liked": v.liked, "reaction": v.reaction}
                for v in obj.views.all()]

    # --- my own state on someone else's status
    def get_viewed_by_me(self, obj):
        return self._my_view(obj) is not None

    def get_liked_by_me(self, obj):
        v = self._my_view(obj)
        return bool(v and v.liked)

    def get_my_reaction(self, obj):
        v = self._my_view(obj)
        return v.reaction if v else ''


class CallHistorySerializer(serializers.ModelSerializer):
    caller_name = serializers.ReadOnlyField(source='caller.username')
    receiver_name = serializers.ReadOnlyField(source='receiver.username')
    room_id = serializers.SerializerMethodField()
    direction = serializers.SerializerMethodField()
    peer_id = serializers.SerializerMethodField()
    peer_name = serializers.SerializerMethodField()

    class Meta:
        model = CallHistory
        fields = ['id', 'caller', 'caller_name', 'receiver', 'receiver_name', 'call_type', 'status',
                  'started_at', 'answered_at', 'ended_at', 'duration', 'room_id',
                  'direction', 'peer_id', 'peer_name']

    def get_room_id(self, obj):
        return f"call_{obj.id}"

    def _me(self):
        request = self.context.get('request')
        return request.user.id if request else None

    def get_direction(self, obj):
        return 'outgoing' if obj.caller_id == self._me() else 'incoming'

    def get_peer_id(self, obj):
        return obj.receiver_id if obj.caller_id == self._me() else obj.caller_id

    def get_peer_name(self, obj):
        return obj.receiver.username if obj.caller_id == self._me() else obj.caller.username
