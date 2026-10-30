"""Chatzy extras: shared reminders, locked messages, split expenses, time capsule / whisper helpers.

POST reminders/create/    {chat_id|friend_id, remind_at, message_id?, text?}
GET  reminders/           ?chat_id|friend_id  my pending reminders in this chat
POST reminders/cancel/    {id}
POST messages/time_unlock/ {message_id, code, tz_offset}  open a locked message by typing the time it was sent
POST expenses/create/     {chat_id|friend_id, title, amount, member_ids?}
POST expenses/settle/     {expense_id, user_id?}   toggle one share paid / unpaid
GET  expenses/balances/   ?chat_id|friend_id       who owes whom (unpaid shares only)
"""
from datetime import timedelta, timezone as dt_timezone
from decimal import Decimal, InvalidOperation, ROUND_DOWN

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Message, Reminder, Expense, ExpenseShare, TimeUnlock
from .push import send_push
from .realtime import notify_users
from .serializers import MessageSerializer
from .views import (
    resolve_chat, ensure_unlocked, other_user, blocked_between, notify_message, to_int,
)


def _guard(user, chat):
    ensure_unlocked(user, chat)
    if not chat.is_group:
        other = other_user(chat, user)
        if not other or blocked_between(user.id, other.id):
            raise PermissionDenied("You can't message this user.")


def _parse_future(raw, min_seconds=15, max_days=365):
    when = parse_datetime(str(raw or ''))
    if not when:
        raise ValidationError({"error": "Pick a valid date and time"})
    if timezone.is_naive(when):
        when = timezone.make_aware(when, dt_timezone.utc)
    now = timezone.now()
    if when < now + timedelta(seconds=min_seconds):
        raise ValidationError({"error": "Pick a time in the future"})
    if when > now + timedelta(days=max_days):
        raise ValidationError({"error": f"Maximum {max_days} days ahead"})
    return when


def parse_unlock_at(raw):
    """Time capsule time for a new message (None when not given)."""
    if not raw:
        return None
    return _parse_future(raw, min_seconds=60, max_days=365)


def _ctx(request):
    return {'request': request}


# ================================================================ reminders
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def reminder_create_view(request):
    user = request.user
    chat = resolve_chat(user, request.data)
    _guard(user, chat)
    when = _parse_future(request.data.get('remind_at'))

    msg = None
    mid = to_int(request.data.get('message_id'))
    if mid:
        msg = Message.objects.filter(id=mid, chat=chat).first()
    text = ' '.join(str(request.data.get('text') or '').split())[:200]
    if not text and msg:
        c = msg.content or ''
        text = ' '.join(c.split())[:200] if not c.startswith('[') else 'Check this message'
    if not text:
        raise ValidationError({"error": "Write what to be reminded about"})
    if Reminder.objects.filter(creator=user, fired=False).count() >= 50:
        raise ValidationError({"error": "Too many reminders (max 50)"})
    r = Reminder.objects.create(chat=chat, creator=user, message=msg, text=text, remind_at=when)
    return Response({"id": r.id, "text": r.text, "remind_at": r.remind_at}, status=201)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def reminder_list_view(request):
    chat = resolve_chat(request.user, request.query_params)
    ensure_unlocked(request.user, chat, extend=False)
    rows = Reminder.objects.filter(chat=chat, creator=request.user, fired=False).order_by('remind_at')
    return Response([{"id": r.id, "text": r.text, "remind_at": r.remind_at} for r in rows])


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def reminder_cancel_view(request):
    deleted, _ = Reminder.objects.filter(id=to_int(request.data.get('id')), creator=request.user, fired=False).delete()
    if not deleted:
        return Response({"error": "Already done or not found"}, status=404)
    return Response({"status": "cancelled"})


def fire_due_reminders():
    now = timezone.now()
    for r in list(Reminder.objects.filter(fired=False, remind_at__lte=now).select_related('chat', 'creator')[:50]):
        if Reminder.objects.filter(id=r.id, fired=False).update(fired=True) != 1:      # claim: never fire twice
            continue
        try:
            chat, creator = r.chat, r.creator
            if not chat.participants.filter(id=creator.id).exists():
                continue
            other = None if chat.is_group else other_user(chat, creator)
            msg = Message.objects.create(chat=chat, sender=creator, receiver=other, message_type='system',
                                         content=f"⏰ Reminder from {creator.username}: {r.text}"[:300])
            notify_message(chat, msg, 'new')
            ids = list(chat.participants.values_list('id', flat=True))
            send_push(ids, "⏰ Reminder", f"{creator.username}: {r.text}"[:120], {"chat_id": chat.id})
        except Exception:
            pass
    Reminder.objects.filter(fired=True, remind_at__lt=now - timedelta(days=1)).delete()


