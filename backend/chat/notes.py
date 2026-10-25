"""Instagram-style notes: one short line (60 characters) that friends see on your avatar for 24 hours.

GET    notes/   my note + my friends' notes
POST   notes/   {text, music_file?, music_title?, music_artist?}  create or replace my note (multipart when a song is attached)
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
from .music import clean_music_url, clean_text
from .views import friend_ids_of, AUDIO_EXTS, MAX_MUSIC_BYTES

NOTE_MAX = 60
NOTE_TTL = timedelta(hours=24)


def _visible_friend_ids(user):
    ids = set(friend_ids_of(user))
    ids.discard(user.id)
    for a, b in Block.objects.filter(Q(blocker=user) | Q(blocked=user)).values_list('blocker_id', 'blocked_id'):
        ids.discard(a)
        ids.discard(b)
    return ids


def _row(n, request):
    music = request.build_absolute_uri(n.music_file.url) if n.music_file else None
    return {"user_id": n.user_id, "username": n.user.username, "text": n.text, "created_at": n.created_at,
            "music_file": music, "music_url": n.music_url, "music_title": n.music_title, "music_artist": n.music_artist}


@api_view(['GET', 'POST', 'DELETE'])
@permission_classes([IsAuthenticated])
def notes_view(request):
    user = request.user
    for old in Note.objects.filter(created_at__lt=timezone.now() - NOTE_TTL):      # expired
        if old.music_file:
            old.music_file.delete(save=False)
        old.delete()

    if request.method == 'POST':
        text = ' '.join(str(request.data.get('text') or '').split())              # one line, tidy spaces
        music = request.FILES.get('music_file')
        picked_url = '' if music else clean_music_url(request.data.get('music_url'))
        if not text and not music and not picked_url:
            raise ValidationError({"error": "Write something or add a song first."})
        if len(text) > NOTE_MAX:
            raise ValidationError({"error": f"A note can have at most {NOTE_MAX} characters."})
        defaults = {"text": text, "created_at": timezone.now(), "music_title": "", "music_artist": "", "music_url": picked_url}
        if picked_url:
            defaults["music_title"] = clean_text(request.data.get('music_title'), 80) or 'Song'
            defaults["music_artist"] = clean_text(request.data.get('music_artist'), 60)
        if music:
            ext = music.name.rsplit('.', 1)[-1].lower() if '.' in music.name else ''
            if not ((music.content_type or '').startswith('audio') or ext in AUDIO_EXTS):
                raise ValidationError({"error": "Please pick an audio file."})
            if music.size > MAX_MUSIC_BYTES:
                raise ValidationError({"error": "Song is too big (max 12 MB)."})
            defaults["music_title"] = ' '.join(str(request.data.get('music_title') or '').split())[:80]
            defaults["music_artist"] = ' '.join(str(request.data.get('music_artist') or '').split())[:60]
        old = Note.objects.filter(user=user).first()
        if old and old.music_file:
            old.music_file.delete(save=False)                                   # replaced note: drop the old song file
        note, _ = Note.objects.update_or_create(user=user, defaults=defaults)
        if music:
            note.music_file = music
            note.save(update_fields=['music_file'])
        else:
            Note.objects.filter(pk=note.pk).update(music_file=None)
        notify_users(list(_visible_friend_ids(user)), 'note')
    elif request.method == 'DELETE':
        old = Note.objects.filter(user=user).first()
        if old and old.music_file:
            old.music_file.delete(save=False)
        Note.objects.filter(user=user).delete()
        notify_users(list(_visible_friend_ids(user)), 'note')

    mine = Note.objects.select_related('user').filter(user=user).first()
    friends = Note.objects.select_related('user').filter(user_id__in=_visible_friend_ids(user))
    return Response({"mine": _row(mine, request) if mine else None, "friends": [_row(n, request) for n in friends]})
