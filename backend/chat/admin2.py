"""More admin tools (all admin-only unless noted).  Every change is also written to the activity log.

GET  admin-api/analytics/          last 14 days: sign-ups, messages, active senders + message types
POST admin-api/users/admin/        {user_id, make}        give / take away admin (not for admins set in ADMIN_USERNAMES)
POST admin-api/users/verify/       {user_id, verified}    blue tick
POST admin-api/users/warn/         {user_id, text}        a warning message from the "ChatzyTeam" account
GET  admin-api/users/export/       CSV of all accounts
GET  admin-api/groups/<id>/        members of a group
POST admin-api/groups/rename/      {chat_id, name}
POST admin-api/groups/remove-member/ {chat_id, user_id}
GET  admin-api/reports/<id>/context/ the last 20 messages of the reported 1:1 chat (every look is logged)
POST admin-api/messages/delete/    {report_id, message_id} delete a message that belongs to a report
GET/POST admin-api/words/          banned words list / add {word}
POST admin-api/words/delete/       {id}
GET  admin-api/log/                ?q=&user_id=   activity log
POST admin-api/maintenance/        {on, message}
GET  app/status/                   (public) {maintenance, message}
"""
import csv
import re
import time
from datetime import timedelta

from django.db.models import Count
from django.db.models.functions import TruncDate
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .admin_api import (IsChatzyAdmin, _non_admin_target, _target, admin_source, is_admin, log_action)
from .models import AdminLog, AppSetting, BannedWord, Chat, CustomUser, Message, Report
from .music import clean_text
from .realtime import notify_users


# =========================================================== analytics
@api_view(['GET'])
@permission_classes([IsChatzyAdmin])
def analytics_view(request):
    today = timezone.localdate()
    days = [today - timedelta(days=i) for i in range(13, -1, -1)]

    def series(rows):
        d = dict(rows)
        return [d.get(x, 0) for x in days]

    since = timezone.now() - timedelta(days=15)
    signups = CustomUser.objects.filter(date_joined__gte=since).annotate(d=TruncDate('date_joined')) \
        .values('d').annotate(n=Count('id')).values_list('d', 'n')
    msgs = Message.objects.filter(created_at__gte=since).annotate(d=TruncDate('created_at')) \
        .values('d').annotate(n=Count('id')).values_list('d', 'n')
    senders = Message.objects.filter(created_at__gte=since).annotate(d=TruncDate('created_at')) \
        .values('d').annotate(n=Count('sender', distinct=True)).values_list('d', 'n')
    types = {r['message_type']: r['n'] for r in Message.objects.values('message_type').annotate(n=Count('id'))}
    return Response({"days": [d.isoformat() for d in days], "signups": series(signups), "messages": series(msgs),
                     "active": series(senders), "types": types})


# =========================================================== admin role / verified / warn
@api_view(['POST'])
@permission_classes([IsChatzyAdmin])
def make_admin_view(request):
    user = _target(request)
    make = bool(request.data.get('make'))
    if make:
        user.is_staff = True
        user.save(update_fields=['is_staff'])
        log_action(request.user, 'make admin', user)
        return Response({"ok": True})
    if user.id == request.user.id:
        raise ValidationError({"error": "You can't remove your own admin access."})
    if admin_source(user) == 'env':
        raise ValidationError({"error": "This admin is set in the ADMIN_USERNAMES variable on Railway. Remove the name there."})
    user.is_staff = False
    user.is_superuser = False
    user.save(update_fields=['is_staff', 'is_superuser'])
    log_action(request.user, 'remove admin', user)
    return Response({"ok": True})


@api_view(['POST'])
@permission_classes([IsChatzyAdmin])
def verify_view(request):
    user = _target(request)
    user.is_verified = bool(request.data.get('verified'))
    user.save(update_fields=['is_verified'])
    log_action(request.user, 'verify' if user.is_verified else 'unverify', user)
    return Response({"ok": True})


def team_user():
    u, created = CustomUser.objects.get_or_create(
        username='ChatzyTeam', defaults={"bio": "Official Chatzy messages", "is_verified": True})
    if created:
        u.set_unusable_password()                         # nobody can ever log in as this account
        u.save(update_fields=['password'])
    return u


