import secrets

from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils import timezone


def short_uid():
    """Public id of a login session (safe to show in the devices list)."""
    return secrets.token_hex(6)


class CustomUser(AbstractUser):
    phone_number = models.CharField(max_length=15, unique=True, null=True, blank=True)
    profile_picture = models.ImageField(upload_to='profile_pics/', null=True, blank=True, max_length=255)
    profile_picture_old = models.URLField(blank=True, null=True)
    bio = models.CharField(max_length=255, blank=True, default="Available")
    is_online = models.BooleanField(default=False)
    last_seen = models.DateTimeField(auto_now=True)
    public_key = models.TextField(blank=True, null=True)
    typing_with = models.IntegerField(blank=True, null=True)
    banned_at = models.DateTimeField(null=True, blank=True)          # set when an admin bans the account
    ban_reason = models.CharField(max_length=200, blank=True, default='')

    # privacy settings
    PRIVACY_CHOICES = (('everyone', 'Everyone'), ('friends', 'Friends'), ('nobody', 'Nobody'))
    privacy_last_seen = models.CharField(max_length=10, choices=PRIVACY_CHOICES, default='everyone')   # last seen + online dot
    privacy_photo = models.CharField(max_length=10, choices=PRIVACY_CHOICES, default='everyone')       # profile photo
    read_receipts = models.BooleanField(default=True)                                                  # blue ticks

    def __str__(self):
        return self.username


# ---------------------------------------- a user reporting another user (read by the admin page)
class Report(models.Model):
    reporter = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='reports_made')
    reported = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='reports_received')
    reason = models.CharField(max_length=40)
    details = models.CharField(max_length=500, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    resolved = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.reporter.username} reported {self.reported.username}"


# ---------------------------------------- one row per logged-in device (so a device can be signed out)
class DeviceSession(models.Model):
    key = models.CharField(max_length=40, primary_key=True)          # the token the app sends
    uid = models.CharField(max_length=12, unique=True, default=short_uid)
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='device_sessions')
    device_name = models.CharField(max_length=120, blank=True, default='')
    ip = models.GenericIPAddressField(null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    last_used = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return f"{self.user.username} on {self.device_name or 'device'}"


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

    # group profile + admins (the creator is always an admin)
    group_description = models.TextField(blank=True, default='')
    group_photo = models.ImageField(upload_to='group_photos/', null=True, blank=True, max_length=255)
    admins = models.ManyToManyField(CustomUser, related_name='admin_of_chats', blank=True)

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
    muted_until = models.DateTimeField(null=True, blank=True)       # empty = muted until the user unmutes
    is_archived = models.BooleanField(default=False)
    pin_hash = models.CharField(max_length=128, blank=True, default='')
    unlocked_until = models.DateTimeField(null=True, blank=True)
    failed_attempts = models.IntegerField(default=0)
    blocked_until = models.DateTimeField(null=True, blank=True)
        # private wallpaper (only this user sees it)
    wallpaper_preset = models.CharField(max_length=20, blank=True, default='')
    wallpaper_image = models.ImageField(upload_to='wallpapers/', null=True, blank=True)

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
        ('poll', 'Poll'),
        ('expense', 'Expense'),
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
    file_url = models.FileField(upload_to='chat_media/', blank=True, null=True, max_length=255)
    file_name = models.CharField(max_length=255, blank=True, null=True)    # NEW (documents)
    file_size = models.BigIntegerField(blank=True, null=True)              # NEW

    voice_note = models.FileField(upload_to='voice_notes/', blank=True, null=True, max_length=255)
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
    starred_by = models.ManyToManyField(CustomUser, related_name='starred_messages', blank=True)
    # set when this message is a reply / reaction to somebody's status (shows a small preview card)
    status_ref = models.ForeignKey('Status', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')

    # time capsule: the receiver only sees the content once this time has passed
    unlock_at = models.DateTimeField(null=True, blank=True)
    unlock_notified = models.BooleanField(default=False)
    # whisper (groups): only these members can read it, everybody else sees a placeholder
    whisper_to = models.ManyToManyField(CustomUser, related_name='whispers', blank=True)
    # locked message: the receiver must type the time it was sent (e.g. 1230) to read it
    time_lock = models.BooleanField(default=False)
    time_lock_relock = models.BooleanField(default=False)     # True: it locks again when the receiver leaves the chat

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.sender.username}: {self.content[:20] if self.content else self.message_type}"

class Poll(models.Model):
    message = models.OneToOneField(Message, on_delete=models.CASCADE, related_name='poll')
    question = models.CharField(max_length=300)
    multiple = models.BooleanField(default=False)
    closed = models.BooleanField(default=False)


class PollOption(models.Model):
    poll = models.ForeignKey(Poll, on_delete=models.CASCADE, related_name='options')
    text = models.CharField(max_length=100)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['position', 'id']


class PollVote(models.Model):
    option = models.ForeignKey(PollOption, on_delete=models.CASCADE, related_name='votes')
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='poll_votes')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('option', 'user')


