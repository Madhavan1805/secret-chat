from django.db import models
from django.contrib.auth.models import AbstractUser


class CustomUser(AbstractUser):
    phone_number = models.CharField(max_length=15, unique=True, null=True, blank=True)
    profile_picture = models.ImageField(upload_to='profile_pics/', null=True, blank=True)
    profile_picture_old = models.URLField(blank=True, null=True)
    bio = models.CharField(max_length=255, blank=True, default="Available")
    is_online = models.BooleanField(default=False)
    last_seen = models.DateTimeField(auto_now=True)
    public_key = models.TextField(blank=True, null=True)
    typing_with = models.IntegerField(blank=True, null=True)

    def __str__(self):
        return self.username


# --------------------------------------------------------------- NEW: block
class Block(models.Model):
    blocker = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='blocking')
    blocked = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='blocked_by')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('blocker', 'blocked')

    def __str__(self):
        return f"{self.blocker.username} blocked {self.blocked.username}"


class Chat(models.Model):
    is_group = models.BooleanField(default=False)
    group_name = models.CharField(max_length=255, blank=True, null=True)
    group_icon = models.URLField(blank=True, null=True)
    participants = models.ManyToManyField(CustomUser, related_name='chats')
    theme = models.CharField(max_length=50, default='default')
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(CustomUser, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name='created_chats')            # NEW

    # disappearing messages (server side, shared by everyone in the chat)
    disappearing_time = models.IntegerField(default=0)
    disappearing_started_at = models.DateTimeField(null=True, blank=True)   # NEW

    # LEGACY (unused now - locks live in ChatUserSetting, hashed)
    is_locked = models.BooleanField(default=False)
    chat_pin = models.CharField(max_length=4, blank=True, null=True)

    def __str__(self):
        return self.group_name if self.is_group else f"Chat {self.id}"


# ------------------------------------- NEW: per-user chat settings (pin/mute/lock)
class ChatUserSetting(models.Model):
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='chat_settings')
    chat = models.ForeignKey(Chat, on_delete=models.CASCADE, related_name='user_settings')
    is_pinned = models.BooleanField(default=False)
    is_muted = models.BooleanField(default=False)
    pin_hash = models.CharField(max_length=128, blank=True, default='')
    unlocked_until = models.DateTimeField(null=True, blank=True)
    failed_attempts = models.IntegerField(default=0)
    blocked_until = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ('user', 'chat')

    @property
    def is_locked(self):
        return bool(self.pin_hash)

    def __str__(self):
        return f"{self.user.username} / chat {self.chat_id}"


class Message(models.Model):
    MESSAGE_TYPES = (
        ('text', 'Text'),
        ('image', 'Image'),
        ('video', 'Video'),
        ('audio', 'Audio/Voice Note'),
        ('document', 'Document'),
        ('location', 'Location'),
        ('system', 'System'),                                              # NEW
    )
    STATUS_CHOICES = (
        ('sent', 'Sent (Single Tick)'),
        ('delivered', 'Delivered (Double Tick)'),
        ('read', 'Read (Blue Tick)'),
    )

    chat = models.ForeignKey(Chat, on_delete=models.CASCADE, related_name='messages', null=True, blank=True)
    sender = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='sent_messages')
    receiver = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='received_messages',
                                 null=True, blank=True)
    message_type = models.CharField(max_length=20, choices=MESSAGE_TYPES, default='text')

    content = models.TextField(blank=True, null=True)
    file_url = models.FileField(upload_to='chat_media/', blank=True, null=True)
    file_name = models.CharField(max_length=255, blank=True, null=True)    # NEW (documents)
    file_size = models.BigIntegerField(blank=True, null=True)              # NEW

    voice_note = models.FileField(upload_to='voice_notes/', blank=True, null=True)
    reply_to = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='replies')
    reactions = models.JSONField(default=dict, blank=True)
    is_screenshot = models.BooleanField(default=False)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='sent')

    is_deleted = models.BooleanField(default=False)
    deleted_for_sender = models.BooleanField(default=False)
    deleted_for_receiver = models.BooleanField(default=False)
    hidden_for = models.ManyToManyField(CustomUser, related_name='hidden_messages', blank=True)   # NEW

    edited_at = models.DateTimeField(null=True, blank=True)                # NEW
    forwarded = models.BooleanField(default=False)                         # NEW
    read_by = models.ManyToManyField(CustomUser, related_name='read_messages', blank=True)        # NEW (groups)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.sender.username}: {self.content[:20] if self.content else self.message_type}"


class CallHistory(models.Model):
    CALL_TYPES = (('audio', 'Audio'), ('video', 'Video'))
    STATUS = (
        ('ringing', 'Ringing'),                                            # NEW
        ('ongoing', 'Ongoing'),                                            # NEW
        ('missed', 'Missed'),
        ('completed', 'Completed'),
        ('declined', 'Declined'),
    )
    caller = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='calls_made')
    receiver = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='calls_received')
    call_type = models.CharField(max_length=10, choices=CALL_TYPES)
    status = models.CharField(max_length=20, choices=STATUS, default='ringing')
    started_at = models.DateTimeField(auto_now_add=True)
    answered_at = models.DateTimeField(null=True, blank=True)              # NEW
    ended_at = models.DateTimeField(null=True, blank=True)                 # NEW
    duration = models.IntegerField(default=0)

    def __str__(self):
        return f"{self.caller.username} -> {self.receiver.username} ({self.status})"


class ChatRequest(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('accepted', 'Accepted'),
        ('declined', 'Declined'),
    )
    sender = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='sent_requests')
    receiver = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='received_requests')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('sender', 'receiver')

    def __str__(self):
        return f"{self.sender.username} -> {self.receiver.username} ({self.status})"


# ====================================================================== STATUS
class Status(models.Model):
    PRIVACY_CHOICES = (
        ('all', 'All friends'),
        ('close', 'Close friends only'),
    )
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='statuses')
    media_file = models.FileField(upload_to='status_media/')
    media_type = models.CharField(max_length=10, default='image')  # 'image' or 'video'
    caption = models.CharField(max_length=300, blank=True, default='')            # NEW
    privacy = models.CharField(max_length=10, choices=PRIVACY_CHOICES, default='all')   # NEW
    created_at = models.DateTimeField(auto_now_add=True)


# ------------------------------------- who viewed a status (+ like / emoji reaction)
class StatusView(models.Model):
    status = models.ForeignKey(Status, on_delete=models.CASCADE, related_name='views')
    viewer = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='status_views')
    viewed_at = models.DateTimeField(auto_now_add=True)
    liked = models.BooleanField(default=False)                                    # NEW
    reaction = models.CharField(max_length=16, blank=True, default='')            # NEW

    class Meta:
        unique_together = ('status', 'viewer')


# ------------------------------------- NEW: Close Friends list (like Instagram)
class CloseFriend(models.Model):
    owner = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='close_friends')
    friend = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='close_friend_of')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('owner', 'friend')

    def __str__(self):
        return f"{self.owner.username} -> {self.friend.username} (close friend)"


# ------------------------------------------- forgot-password one-time codes
class PasswordResetOTP(models.Model):
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='reset_otps')
    code_hash = models.CharField(max_length=128)          # the 6-digit code is stored hashed
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    attempts = models.IntegerField(default=0)
    used = models.BooleanField(default=False)

    def __str__(self):
        return f"reset code for {self.user.username} ({'used' if self.used else 'open'})"