def fire_due_capsules():
    """When a time capsule opens, tell the receiver(s): live event + phone push."""
    now = timezone.now()
    due = Message.objects.filter(unlock_at__isnull=False, unlock_at__lte=now, unlock_notified=False,
                                 is_deleted=False).select_related('chat', 'sender')[:50]
    for m in list(due):
        if Message.objects.filter(id=m.id, unlock_notified=False).update(unlock_notified=True) != 1:
            continue
        try:
            if not m.chat:
                continue
            notify_message(m.chat, m, 'update')
            ids = [i for i in m.chat.participants.values_list('id', flat=True) if i != m.sender_id]
            send_push(ids, m.sender.username, "🔓 A time capsule just opened", {"chat_id": m.chat.id})
        except Exception:
            pass


def fire_due():
    fire_due_reminders()
    fire_due_capsules()
    from .extras2 import purge_albums
    purge_albums()
    from .extras2 import fire_birthdays
    fire_birthdays()


# ================================================================ locked message (type the time it was sent)
from django.core.cache import cache  # noqa: E402


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def time_unlock_view(request):
    """The receiver types the time the message was sent (1230). Right code -> they can read it, for good."""
    user = request.user
    msg = Message.objects.filter(id=to_int(request.data.get('message_id'))).select_related('chat').first()
    if not msg or not msg.chat or not msg.chat.participants.filter(id=user.id).exists():
        raise PermissionDenied("Not your chat.")
    ensure_unlocked(user, msg.chat)
    if not msg.time_lock or msg.sender_id == user.id:
        return Response(_fresh(request, msg.id))
    key = f"tlock:{msg.id}:{user.id}"
    tries = cache.get(key, 0)
    if tries >= 8:
        raise ValidationError({"error": "Too many wrong tries. Try again in an hour."})
    code = ''.join(c for c in str(request.data.get('code') or '') if c.isdigit())
    try:
        offset = int(request.data.get('tz_offset'))          # minutes, as JavaScript's getTimezoneOffset()
    except (TypeError, ValueError):
        offset = 0
    local = msg.created_at - timedelta(minutes=offset)
    ok = code in {local.strftime('%H%M'), local.strftime('%I%M')}
    if not ok:
        cache.set(key, tries + 1, 3600)
        raise ValidationError({"error": "That is not the time it was sent. Check the time on the message."})
    TimeUnlock.objects.update_or_create(message=msg, user=user, defaults={"unlocked_at": timezone.now()})
    cache.delete(key)
    return Response(_fresh(request, msg.id))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def time_relock_view(request):
    """The receiver left the chat: every 'lock again' message in it closes again."""
    chat = resolve_chat(request.user, request.data)
    n, _ = TimeUnlock.objects.filter(user=request.user, message__chat=chat, message__time_lock_relock=True).delete()
    return Response({"relocked": n})


# ================================================================ reaction rain
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def reaction_rain_view(request):
    """Long-press on a reaction: everybody in the chat sees that emoji rain down on their screen."""
    user = request.user
    msg = Message.objects.filter(id=to_int(request.data.get('message_id'))).select_related('chat').first()
    if not msg or not msg.chat or not msg.chat.participants.filter(id=user.id).exists():
        raise PermissionDenied("Not your chat.")
    ensure_unlocked(user, msg.chat)
    emoji = str(request.data.get('emoji') or '').strip()
    if not emoji or len(emoji) > 16 or any(c.isalnum() for c in emoji):
        raise ValidationError({"error": "Invalid emoji"})
    notify_users(list(msg.chat.participants.values_list('id', flat=True)), 'rain',
                 chat_id=msg.chat.id, emoji=emoji, from_id=user.id)
    return Response({"status": "ok"})


