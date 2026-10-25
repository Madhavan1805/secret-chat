"""Instagram-style notes: one short line (60 characters) that friends see on your avatar for 24 hours.

GET    notes/   my note + my friends' notes
POST   notes/   {text}  create or replace my note
DELETE notes/   remove my note
"""
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Block, Note
from .realtime import notify_users
from .views import friend_ids_of

NOTE_MAX = 60
NOTE_TTL = timedelta(hours=24)


def _visible_friend_ids(user):
    ids = set(friend_ids_of(user))
    ids.discard(user.id)
    for a, b in Block.objects.filter(Q(blocker=user) | Q(blocked=user)).values_list('blocker_id', 'blocked_id'):
        ids.discard(a)
        ids.discard(b)
    return ids


def _row(n):
    return {"user_id": n.user_id, "username": n.user.username, "text": n.text, "created_at": n.created_at}


@api_view(['GET', 'POST', 'DELETE'])
@permission_classes([IsAuthenticated])
def notes_view(request):
    user = request.user
    Note.objects.filter(created_at__lt=timezone.now() - NOTE_TTL).delete()       # expired

    if request.method == 'POST':
        text = ' '.join(str(request.data.get('text') or '').split())              # one line, tidy spaces
        if not text:
            raise ValidationError({"error": "Write something first."})
        if len(text) > NOTE_MAX:
            raise ValidationError({"error": f"A note can have at most {NOTE_MAX} characters."})
        Note.objects.update_or_create(user=user, defaults={"text": text, "created_at": timezone.now()})
        notify_users(list(_visible_friend_ids(user)), 'note')
    elif request.method == 'DELETE':
        Note.objects.filter(user=user).delete()
        notify_users(list(_visible_friend_ids(user)), 'note')

    mine = Note.objects.select_related('user').filter(user=user).first()
    friends = Note.objects.select_related('user').filter(user_id__in=_visible_friend_ids(user))
    return Response({"mine": _row(mine) if mine else None, "friends": [_row(n) for n in friends]})
