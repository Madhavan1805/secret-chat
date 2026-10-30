"""Group events (RSVP), shared photo albums, chat streaks and moods."""
from datetime import timedelta

from django.core.cache import cache
from django.utils import timezone
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Album, AlbumPhoto, Message
from .music import clean_text
from .serializers import MessageSerializer
from .views import resolve_chat, ensure_unlocked, other_user, blocked_between, notify_message, to_int

ALBUM_TTL = timedelta(hours=24)
MAX_ALBUM_PHOTOS = 60
MAX_PHOTO_BYTES = 10 * 1024 * 1024
MOOD_TTL = timedelta(hours=24)


# ------------------------------------------------------------------ albums
def purge_albums():
    """Delete the picture files of albums that ran out. The album card stays, shown as 'expired'."""
    for a in Album.objects.filter(purged=False, expires_at__lte=timezone.now())[:20]:
        for p in a.photos.all():
            p.file.delete(save=False)
        a.photos.all().delete()
        Album.objects.filter(pk=a.pk).update(purged=True)
        if a.message.chat:
            notify_message(a.message.chat, a.message, 'update')


def _guard(user, chat):
    ensure_unlocked(user, chat)
    other = None if chat.is_group else other_user(chat, user)
    if other and blocked_between(user.id, other.id):
        raise PermissionDenied("You can't message this user.")
    return other


def _out(request, msg):
    from .features import _message_qs, _ctx
    return MessageSerializer(_message_qs().get(pk=msg.pk), context=_ctx(request)).data


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def album_create_view(request):
    user = request.user
    chat = resolve_chat(user, request.data)
    other = _guard(user, chat)
    title = clean_text(request.data.get('title'), 60) or 'Album'
    msg = Message.objects.create(chat=chat, sender=user, receiver=other, message_type='album', content=title,
                                 status='delivered' if (other and other.is_online) else 'sent')
    Album.objects.create(message=msg, title=title, expires_at=timezone.now() + ALBUM_TTL)
    notify_message(chat, msg, 'new')
    return Response(_out(request, msg), status=201)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def album_add_view(request):
    user = request.user
    album = Album.objects.select_related('message__chat').filter(pk=to_int(request.data.get('album_id'))).first()
    chat = album.message.chat if album else None
    if not chat or not chat.participants.filter(id=user.id).exists():
        raise PermissionDenied('Not your album.')
    _guard(user, chat)
    if album.purged or album.expires_at <= timezone.now():
        raise ValidationError({"error": "This album has expired."})
    files = request.FILES.getlist('files')
    if not files:
        raise ValidationError({"error": "Pick photos first."})
    if album.photos.count() + len(files) > MAX_ALBUM_PHOTOS:
        raise ValidationError({"error": f"An album holds at most {MAX_ALBUM_PHOTOS} photos."})
    for f in files:
        if not (f.content_type or '').startswith('image'):
            raise ValidationError({"error": "Only photos can go in an album."})
        if f.size > MAX_PHOTO_BYTES:
            raise ValidationError({"error": "A photo is too big (max 10 MB)."})
    for f in files:
        AlbumPhoto.objects.create(album=album, user=user, file=f)
    notify_message(chat, album.message, 'update')
    return Response(_out(request, album.message))


# ------------------------------------------------------------------ streaks
def chat_streak(chat_id):
    """Days in a row (counting back from today / yesterday) on which BOTH people sent something."""
    key = f'streak:{chat_id}'
    hit = cache.get(key)
    if hit is not None:
        return hit
    since = timezone.now() - timedelta(days=400)
    days = {}
    rows = (Message.objects.filter(chat_id=chat_id, created_at__gte=since, is_deleted=False)
            .exclude(message_type='system').values_list('sender_id', 'created_at'))
    for sender, at in rows:
        days.setdefault(timezone.localtime(at).date(), set()).add(sender)
    both = {d for d, who in days.items() if len(who) >= 2}
    day = timezone.localdate()
    if day not in both:                       # today is still open: the streak lives on if yesterday counted
        day -= timedelta(days=1)
    n = 0
    while day in both:
        n += 1
        day -= timedelta(days=1)
    cache.set(key, n, 60)
    return n


# ------------------------------------------------------------------ mood
def mood_of(user):
    if user.mood_at and (user.mood_emoji or user.mood_text) and timezone.now() - user.mood_at < MOOD_TTL:
        return {"emoji": user.mood_emoji, "text": user.mood_text}
    return None


@api_view(['POST', 'DELETE'])
@permission_classes([IsAuthenticated])
def mood_view(request):
    user = request.user
    if request.method == 'DELETE':
        user.mood_emoji, user.mood_text, user.mood_at = '', '', None
    else:
        emoji = clean_text(request.data.get('emoji'), 8)
        text = clean_text(request.data.get('text'), 40)
        if not emoji and not text:
            raise ValidationError({"error": "Pick a mood first."})
        user.mood_emoji, user.mood_text, user.mood_at = emoji, text, timezone.now()
    user.save(update_fields=['mood_emoji', 'mood_text', 'mood_at'])
    from .realtime import notify_users
    from .views import friend_ids_of
    notify_users(list(friend_ids_of(user)), 'friends_changed')
    return Response({"mood": mood_of(user)})
