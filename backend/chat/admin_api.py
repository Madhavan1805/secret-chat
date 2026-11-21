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

from .models import AdminLog, Chat, CustomUser, DeviceSession, Feedback, Message, Note, Report, Status
from .music import clean_text
from .realtime import notify_users

REASONS = ('spam', 'harassment', 'fake', 'inappropriate', 'other')


AUTO_BAN_REPORTS = 3                    # this many different people reporting an account ...
AUTO_BAN_HOURS = 24                     # ... bans it for this long, until an admin reviews (and can cancel) it
AUTO_BAN_TAG = 'Auto-ban'


def is_auto_ban(user):
    return (not user.is_active) and (user.ban_reason or '').startswith(AUTO_BAN_TAG)


def log_action(admin, action, target=None, detail=''):
    """Every admin action is written to the audit log (Admin > Tools > Activity log).  admin=None means the system."""
    try:
        AdminLog.objects.create(admin=admin, admin_name=admin.username if admin else 'System', action=action,
                                target_id=getattr(target, 'id', None), target_name=getattr(target, 'username', '') or '',
                                detail=str(detail or '')[:300])
    except Exception:
        pass


def lift_expired_bans():
    """Temporary bans end by themselves."""
    return CustomUser.objects.filter(is_active=False, banned_until__isnull=False, banned_until__lte=timezone.now()) \
        .update(is_active=True, banned_at=None, banned_until=None, ban_reason='')


def admin_names():
    return {n.strip().lower() for n in os.environ.get('ADMIN_USERNAMES', '').split(',') if n.strip()}


def admin_source(user):
    """'env' = listed in ADMIN_USERNAMES (change it in Railway), 'staff' = made admin in the panel, '' = not an admin."""
    if user.username.lower() in admin_names():
        return 'env'
    return 'staff' if (user.is_staff or user.is_superuser) else ''


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
            "banned_at": u.banned_at, "banned_until": u.banned_until, "ban_reason": u.ban_reason, "is_admin": is_admin(u),
            "is_verified": u.is_verified, "auto_ban": is_auto_ban(u),
            "report_count": getattr(u, 'open_reports', 0), "devices": getattr(u, 'device_count', 0)}


@api_view(['GET'])
@permission_classes([IsChatzyAdmin])
def admin_stats_view(request):
    now = timezone.now()
    return Response({
        "total": CustomUser.objects.count(),
        "banned": CustomUser.objects.filter(is_active=False).count(),
        "auto_banned": CustomUser.objects.filter(is_active=False, ban_reason__startswith=AUTO_BAN_TAG).count(),
        "online": CustomUser.objects.filter(is_online=True, is_active=True).count(),
        "new_today": CustomUser.objects.filter(date_joined__gte=now.replace(hour=0, minute=0, second=0, microsecond=0)).count(),
        "open_reports": Report.objects.filter(resolved=False).count(),
        "open_feedback": Feedback.objects.exclude(status="done").count(),
        "groups": Chat.objects.filter(is_group=True).count(),
        "messages": Message.objects.count(),
        "messages_today": Message.objects.filter(created_at__gte=now.replace(hour=0, minute=0, second=0, microsecond=0)).count(),
        "active_24h": CustomUser.objects.filter(last_seen__gte=now - timedelta(hours=24), is_active=True).count(),
    })


@api_view(['GET'])
@permission_classes([IsChatzyAdmin])
def admin_users_view(request):
    lift_expired_bans()
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
    elif flt == 'verified':
        qs = qs.filter(is_verified=True)
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
    try:
        days = int(request.data.get('days') or 0)                    # 0 = permanent
    except (TypeError, ValueError):
        days = 0
    days = max(0, min(days, 3650))
    user.is_active = False
    user.is_online = False
    user.banned_at = timezone.now()
    user.banned_until = timezone.now() + timedelta(days=days) if days else None
    user.ban_reason = reason
    user.save(update_fields=['is_active', 'is_online', 'banned_at', 'banned_until', 'ban_reason'])
    log_action(request.user, 'ban', user, f"{'for %d day(s)' % days if days else 'permanent'}{': ' + reason if reason else ''}")
    notify_users([user.id], 'banned')                                # live app logs out at once
    DeviceSession.objects.filter(user=user).delete()                 # every phone signed out
    Report.objects.filter(reported=user, resolved=False).update(resolved=True)
    return Response({"ok": True})