@api_view(['POST'])
@permission_classes([IsChatzyAdmin])
def warn_view(request):
    from .views import get_or_create_direct_chat, notify_message
    user = _non_admin_target(request, 'warn')
    text = clean_text(request.data.get('text'), 500)
    if not text:
        raise ValidationError({"error": "Write the warning."})
    team = team_user()
    chat = get_or_create_direct_chat(team, user)
    msg = Message.objects.create(chat=chat, sender=team, receiver=user, message_type='text',
                                 content=f"⚠️ {text}", status='sent')
    notify_message(chat, msg, 'new')
    log_action(request.user, 'warn', user, text[:120])
    return Response({"ok": True})


# =========================================================== export
def _safe(v):
    v = '' if v is None else str(v)
    return "'" + v if v[:1] in ('=', '+', '-', '@') else v        # stop spreadsheet formulas


@api_view(['GET'])
@permission_classes([IsChatzyAdmin])
def export_users_view(request):
    resp = HttpResponse(content_type='text/csv; charset=utf-8')
    resp['Content-Disposition'] = 'attachment; filename="chatzy-users.csv"'
    w = csv.writer(resp)
    w.writerow(['id', 'username', 'email', 'phone', 'joined', 'last_login', 'last_seen', 'status', 'verified', 'admin'])
    for u in CustomUser.objects.order_by('id').iterator():
        w.writerow([u.id, _safe(u.username), _safe(u.email), _safe(u.phone_number), u.date_joined.isoformat(),
                    u.last_login.isoformat() if u.last_login else '', u.last_seen.isoformat() if u.last_seen else '',
                    'active' if u.is_active else 'banned', 'yes' if u.is_verified else '', 'yes' if is_admin(u) else ''])
    log_action(request.user, 'export users', None, 'CSV downloaded')
    return resp


# =========================================================== groups
def _group(chat_id):
    try:
        return Chat.objects.get(pk=int(chat_id), is_group=True)
    except (TypeError, ValueError, Chat.DoesNotExist):
        raise ValidationError({"error": "Group not found."})


@api_view(['GET'])
@permission_classes([IsChatzyAdmin])
def group_detail_view(request, chat_id):
    c = _group(chat_id)
    admins = set(c.admins.values_list('id', flat=True)) | ({c.created_by_id} if c.created_by_id else set())
    return Response({"id": c.id, "name": c.group_name or 'Group', "description": c.group_description,
                     "created_at": c.created_at, "created_by": c.created_by.username if c.created_by else None,
                     "messages": Message.objects.filter(chat=c).count(), "announce_only": c.announce_only,
                     "members": [{"id": m.id, "username": m.username, "is_group_admin": m.id in admins,
                                  "is_online": m.is_online} for m in c.participants.all()]})


@api_view(['POST'])
@permission_classes([IsChatzyAdmin])
def group_rename_view(request):
    c = _group(request.data.get('chat_id'))
    name = clean_text(request.data.get('name'), 60)
    if not name:
        raise ValidationError({"error": "Give the group a name."})
    old = c.group_name
    c.group_name = name
    c.save(update_fields=['group_name'])
    notify_users(list(c.participants.values_list('id', flat=True)), 'chat_updated', chat_id=c.id)
    log_action(request.user, 'rename group', None, f"{old} -> {name} (#{c.id})")
    return Response({"ok": True})


@api_view(['POST'])
@permission_classes([IsChatzyAdmin])
def group_remove_member_view(request):
    c = _group(request.data.get('chat_id'))
    user = _non_admin_target(request, 'remove')
    if not c.participants.filter(id=user.id).exists():
        raise ValidationError({"error": "Not a member."})
    ids = list(c.participants.values_list('id', flat=True))
    c.participants.remove(user)
    c.admins.remove(user)
    notify_users(ids, 'chat_updated', chat_id=c.id)
    log_action(request.user, 'remove from group', user, f"{c.group_name or 'Group'} (#{c.id})")
    return Response({"ok": True})


# =========================================================== reported chat context + delete message
def _report_chat(report):
    from .views import get_direct_chat
    return get_direct_chat(report.reporter, report.reported_id)


