"""Bell activity (Instagram style): follow accepted, unfollowed you, liked your note / status."""
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Activity
from .realtime import notify_users

KINDS = ('follow_accept', 'unfollow', 'note_like', 'status_like')


def add_activity(user_id, actor, kind, ref=0):
    """One row per (person, kind, thing): a repeated like just brings it back to the top as unread."""
    if not user_id or user_id == actor.id:
        return
    Activity.objects.filter(user_id=user_id, actor=actor, kind=kind, ref=ref).delete()
    Activity.objects.create(user_id=user_id, actor=actor, kind=kind, ref=ref)
    old = Activity.objects.filter(user_id=user_id).order_by('-created_at').values_list('id', flat=True)[200:]
    if old:
        Activity.objects.filter(id__in=list(old)).delete()
    notify_users([user_id], 'activity')


def remove_activity(user_id, actor, kind, ref=0):
    Activity.objects.filter(user_id=user_id, actor=actor, kind=kind, ref=ref).delete()
    notify_users([user_id], 'activity')


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def activity_list_view(request):
    rows = Activity.objects.filter(user=request.user).select_related('actor')[:60]
    out = []
    for a in rows:
        pic = None
        if a.actor.profile_picture:
            try:
                pic = request.build_absolute_uri(a.actor.profile_picture.url)
            except ValueError:
                pic = None
        out.append({"id": a.id, "kind": a.kind, "ref": a.ref, "actor_id": a.actor_id, "username": a.actor.username,
                    "profile_picture": pic, "created_at": a.created_at, "is_read": a.is_read})
    return Response(out)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def activity_read_view(request):
    Activity.objects.filter(user=request.user, is_read=False).update(is_read=True)
    return Response({"ok": True})