@api_view(['POST'])
@permission_classes([IsChatzyAdmin])
def admin_unban_view(request):
    user = _target(request)
    was_auto = is_auto_ban(user)
    user.is_active = True
    user.banned_at = None
    user.banned_until = None
    user.ban_reason = ''
    user.save(update_fields=['is_active', 'banned_at', 'banned_until', 'ban_reason'])
    if was_auto:                                                     # the admin looked at it and decided: those reports are done
        Report.objects.filter(reported=user, resolved=False).update(resolved=True)
    log_action(request.user, 'cancel auto-ban' if was_auto else 'unban', user)
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
        "reported_banned": not r.reported.is_active, "reported_auto_ban": is_auto_ban(r.reported),
    } for r in qs[:200]]})


@api_view(['POST'])
@permission_classes([IsChatzyAdmin])
def admin_resolve_view(request):
    Report.objects.filter(pk=request.data.get('id')).update(resolved=True)
    log_action(request.user, 'resolve report', None, f"report #{request.data.get('id')}")
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
    maybe_auto_ban(target)
    return Response({"ok": True})


def maybe_auto_ban(target):
    """3 different people have an open report against the account -> banned for 24 hours.  An admin can cancel it."""
    if not target.is_active or is_admin(target):
        return False
    people = Report.objects.filter(reported=target, resolved=False).values('reporter').distinct().count()
    if people != AUTO_BAN_REPORTS:                                   # exactly on the 3rd, so it does not repeat
        return False
    target.is_active = False
    target.is_online = False
    target.banned_at = timezone.now()
    target.banned_until = timezone.now() + timedelta(hours=AUTO_BAN_HOURS)
    target.ban_reason = f"{AUTO_BAN_TAG}: {AUTO_BAN_REPORTS} people reported this account. It is being reviewed."
    target.save(update_fields=['is_active', 'is_online', 'banned_at', 'banned_until', 'ban_reason'])
    notify_users([target.id], 'banned')
    DeviceSession.objects.filter(user=target).delete()
    log_action(None, 'auto-ban', target, f"{AUTO_BAN_REPORTS} reports -> {AUTO_BAN_HOURS}h ban (reports stay open for review)")
    try:                                                              # tell the admins
        from django.db.models import Q
        from .push import send_push
        q = Q(is_staff=True) | Q(is_superuser=True)
        for n in admin_names():
            q |= Q(username__iexact=n)
        admin_ids = list(CustomUser.objects.filter(is_active=True).filter(q).values_list('id', flat=True))
        send_push(admin_ids, 'Auto-ban', f"{target.username} was banned for 24h after {AUTO_BAN_REPORTS} reports. Review it in Admin.", {})
    except Exception:
        pass
    return True




KINDS = ('idea', 'bug', 'other')


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def feedback_view(request):
    """GET: my own feedback with the admin's answers.  POST {text, kind}: send new feedback (max 5 a day)."""
    if request.method == 'POST':
        text = clean_text(request.data.get('text'), 1000)
        if len(text) < 3:
            raise ValidationError({"error": "Write a few words first."})
        since = timezone.now() - timedelta(days=1)
        if Feedback.objects.filter(user=request.user, created_at__gte=since).count() >= 5:
            raise ValidationError({"error": "You have sent a lot of feedback today. Try again tomorrow."})
        kind = request.data.get('kind')
        Feedback.objects.create(user=request.user, kind=kind if kind in KINDS else 'idea', text=text)
        return Response({"ok": True})
    return Response({"feedback": [{"id": f.id, "kind": f.kind, "text": f.text, "status": f.status,
                                   "reply": f.reply, "created_at": f.created_at}
                                  for f in Feedback.objects.filter(user=request.user)[:30]]})


@api_view(['GET'])
@permission_classes([IsChatzyAdmin])
def admin_feedback_view(request):
    qs = Feedback.objects.select_related('user')
    if (request.query_params.get('status') or 'open') != 'all':
        qs = qs.exclude(status='done')
    return Response({"feedback": [{"id": f.id, "user": f.user.username, "user_id": f.user_id, "kind": f.kind,
                                   "text": f.text, "status": f.status, "reply": f.reply, "created_at": f.created_at}
                                  for f in qs[:200]]})