@api_view(['GET'])
@permission_classes([IsChatzyAdmin])
def report_context_view(request, report_id):
    """Only the last 20 messages of the one chat that the report is about, and every look is logged."""
    try:
        r = Report.objects.select_related('reporter', 'reported').get(pk=report_id)
    except Report.DoesNotExist:
        raise ValidationError({"error": "Report not found."})
    chat = _report_chat(r)
    log_action(request.user, 'viewed reported chat', r.reported, f"report #{r.id}")
    if not chat:
        return Response({"messages": [], "note": "These two people have no chat together."})
    now = timezone.now()
    out = []
    for m in Message.objects.filter(chat=chat, is_deleted=False).select_related('sender').order_by('-id')[:20]:
        locked = bool(getattr(m, 'time_lock', False)) or bool(getattr(m, 'unlock_at', None) and m.unlock_at > now)
        if locked:
            text = '(locked / time-capsule message)'
        elif m.message_type == 'text':
            text = m.content or ''
        else:
            text = f"[{m.message_type}] {m.file_name or ''}".strip()
        out.append({"id": m.id, "sender": m.sender.username if m.sender else '?', "sender_id": m.sender_id,
                    "text": text[:600], "type": m.message_type, "at": m.created_at})
    out.reverse()
    return Response({"messages": out, "reporter": r.reporter.username, "reported": r.reported.username})


@api_view(['POST'])
@permission_classes([IsChatzyAdmin])
def admin_delete_message_view(request):
    from .views import notify_message
    try:
        r = Report.objects.select_related('reporter', 'reported').get(pk=int(request.data.get('report_id')))
        m = Message.objects.select_related('chat').get(pk=int(request.data.get('message_id')))
    except (TypeError, ValueError, Report.DoesNotExist, Message.DoesNotExist):
        raise ValidationError({"error": "Message not found."})
    chat = _report_chat(r)
    if not chat or m.chat_id != chat.id:
        raise ValidationError({"error": "That message is not part of this report."})
    m.is_deleted = True
    m.save(update_fields=['is_deleted'])
    notify_message(chat, m, 'delete')
    log_action(request.user, 'delete message', r.reported, f"message #{m.id} (report #{r.id})")
    return Response({"ok": True})


# =========================================================== banned words
_cache = {"at": 0.0, "words": []}


def banned_words():
    if time.time() - _cache["at"] > 20:
        _cache["words"] = list(BannedWord.objects.values_list('word', flat=True))
        _cache["at"] = time.time()
    return _cache["words"]


def find_banned_word(text):
    if not text:
        return None
    for w in banned_words():
        if re.search(r'(?<!\w)' + re.escape(w) + r'(?!\w)', text, re.I):
            return w
    return None


@api_view(['GET', 'POST'])
@permission_classes([IsChatzyAdmin])
def words_view(request):
    if request.method == 'POST':
        word = clean_text(request.data.get('word'), 40).lower()
        if len(word) < 2:
            raise ValidationError({"error": "Type a word (2+ letters)."})
        BannedWord.objects.get_or_create(word=word)
        _cache["at"] = 0
        log_action(request.user, 'banned word added', None, word)
    return Response({"words": [{"id": w.id, "word": w.word} for w in BannedWord.objects.all()]})


@api_view(['POST'])
@permission_classes([IsChatzyAdmin])
def word_delete_view(request):
    w = BannedWord.objects.filter(pk=request.data.get('id')).first()
    if w:
        log_action(request.user, 'banned word removed', None, w.word)
        w.delete()
        _cache["at"] = 0
    return Response({"ok": True})


# =========================================================== activity log
@api_view(['GET'])
@permission_classes([IsChatzyAdmin])
def log_view(request):
    qs = AdminLog.objects.all()
    q = (request.query_params.get('q') or '').strip()
    if q:
        from django.db.models import Q
        qs = qs.filter(Q(admin_name__icontains=q) | Q(target_name__icontains=q) | Q(action__icontains=q) | Q(detail__icontains=q))
    return Response({"log": [{"id": a.id, "admin": a.admin_name, "action": a.action, "target": a.target_name,
                              "target_id": a.target_id, "detail": a.detail, "at": a.created_at} for a in qs[:200]]})


# =========================================================== maintenance mode
def _setting(key, default=''):
    s = AppSetting.objects.filter(key=key).first()
    return s.value if s else default


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
def app_status_view(request):
    on = _setting('maintenance') == '1'
    return Response({"maintenance": on, "message": _setting('maintenance_msg') if on else ''})


@api_view(['POST'])
@permission_classes([IsChatzyAdmin])
def maintenance_view(request):
    on = bool(request.data.get('on'))
    msg = clean_text(request.data.get('message'), 200) or 'Chatzy is being updated. Back soon!'
    AppSetting.objects.update_or_create(key='maintenance', defaults={"value": '1' if on else '0'})
    AppSetting.objects.update_or_create(key='maintenance_msg', defaults={"value": msg})
    log_action(request.user, 'maintenance ON' if on else 'maintenance OFF', None, msg if on else '')
    return Response({"ok": True, "maintenance": on, "message": msg})
