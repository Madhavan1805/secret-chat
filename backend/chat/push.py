"""OneSignal push helper for Secret Chat.

Put this file at: backend/chat/push.py

Railway Variables needed:
    ONESIGNAL_APP_ID   = your OneSignal App ID
    ONESIGNAL_API_KEY  = your OneSignal REST API Key (keep secret)
"""
import json
import os
import threading
import urllib.request
import urllib.error

ONESIGNAL_URL = "https://api.onesignal.com/notifications?c=push"

# Secret chat: do not leak message text on the lock screen by default.
SHOW_PREVIEW = True


def _post(payload):
    app_id = os.environ.get("ONESIGNAL_APP_ID")
    api_key = os.environ.get("ONESIGNAL_API_KEY")
    if not app_id or not api_key:
        print("ONESIGNAL: env variables missing", flush=True)
        return
    payload["app_id"] = app_id
    req = urllib.request.Request(
        ONESIGNAL_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "Authorization": f"Key {api_key}",
        },
        method="POST",
    )
    try:
        res = urllib.request.urlopen(req, timeout=10).read().decode()
        print("ONESIGNAL OK:", res, flush=True)
    except urllib.error.HTTPError as e:
        print("ONESIGNAL HTTP ERROR:", e.code, e.read().decode(), flush=True)
    except Exception as e:
        print("ONESIGNAL ERROR:", repr(e), flush=True)


def send_push(user_ids, title, body, data=None):
    """Send a push to the given user ids (OneSignal external_id = user id)."""
    ids = [str(u) for u in user_ids if u is not None]
    if not ids:
        return
    payload = {
        "target_channel": "push",
        "include_aliases": {"external_id": ids},
        "headings": {"en": title},
        "contents": {"en": body},
        "data": data or {},
    }
    # run in background so the API response is not delayed
    threading.Thread(target=_post, args=(payload,), daemon=True).start()


def notify_new_message(message):
    """Call right after a Message is saved. Notifies the other participants."""
    try:
        chat = message.chat
        sender = message.sender
        recipients = [u.id for u in chat.participants.all() if u.id != sender.id]

        is_group = bool(getattr(chat, "is_group", False)) or len(recipients) > 1
        group_name = getattr(chat, "group_name", None)

        title = f"{sender.username} @ {group_name}" if (is_group and group_name) else sender.username

        content = (getattr(message, "content", "") or "")
        mtype = getattr(message, "message_type", "text")
        if content.startswith("[VIEW_ONCE]"):
            body = "💣 Sent a view-once message"
        elif mtype == "audio":
            body = "🎤 Voice message"
        elif mtype in ("image", "video"):
            body = "📷 Photo / Video"
        elif mtype == "document":
            body = "📄 Document"
        elif mtype == "location":
            body = "📍 Location"
        elif SHOW_PREVIEW and content:
            body = content[:100]
        else:
            body = "💬 New message"

        send_push(recipients, title, body, {"chat_id": chat.id})
    except Exception:
        pass