@api_view(['POST'])
@permission_classes([IsChatzyAdmin])
def admin_feedback_update_view(request):
    """{id, status: seen|done, reply?}  - the reply (if any) is shown to the user and pushed to their phone."""
    try:
        f = Feedback.objects.select_related('user').get(pk=int(request.data.get('id')))
    except (TypeError, ValueError, Feedback.DoesNotExist):
        raise ValidationError({"error": "Feedback not found."})
    status = request.data.get('status')
    if status in ('new', 'seen', 'done'):
        f.status = status
    reply = clean_text(request.data.get('reply'), 500)
    if reply:
        f.reply = reply
        f.replied_at = timezone.now()
        log_action(request.user, 'feedback reply', f.user, reply[:120])
    f.save()
    if reply:
        try:
            from .push import send_push
            send_push([f.user_id], 'Chatzy feedback', reply, {})
            notify_users([f.user_id], 'feedback_reply')
        except Exception:
            pass
    return Response({"ok": True})


def _non_admin_target(request, what):
    user = _target(request)
    if user.id == request.user.id or is_admin(user):
        raise ValidationError({"error": f"You can't {what} an admin."})
    return user


@api_view(['GET'])
@permission_classes([IsChatzyAdmin])
def admin_user_detail_view(request, user_id):
    """Everything the server knows about one account (but never the contents of private chats)."""
    from .views import friend_ids_of
    from .models import AdminLog, Sticker
    try:
        u = CustomUser.objects.get(pk=user_id)
    except CustomUser.DoesNotExist:
        raise ValidationError({"error": "User not found."})
    row = _row(u, request)
    reports_in = Report.objects.filter(reported=u).select_related('reporter')[:10]
    row.update({
        "bio": u.bio,
        "admin_source": admin_source(u),
        "two_factor": u.totp_enabled,
        "birthday": f"{u.birthday_day}/{u.birthday_month}" if u.birthday_day and u.birthday_month else None,
        "mood": (u.mood_emoji + ' ' + u.mood_text).strip() or None,
        "auto_reply": u.auto_reply or None,
        "privacy": {"last_seen": u.privacy_last_seen, "photo": u.privacy_photo, "read_receipts": u.read_receipts},
        "friends": len(friend_ids_of(u)),
        "messages_sent": Message.objects.filter(sender=u).count(),
        "messages_received": Message.objects.filter(chat__participants=u).exclude(sender=u).count(),
        "chats": u.chats.count(),
        "groups": [{"id": c.id, "name": c.group_name or 'Group'} for c in u.chats.filter(is_group=True)[:30]],
        "statuses": Status.objects.filter(user=u).count(),
        "stickers": Sticker.objects.filter(user=u).count(),
        "feedback": Feedback.objects.filter(user=u).count(),
        "reports_made": u.reports_made.count(),
        "reports_received": u.reports_received.count(),
        "reports_in": [{"id": r.id, "by": r.reporter.username, "reason": r.reason, "details": r.details,
                        "at": r.created_at, "resolved": r.resolved} for r in reports_in],
        "sessions": [{"device": d.device_name or 'Unknown device', "ip": d.ip, "created": d.created,
                      "last_used": d.last_used} for d in DeviceSession.objects.filter(user=u).order_by('-last_used')[:10]],
        "log": [{"admin": a.admin_name, "action": a.action, "detail": a.detail, "at": a.created_at}
                for a in AdminLog.objects.filter(target_id=u.id)[:10]],
    })
    return Response(row)


@api_view(['POST'])
@permission_classes([IsChatzyAdmin])
def admin_logout_view(request):
    user = _target(request)
    notify_users([user.id], 'banned')
    DeviceSession.objects.filter(user=user).delete()
    log_action(request.user, 'sign out everywhere', user)
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
    log_action(request.user, 'set password', user)
    return Response({"ok": True})


@api_view(['POST'])
@permission_classes([IsChatzyAdmin])
def admin_photo_view(request):
    user = _non_admin_target(request, 'edit')
    user.profile_picture = None
    user.profile_picture_old = None
    user.save(update_fields=['profile_picture', 'profile_picture_old'])
    log_action(request.user, 'remove photo', user)
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
    log_action(request.user, 'clear note and statuses', user)
    return Response({"ok": True})


@api_view(['POST'])
@permission_classes([IsChatzyAdmin])
def admin_delete_user_view(request):
    user = _non_admin_target(request, 'delete')
    notify_users([user.id], 'banned')
    log_action(request.user, 'delete account', user)
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
    log_action(request.user, 'delete group', None, f"{chat.group_name or 'Group'} (#{chat.id})")
    chat.delete()
    notify_users(ids, 'chat_updated')
    return Response({"ok": True})