class ScheduledMessage(models.Model):
    chat = models.ForeignKey(Chat, on_delete=models.CASCADE, related_name='scheduled_messages')
    sender = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='scheduled_messages')
    content = models.TextField()
    send_at = models.DateTimeField(db_index=True)
    sent = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)


class TimeUnlock(models.Model):
    """The receiver typed the right time for a locked message."""
    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name='time_unlocks')
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='time_unlocks')
    unlocked_at = models.DateTimeField(default=timezone.now)

    class Meta:
        unique_together = ('message', 'user')


class NoteLike(models.Model):
    """A friend double-tapped a note: one like per person per note."""
    note = models.ForeignKey('Note', on_delete=models.CASCADE, related_name='likes')
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='note_likes')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('note', 'user')


class Reminder(models.Model):
    """'Remind us': at remind_at a reminder line is posted into the chat and pushed to everybody in it."""
    chat = models.ForeignKey(Chat, on_delete=models.CASCADE, related_name='reminders')
    creator = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='reminders')
    message = models.ForeignKey(Message, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    text = models.CharField(max_length=200)
    remind_at = models.DateTimeField(db_index=True)
    fired = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)


class Expense(models.Model):
    """A shared expense posted in a chat. Split equally between the picked members."""
    message = models.OneToOneField(Message, on_delete=models.CASCADE, related_name='expense')
    title = models.CharField(max_length=80)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    payer = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)


class ExpenseShare(models.Model):
    expense = models.ForeignKey(Expense, on_delete=models.CASCADE, related_name='shares')
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='expense_shares')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    paid = models.BooleanField(default=False)

    class Meta:
        unique_together = ('expense', 'user')


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
        ('except', 'All friends except...'),
        ('only', 'Only share with...'),
    )
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='statuses')
    media_file = models.FileField(upload_to='status_media/', max_length=255)
    media_type = models.CharField(max_length=10, default='image')  # 'image' or 'video'
    caption = models.CharField(max_length=300, blank=True, default='')            # NEW
    privacy = models.CharField(max_length=10, choices=PRIVACY_CHOICES, default='all')   # NEW
    # for privacy 'except' = friends who must NOT see it, for 'only' = the only friends who can
    privacy_users = models.ManyToManyField(CustomUser, related_name='+', blank=True)
    # optional song on a photo status: an audio file the owner picked from the phone
    music_file = models.FileField(upload_to='status_music/', max_length=255, null=True, blank=True)
    music_title = models.CharField(max_length=80, blank=True, default='')
    music_artist = models.CharField(max_length=60, blank=True, default='')
    music_url = models.URLField(max_length=500, blank=True, default='')          # or a searched song (30 s preview)
    music_start = models.PositiveIntegerField(default=0)                          # the chosen part of the song, in seconds
    music_len = models.PositiveIntegerField(default=30)
    created_at = models.DateTimeField(auto_now_add=True)


# ------------------------------------- Instagram-style note: one short line friends see for 24 hours
class Note(models.Model):
    user = models.OneToOneField(CustomUser, on_delete=models.CASCADE, related_name='note')
    text = models.CharField(max_length=60, blank=True, default='')
    music_file = models.FileField(upload_to='note_music/', max_length=255, null=True, blank=True)
    music_title = models.CharField(max_length=80, blank=True, default='')
    music_artist = models.CharField(max_length=60, blank=True, default='')
    music_url = models.URLField(max_length=500, blank=True, default='')          # or a searched song (30 s preview)
    music_start = models.PositiveIntegerField(default=0)                          # the chosen part of the song, in seconds
    music_len = models.PositiveIntegerField(default=30)
    created_at = models.DateTimeField(default=timezone.now)          # reset whenever the note is edited

    def __str__(self):
        return f"note of {self.user.username}"


# ------------------------------------- who viewed a status (+ like / emoji reaction)
class StatusView(models.Model):
    status = models.ForeignKey(Status, on_delete=models.CASCADE, related_name='views')
    viewer = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='status_views')
    viewed_at = models.DateTimeField(auto_now_add=True)
    liked = models.BooleanField(default=False)                                    # NEW
    reaction = models.CharField(max_length=16, blank=True, default='')            # NEW
    # the single chat line that shows this viewer's LATEST reaction (replaced on every new reaction)
    reaction_message = models.ForeignKey('Message', on_delete=models.SET_NULL, null=True, blank=True,
                                         related_name='+')

    class Meta:
        unique_together = ('status', 'viewer')


# ------------------------------------- people whose statuses I muted (hidden under "Muted updates")
class StatusMute(models.Model):
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='status_mutes')
    muted = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name='status_muted_by')

    class Meta:
        unique_together = ('user', 'muted')


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
