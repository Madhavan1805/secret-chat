"""Reels: short vertical videos.

GET    reels/?tab=friends|discover&before=<id>   one page of reels (newest first)
POST   reels/            multipart {video, caption, audience: friends|all, duration}
DELETE reels/<id>/       the owner or an admin
POST   reels/<id>/like/  toggle
POST   reels/<id>/view/  count a view
GET/POST reels/<id>/comments/
POST   reels/<id>/report/  3 different people reporting a reel hides it

Friends tab: my reels + my friends' reels (any audience).  Discover tab: reels posted for everyone.
GET    reels/explore/    more videos for Discover: popular YouTube Shorts (embedded with YouTube's own player, so nothing is
                         copied). Needs YOUTUBE_API_KEY on the server; without it this returns an empty list.
Reels are deleted automatically after REEL_DAYS days.
"""
import json
import os
import random
import urllib.parse
import urllib.request
from datetime import timedelta

from django.core.cache import cache
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Block, Reel, ReelComment, ReelLike, ReelReport
from .music import clean_text
from .push import send_push
from .realtime import notify_users

REEL_DAYS = 30
PAGE = 8
MAX_BYTES = 60 * 1024 * 1024
MAX_SECONDS = 60
VIDEO_EXTS = {'mp4', 'mov', 'm4v', 'webm', '3gp'}
PER_DAY = 10


def _abs(request, url):
    return request.build_absolute_uri(url)


def _pic(request, u):
    if u.privacy_photo == 'nobody' and u.id != request.user.id:
        return None
    return _abs(request, u.profile_picture.url) if u.profile_picture else None


def _blocked_ids(user):
    a = Block.objects.filter(blocker=user).values_list('blocked_id', flat=True)
    b = Block.objects.filter(blocked=user).values_list('blocker_id', flat=True)
    return set(a) | set(b)


def _cleanup():
    """Delete reels older than REEL_DAYS (a few per request, so nothing is slow)."""
    for r in Reel.objects.filter(created_at__lt=timezone.now() - timedelta(days=REEL_DAYS))[:20]:
        try:
            r.video.delete(save=False)
        except Exception:
            pass
        r.delete()


def _rows(request, qs):
    liked = set(ReelLike.objects.filter(reel__in=qs, user=request.user).values_list('reel_id', flat=True))
    out = []
    for r in qs:
        out.append({
            "id": r.id, "video_url": _abs(request, r.video.url), "caption": r.caption, "audience": r.audience,
            "duration": r.duration, "views": r.views, "likes": r.like_count, "comments": r.comment_count,
            "liked": r.id in liked, "mine": r.user_id == request.user.id, "created_at": r.created_at,
            "user": {"id": r.user_id, "username": r.user.username, "profile_picture": _pic(request, r.user)},
        })
    return out


def _can_see(user, r):
    from .views import friend_ids_of
    if r.hidden and r.user_id != user.id:
        return False
    if r.user_id == user.id:
        return True
    if r.user_id in _blocked_ids(user) or not r.user.is_active:
        return False
    return r.audience == 'all' or r.user_id in friend_ids_of(user)


