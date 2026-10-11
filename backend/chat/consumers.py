from collections import defaultdict
from datetime import timedelta
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.db.models import Q
from django.utils import timezone
from rest_framework.authtoken.models import Token

from .models import Block, Chat, ChatRequest, CustomUser, Message

# number of open sockets per user in THIS process (a user may have several tabs).
# For multi-process production deployments move this counter to Redis.
_connections = defaultdict(int)


class ChatConsumer(AsyncJsonWebsocketConsumer):
    """One socket per browser tab. Every user listens on the group `user_<id>`.
    The REST views push events there (see realtime.py); the client can send
    `typing` and `ping` messages."""

    async def connect(self):
        query = parse_qs(self.scope.get("query_string", b"").decode())
        token = (query.get("token") or [""])[0]
        self.user = await self.get_user(token)
        if not self.user:
            await self.close(code=4401)
            return
        self.group = f"user_{self.user.id}"
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        _connections[self.user.id] += 1
        await self.touch()
        if _connections[self.user.id] == 1:
            await self.broadcast_presence(True)

    async def disconnect(self, code):
        user = getattr(self, "user", None)
        if not user:
            return
        await self.channel_layer.group_discard(self.group, self.channel_name)
        _connections[user.id] = max(0, _connections[user.id] - 1)
        if _connections[user.id] == 0:
            await self.set_offline()
            await self.broadcast_presence(False)

    async def receive_json(self, content, **kwargs):
        kind = content.get("type")
        if kind == "ping":
            await self.touch()
            await self.send_json({"event": "pong"})
        elif kind == "typing":
            chat_id = content.get("chat_id")
            to_id = content.get("to")
            targets = await self.typing_targets(chat_id, to_id)
            payload = {
                "event": "typing",
                "from_id": self.user.id,
                "from_name": self.user.username,
                "chat_id": chat_id,
                "to_id": to_id,
                "is_typing": bool(content.get("is_typing", True)),
            }
            for uid in targets:
                await self.channel_layer.group_send(f"user_{uid}", {"type": "push", "payload": payload})

    # handler for group_send(..., {"type": "push", "payload": {...}})
    async def push(self, event):
        await self.send_json(event["payload"])

    # ------------------------------------------------------------ helpers
    async def broadcast_presence(self, is_online):
        for fid in await self.friend_ids():
            await self.channel_layer.group_send(
                f"user_{fid}",
                {"type": "push", "payload": {"event": "presence", "user_id": self.user.id, "is_online": is_online}},
            )

    @database_sync_to_async
    def get_user(self, token):
        if not token:
            return None
        try:
            return Token.objects.select_related("user").get(key=token).user
        except Token.DoesNotExist:
            return None

    @database_sync_to_async
    def touch(self):
        """Called on connect and on every client ping (~25s): keeps the user 'online',
        marks pending messages as delivered and sweeps users that vanished without closing."""
        now = timezone.now()
        CustomUser.objects.filter(pk=self.user.pk).update(last_seen=now, is_online=True)
        Message.objects.filter(receiver=self.user, status="sent").update(status="delivered")
        CustomUser.objects.filter(is_online=True, last_seen__lt=now - timedelta(seconds=90)).update(
            is_online=False, typing_with=None)

    @database_sync_to_async
    def set_offline(self):
        CustomUser.objects.filter(pk=self.user.pk).update(
            is_online=False, typing_with=None, last_seen=timezone.now())

    def _blocked_ids(self):
        rows = Block.objects.filter(Q(blocker=self.user) | Q(blocked=self.user)).values_list("blocker_id", "blocked_id")
        ids = set()
        for a, b in rows:
            ids.update((a, b))
        ids.discard(self.user.id)
        return ids

    @database_sync_to_async
    def friend_ids(self):
        pairs = (ChatRequest.objects.filter(status="accepted")
                 .filter(Q(sender=self.user) | Q(receiver=self.user))
                 .values_list("sender_id", "receiver_id"))
        ids = set()
        for s, r in pairs:
            ids.update((s, r))
        ids.discard(self.user.id)
        return list(ids - self._blocked_ids())      # blocked users never see my presence

    @database_sync_to_async
    def typing_targets(self, chat_id, to_id):
        try:
            if chat_id:
                chat = Chat.objects.filter(id=int(chat_id), participants=self.user).first()
                if not chat:
                    return []
                return list(chat.participants.exclude(id=self.user.id).values_list("id", flat=True))
            if to_id:
                to_id = int(to_id)
                ok = ChatRequest.objects.filter(status="accepted").filter(
                    Q(sender=self.user, receiver_id=to_id) | Q(sender_id=to_id, receiver=self.user)).exists()
                return [to_id] if ok and to_id not in self._blocked_ids() else []
        except (TypeError, ValueError):
            pass
        return []