# ================================================================ expenses
def _money(value):
    try:
        d = Decimal(str(value)).quantize(Decimal('0.01'), rounding=ROUND_DOWN)
    except (InvalidOperation, ValueError):
        raise ValidationError({"error": "Enter a valid amount"})
    if d <= 0 or d > Decimal('9999999'):
        raise ValidationError({"error": "Enter an amount between 0.01 and 9999999"})
    return d


def _fresh(request, msg_id):
    from .features import _message_qs
    return MessageSerializer(_message_qs().get(pk=msg_id), context=_ctx(request)).data


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def expense_create_view(request):
    user = request.user
    chat = resolve_chat(user, request.data)
    _guard(user, chat)
    title = ' '.join(str(request.data.get('title') or '').split())[:80]
    if not title:
        raise ValidationError({"error": "Write what the expense was for"})
    total = _money(request.data.get('amount'))

    members = set(chat.participants.values_list('id', flat=True))
    raw = request.data.get('member_ids')
    if isinstance(raw, str):
        raw = raw.split(',')
    picked = {to_int(x) for x in (raw or [])} & members if raw else set(members)
    picked.add(user.id)                                   # the payer always takes part
    if len(picked) < 2:
        raise ValidationError({"error": "Pick at least one other person to split with"})

    n = len(picked)
    each = (total / n).quantize(Decimal('0.01'), rounding=ROUND_DOWN)
    other = None if chat.is_group else other_user(chat, user)
    with transaction.atomic():
        msg = Message.objects.create(
            chat=chat, sender=user, receiver=other, message_type='expense', content=title,
            status='delivered' if (other and other.is_online) else 'sent')
        exp = Expense.objects.create(message=msg, title=title, amount=total, payer=user)
        rest = total - each * (n - 1)                     # the payer's share absorbs the rounding
        for uid in picked:
            ExpenseShare.objects.create(expense=exp, user_id=uid, amount=rest if uid == user.id else each,
                                        paid=(uid == user.id))
    notify_message(chat, msg, 'new')
    return Response(_fresh(request, msg.id), status=201)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def expense_settle_view(request):
    user = request.user
    exp = Expense.objects.filter(id=to_int(request.data.get('expense_id'))).select_related('message__chat').first()
    if not exp or not exp.message.chat or not exp.message.chat.participants.filter(id=user.id).exists():
        raise PermissionDenied("Not your expense.")
    chat = exp.message.chat
    ensure_unlocked(user, chat)
    target = to_int(request.data.get('user_id')) or user.id
    if target != user.id and user.id != exp.payer_id:
        raise PermissionDenied("Only the person who paid can mark other people's shares.")
    share = ExpenseShare.objects.filter(expense=exp, user_id=target).first()
    if not share:
        raise ValidationError({"error": "That person is not part of this expense"})
    if share.user_id == exp.payer_id:
        raise ValidationError({"error": "The payer's own share is always paid"})
    share.paid = not share.paid
    share.save(update_fields=['paid'])
    notify_message(chat, exp.message, 'update')
    return Response(_fresh(request, exp.message_id))


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def expense_balances_view(request):
    user = request.user
    chat = resolve_chat(user, request.query_params)
    ensure_unlocked(user, chat, extend=False)
    net, names = {}, {}
    shares = (ExpenseShare.objects.filter(expense__message__chat=chat, paid=False, expense__message__is_deleted=False)
              .select_related('user', 'expense__payer'))
    for s in shares:
        payer = s.expense.payer
        names[s.user_id], names[payer.id] = s.user.username, payer.username
        net[s.user_id] = net.get(s.user_id, Decimal('0')) - s.amount
        net[payer.id] = net.get(payer.id, Decimal('0')) + s.amount
    debtors = sorted([(u, -a) for u, a in net.items() if a < 0], key=lambda x: -x[1])
    creditors = sorted([(u, a) for u, a in net.items() if a > 0], key=lambda x: -x[1])
    out, i, j = [], 0, 0
    while i < len(debtors) and j < len(creditors):
        du, da = debtors[i]
        cu, ca = creditors[j]
        pay = min(da, ca)
        if pay > 0:
            out.append({"from_id": du, "from_name": names[du], "to_id": cu, "to_name": names[cu], "amount": str(pay)})
        debtors[i], creditors[j] = (du, da - pay), (cu, ca - pay)
        if debtors[i][1] <= 0:
            i += 1
        if creditors[j][1] <= 0:
            j += 1
    return Response({"transfers": out})
