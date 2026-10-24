"""Small helpers shared by views.py and features.py (kept free of view imports to avoid import loops)."""
from django.utils import timezone


def visible(setting, viewer_id, owner_id, viewer_friend_ids):
    """May `viewer` see the thing `owner` protected with `setting` ('everyone' / 'friends' / 'nobody')?"""
    if viewer_id == owner_id:
        return True
    if setting == 'nobody':
        return False
    if setting == 'friends':
        return owner_id in viewer_friend_ids
    return True


def effective_muted(setting):
    """A chat is muted when the switch is on and the timer (if any) has not run out."""
    if not setting or not setting.is_muted:
        return False
    return not setting.muted_until or setting.muted_until > timezone.now()
