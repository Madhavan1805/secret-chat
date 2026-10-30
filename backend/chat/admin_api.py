"""Admin page API (only for admins) + the report button every user has.

An admin is a user with is_staff, or one whose user ID is listed in the ADMIN_USERNAMES env var
(comma separated).  Admins can never be banned.

GET  admin/stats/            totals
GET  admin/users/            ?q=search &filter=all|banned|reported   every registered account
POST admin/users/ban/        {user_id, reason}    ban: cannot log in, all devices signed out
POST admin/users/unban/      {user_id}
GET  admin/reports/          ?status=open|all
POST admin/reports/resolve/  {id}
POST reports/                {user_id, reason, details?}   any user reports another account
"""
import os

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response

from .models import CustomUser, DeviceSession, Report
from .music import clean_text
from .realtime import notify_users

REASONS = ('spam', 'harassment', 'fake', 'inappropriate', 'other')


def admin_names():
    return {n.strip().lower() for n in os.environ.get('ADMIN_USERNAMES', '').split(',') if n.strip()}


def is_admin(user):
    return bool(user and user.is_authenticated and user.is_active
                and (user.is_staff or user.is_superuser or user.username.lower() in admin_names()))


class IsChatzyAdmin(BasePermission):
    def has_permission(self, request, view):
        return is_admin(request.user)


def _target(request):
    try:
        user = CustomUser.objects.get(pk=int(request.data.get('user_id')))
    except (TypeError, ValueError, CustomUser.DoesNotExist):
        raise ValidationError({"error": "User not found."})
    return user


def _row(u, request):
    pic = request.build_absolute_uri(u.profile_picture.url) if u.profile_picture else None
    return {"id": u.id, "username": u.username, "email": u.email, "phone_number": u.phone_number,
            "profile_picture": pic, "date_joined": u.date_joined, "last_login": u.last_login,
            "last_seen": u.last_seen, "is_online": u.is_online, "is_banned": not u.is_active,
            "banned_at": u.banned_at, "ban_reason": u.ban_reason, "is_admin": is_admin(u),
            "report_count": getattr(u, 'open_reports', 0), "devices": getattr(u, 'device_count', 0)}


@api_view(['GET'])
@permission_classes([IsChatzyAdmin])
def admin_stats_view(request):
    now = timezone.now()
    return Response({
        "total": CustomUser.objects.count(),
        "banned": CustomUser.objects.filter(is_active=False).count(),
        "online": CustomUser.objects.filter(is_online=True, is_active=True).count(),
        "new_today": CustomUser.objects.filter(date_joined__gte=now.replace(hour=0, minute=0, second=0, microsecond=0)).count(),
        "open_reports": Report.objects.filter(resolved=False).count(),
    })


@api_view(['GET'])
@permission_classes([IsChatzyAdmin])
def admin_users_view(request):
    q = (request.query_params.get('q') or '').strip()
    flt = request.query_params.get('filter') or 'all'
    qs = CustomUser.objects.annotate(
        open_reports=Count('reports_received', filter=Q(reports_received__resolved=False), distinct=True),
        device_count=Count('device_sessions', distinct=True))
    if q:
        qs = qs.filter(Q(username__icontains=q) | Q(email__icontains=q) | Q(phone_number__icontains=q))
    if flt == 'banned':
        qs = qs.filter(is_active=False)
    elif flt == 'reported':
        qs = qs.filter(open_reports__gt=0)
    total = qs.count()
    qs = qs.order_by('-open_reports', '-date_joined')[:300]
    return Response({"count": total, "users": [_row(u, request) for u in qs]})


@api_view(['POST'])
@permission_classes([IsChatzyAdmin])
def admin_ban_view(request):
    user = _target(request)
    if user.id == request.user.id or is_admin(user):
        raise ValidationError({"error": "You can't ban an admin."})
    reason = clean_text(request.data.get('reason'), 200)
    user.is_active = False
    user.is_online = False
    user.banned_at = timezone.now()
    user.ban_reason = reason
    user.save(update_fields=['is_active', 'is_online', 'banned_at', 'ban_reason'])
    notify_users([user.id], 'banned')                                # live app logs out at once
    DeviceSession.objects.filter(user=user).delete()                 # every phone signed out
    Report.objects.filter(reported=user, resolved=False).update(resolved=True)
    return Response({"ok": True})


@api_view(['POST'])
@permission_classes([IsChatzyAdmin])
def admin_unban_view(request):
    user = _target(request)
    user.is_active = True
    user.banned_at = None
    user.ban_reason = ''
    user.save(update_fields=['is_active', 'banned_at', 'ban_reason'])
    return Response({"ok": True})


@api_view(['GET'])
@permission_classes([IsChatzyAdmin])
def admin_reports_view(request):
    qs = Report.objects.select_related('reporter', 'reported')
    if (request.query_params.get('status') or 'open') != 'all':
        qs = qs.filter(resolved=False)
    return Response({"reports": [{
        "id": r.id, "reason": r.reason, "details": r.details, "created_at": r.created_at, "resolved": r.resolved,
        "reporter": r.reporter.username, "reported_id": r.reported_id, "reported": r.reported.username,
        "reported_banned": not r.reported.is_active,
    } for r in qs[:200]]})


@api_view(['POST'])
@permission_classes([IsChatzyAdmin])
def admin_resolve_view(request):
    Report.objects.filter(pk=request.data.get('id')).update(resolved=True)
    return Response({"ok": True})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def report_view(request):
    target = _target(request)
    if target.id == request.user.id:
        raise ValidationError({"error": "You can't report yourself."})
    reason = request.data.get('reason')
    if reason not in REASONS:
        reason = 'other'
    if Report.objects.filter(reporter=request.user, reported=target, resolved=False).exists():
        return Response({"ok": True})                                # already reported, no duplicates
    Report.objects.create(reporter=request.user, reported=target, reason=reason,
                          details=clean_text(request.data.get('details'), 500))
    return Response({"ok": True})
