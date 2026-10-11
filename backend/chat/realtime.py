"""Tiny helper used by the REST views to push live events over WebSocket.

If Django Channels is not installed / no channel layer is configured the helpers
silently do nothing, so the REST API keeps working (frontend falls back to polling).
"""
from asgiref.sync import async_to_sync

try:
    from channels.layers import get_channel_layer
except ImportError:                      # channels not installed
    get_channel_layer = None


def send_to_user(user_id, payload):
    layer = get_channel_layer() if get_channel_layer else None
    if not layer or not user_id:
        return
    try:
        async_to_sync(layer.group_send)(f"user_{user_id}", {"type": "push", "payload": payload})
    except Exception:
        pass


def notify_users(user_ids, event, **data):
    for uid in set(u for u in user_ids if u):
        send_to_user(uid, {"event": event, **data})
