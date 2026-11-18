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
GET  admin/users/<id>/       full details of one account: devices, counts, groups
POST admin/users/logout/     {user_id}            sign the account out of every phone
POST admin/users/password/   {user_id, password}  set a new password (for people locked out)
POST admin/users/photo/      {user_id}            remove an inappropriate profile photo
POST admin/users/clear/      {user_id}            remove the account's note, mood and statuses
POST admin/users/delete/     {user_id}            delete the account and all its data for good
GET  admin/groups/           ?q=   every group chat
POST admin/groups/delete/    {chat_id}
"""
import os
from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response

from .models import Chat, CustomUser, DeviceSession, Message, Note, Report, Status
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
        "groups": Chat.objects.filter(is_group=True).count(),
        "messages": Message.objects.count(),
        "messages_today": Message.objects.filter(created_at__gte=now.replace(hour=0, minute=0, second=0, microsecond=0)).count(),
        "active_24h": CustomUser.objects.filter(last_seen__gte=now - timedelta(hours=24), is_active=True).count(),
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


def _non_admin_target(request, what):
    user = _target(request)
    if user.id == request.user.id or is_admin(user):
        raise ValidationError({"error": f"You can't {what} an admin."})
    return user


@api_view(['GET'])
@permission_classes([IsChatzyAdmin])
def admin_user_detail_view(request, user_id):
    try:
        u = CustomUser.objects.get(pk=user_id)
    except CustomUser.DoesNotExist:
        raise ValidationError({"error": "User not found."})
    row = _row(u, request)
    row.update({
        "bio": u.bio,
        "messages_sent": Message.objects.filter(sender=u).count(),
        "chats": u.chats.count(),
        "groups": [{"id": c.id, "name": c.group_name or 'Group'} for c in u.chats.filter(is_group=True)[:30]],
        "statuses": Status.objects.filter(user=u).count(),
        "reports_made": u.reports_made.count(),
        "reports_received": u.reports_received.count(),
        "sessions": [{"device": d.device_name or 'Unknown device', "ip": d.ip, "created": d.created,
                      "last_used": d.last_used} for d in DeviceSession.objects.filter(user=u).order_by('-last_used')[:10]],
    })
    return Response(row)


@api_view(['POST'])
@permission_classes([IsChatzyAdmin])
def admin_logout_view(request):
    user = _target(request)
    notify_users([user.id], 'banned')
    DeviceSession.objects.filter(user=user).delete()
    return Response({"ok": True})


@api_view(['POST'])
@permission_classes([IsChatzyAdmin])
def admin_password_view(request):
    user = _non_admin_target(request, 'change the password of')
    pw = str(request.data.get('password') or '')
    if len(pw) < 6:
        raise ValidationError({"error": "Password must be at least 6 characters."})
    user.set_password(pw)
    user.save(update_fields=['password'])
    DeviceSession.objects.filter(user=user).delete()                 # old phones must log in again
    return Response({"ok": True})


@api_view(['POST'])
@permission_classes([IsChatzyAdmin])
def admin_photo_view(request):
    user = _non_admin_target(request, 'edit')
    user.profile_picture = None
    user.profile_picture_old = None
    user.save(update_fields=['profile_picture', 'profile_picture_old'])
    return Response({"ok": True})


@api_view(['POST'])
@permission_classes([IsChatzyAdmin])
def admin_clear_view(request):
    user = _non_admin_target(request, 'edit')
    Note.objects.filter(user=user).delete()
    Status.objects.filter(user=user).delete()
    user.mood_emoji = ''
    user.mood_text = ''
    user.save(update_fields=['mood_emoji', 'mood_text'])
    return Response({"ok": True})


@api_view(['POST'])
@permission_classes([IsChatzyAdmin])
def admin_delete_user_view(request):
    user = _non_admin_target(request, 'delete')
    notify_users([user.id], 'banned')
    user.delete()
    return Response({"ok": True})


@api_view(['GET'])
@permission_classes([IsChatzyAdmin])
def admin_groups_view(request):
    q = (request.query_params.get('q') or '').strip()
    qs = Chat.objects.filter(is_group=True).annotate(members=Count('participants', distinct=True),
                                                     msgs=Count('messages', distinct=True))
    if q:
        qs = qs.filter(group_name__icontains=q)
    qs = qs.select_related('created_by').order_by('-created_at')[:200]
    return Response({"groups": [{
        "id": c.id, "name": c.group_name or 'Group', "members": c.members, "messages": c.msgs,
        "created_at": c.created_at, "created_by": c.created_by.username if c.created_by else None,
    } for c in qs]})


@api_view(['POST'])
@permission_classes([IsChatzyAdmin])
def admin_delete_group_view(request):
    try:
        chat = Chat.objects.get(pk=int(request.data.get('chat_id')), is_group=True)
    except (TypeError, ValueError, Chat.DoesNotExist):
        raise ValidationError({"error": "Group not found."})
    ids = list(chat.participants.values_list('id', flat=True))
    chat.delete()
    notify_users(ids, 'chat_updated')
    return Response({"ok": True})