def _get(request, pk):
    try:
        r = Reel.objects.select_related('user').get(pk=int(pk))
    except (TypeError, ValueError, Reel.DoesNotExist):
        raise ValidationError({"error": "Reel not found."})
    if not _can_see(request.user, r):
        raise PermissionDenied("You can't see this reel.")
    return r


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def reels_view(request):
    from .views import friend_ids_of
    user = request.user
    if request.method == 'POST':
        f = request.FILES.get('video')
        if not f:
            raise ValidationError({"error": "Pick a video first."})
        ext = os.path.splitext(f.name)[1].lstrip('.').lower()
        if not ((f.content_type or '').startswith('video') or ext in VIDEO_EXTS):
            raise ValidationError({"error": "That file is not a video."})
        if f.size > MAX_BYTES:
            raise ValidationError({"error": "Video is too big (max 60 MB). Try a shorter one."})
        if Reel.objects.filter(user=user, created_at__gte=timezone.now() - timedelta(days=1)).count() >= PER_DAY:
            raise ValidationError({"error": "You posted a lot of reels today. Try again tomorrow."})
        try:
            duration = max(0.0, min(float(request.data.get('duration') or 0), 600.0))
        except (TypeError, ValueError):
            duration = 0.0
        if duration > MAX_SECONDS + 1:
            raise ValidationError({"error": f"Reels can be {MAX_SECONDS} seconds at most."})
        audience = 'all' if request.data.get('audience') == 'all' else 'friends'
        r = Reel.objects.create(user=user, video=f, caption=clean_text(request.data.get('caption'), 200),
                                audience=audience, duration=duration)
        r.like_count = r.comment_count = 0
        return Response(_rows(request, [r])[0], status=201)

    _cleanup()
    qs = Reel.objects.filter(hidden=False, user__is_active=True).exclude(user_id__in=_blocked_ids(user))
    if request.query_params.get('tab') == 'discover':
        qs = qs.filter(audience='all').exclude(user=user)
    else:
        qs = qs.filter(Q(user=user) | Q(user_id__in=friend_ids_of(user)))
    try:
        before = int(request.query_params.get('before') or 0)
    except ValueError:
        before = 0
    if before:
        qs = qs.filter(id__lt=before)
    page = list(qs.select_related('user')
                .annotate(like_count=Count('likes', distinct=True), comment_count=Count('comments', distinct=True))
                .order_by('-id')[:PAGE])
    return Response({"reels": _rows(request, page), "next": page[-1].id if len(page) == PAGE else None})


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def reel_delete_view(request, pk):
    from .admin_api import is_admin
    try:
        r = Reel.objects.get(pk=int(pk))
    except (ValueError, Reel.DoesNotExist):
        raise ValidationError({"error": "Reel not found."})
    if r.user_id != request.user.id and not is_admin(request.user):
        raise PermissionDenied("Only the owner can delete this reel.")
    try:
        r.video.delete(save=False)
    except Exception:
        pass
    r.delete()
    return Response({"ok": True})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def reel_like_view(request, pk):
    r = _get(request, pk)
    like, created = ReelLike.objects.get_or_create(reel=r, user=request.user)
    if not created:
        like.delete()
    if created and r.user_id != request.user.id:
        notify_users([r.user_id], 'reel_like', reel_id=r.id, username=request.user.username)
    return Response({"liked": created, "likes": ReelLike.objects.filter(reel=r).count()})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def reel_view_view(request, pk):
    r = _get(request, pk)
    if r.user_id != request.user.id:
        Reel.objects.filter(pk=r.pk).update(views=r.views + 1)
    return Response({"ok": True})


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def reel_comments_view(request, pk):
    r = _get(request, pk)
    if request.method == 'POST':
        text = clean_text(request.data.get('text'), 300)
        if not text:
            raise ValidationError({"error": "Write something first."})
        ReelComment.objects.create(reel=r, user=request.user, text=text)
        if r.user_id != request.user.id:
            try:
                send_push([r.user_id], 'Chatzy', f"{request.user.username} commented on your reel: {text[:60]}", {})
            except Exception:
                pass
    blocked = _blocked_ids(request.user)
    rows = ReelComment.objects.filter(reel=r).exclude(user_id__in=blocked).select_related('user')[:200]
    return Response({"comments": [{"id": c.id, "text": c.text, "created_at": c.created_at,
                                   "user": {"id": c.user_id, "username": c.user.username,
                                            "profile_picture": _pic(request, c.user)}} for c in rows]})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def reel_report_view(request, pk):
    r = _get(request, pk)
    if r.user_id == request.user.id:
        raise ValidationError({"error": "This is your own reel."})
    ReelReport.objects.get_or_create(reel=r, user=request.user)
    if ReelReport.objects.filter(reel=r).count() >= 3 and not r.hidden:
        Reel.objects.filter(pk=r.pk).update(hidden=True)
    return Response({"ok": True})


DEFAULT_QUERIES = 'tamil shorts,funny shorts,trending shorts,comedy shorts,music shorts,cricket shorts,food shorts,travel shorts'


def _youtube_pool():
    """A pool of embeddable short videos, refreshed every 6 hours (a few API calls, well inside the free quota)."""
    key = os.environ.get('YOUTUBE_API_KEY', '').strip()
    if not key:
        return []
    pool = cache.get('reels:yt-pool')
    if pool is not None:
        return pool
    queries = [q.strip() for q in os.environ.get('REELS_QUERIES', DEFAULT_QUERIES).split(',') if q.strip()][:10]
    seen, pool = set(), []
    for q in queries:
        params = urllib.parse.urlencode({
            'part': 'snippet', 'type': 'video', 'videoEmbeddable': 'true', 'videoDuration': 'short', 'maxResults': 15,
            'q': q, 'regionCode': 'IN', 'relevanceLanguage': 'ta' if 'tamil' in q.lower() else 'en', 'safeSearch': 'strict', 'key': key})
        try:
            req = urllib.request.Request(f"https://www.googleapis.com/youtube/v3/search?{params}", headers={'User-Agent': 'Chatzy'})
            with urllib.request.urlopen(req, timeout=6) as r:
                data = json.loads(r.read().decode('utf-8'))
        except Exception:
            continue
        for it in data.get('items', []):
            vid = (it.get('id') or {}).get('videoId')
            sn = it.get('snippet') or {}
            if vid and vid not in seen:
                seen.add(vid)
                pool.append({"yt": vid, "title": clean_text(sn.get('title'), 120), "channel": clean_text(sn.get('channelTitle'), 60)})
    cache.set('reels:yt-pool', pool, 6 * 3600 if pool else 300)
    return pool


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def reels_explore_view(request):
    pool = list(_youtube_pool())
    random.shuffle(pool)
    return Response({"items": pool[:40]})
