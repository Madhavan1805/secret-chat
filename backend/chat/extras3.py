"""Live location, small chat games (tic-tac-toe, rock-paper-scissors) and 'Ask me anything'."""
from datetime import timedelta

from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import CustomUser, Game, LiveLocation, Message, Question
from .music import clean_text
from .push import send_push
from .realtime import notify_users
from .serializers import MessageSerializer
from .views import (resolve_chat, ensure_unlocked, other_user, blocked_between, notify_message,
                    are_friends, to_int)


def _out(request, msg):
    from .features import _message_qs, _ctx
    return MessageSerializer(_message_qs().get(pk=msg.pk), context=_ctx(request)).data


def _direct_guard(user, chat):
    ensure_unlocked(user, chat)
    other = None if chat.is_group else other_user(chat, user)
    if other and blocked_between(user.id, other.id):
        raise PermissionDenied("You can't message this user.")
    return other


def _coord(request):
    try:
        lat, lng = float(request.data.get('lat')), float(request.data.get('lng'))
    except (TypeError, ValueError):
        raise ValidationError({"error": "Location missing."})
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise ValidationError({"error": "Bad location."})
    return lat, lng


# ================================================================ live location
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def live_start_view(request):
    user = request.user
    chat = resolve_chat(user, request.data)
    other = _direct_guard(user, chat)
    lat, lng = _coord(request)
    minutes = max(5, min(to_int(request.data.get('minutes')) or 60, 480))
    LiveLocation.objects.filter(user=user, stopped=False).update(stopped=True)       # one live share at a time
    msg = Message.objects.create(chat=chat, sender=user, receiver=other, message_type='live', content='📍 Live location',
                                 status='delivered' if (other and other.is_online) else 'sent')
    LiveLocation.objects.create(message=msg, user=user, lat=lat, lng=lng,
                                expires_at=timezone.now() + timedelta(minutes=minutes))
    notify_message(chat, msg, 'new')
    return Response(_out(request, msg), status=201)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def live_update_view(request):
    live = LiveLocation.objects.select_related('message__chat').filter(
        message_id=to_int(request.data.get('message_id')), user=request.user).first()
    if not live:
        raise ValidationError({"error": "Not found."})
    if request.data.get('stop'):
        live.stopped = True
        live.save(update_fields=['stopped'])
    elif live.stopped or live.expires_at <= timezone.now():
        return Response({"active": False})
    else:
        live.lat, live.lng = _coord(request)
        live.updated_at = timezone.now()
        live.save(update_fields=['lat', 'lng', 'updated_at'])
    if live.message.chat:
        notify_message(live.message.chat, live.message, 'update')
    return Response({"active": not live.stopped and live.expires_at > timezone.now()})


# ================================================================ games
WINS = [(0, 1, 2), (3, 4, 5), (6, 7, 8), (0, 3, 6), (1, 4, 7), (2, 5, 8), (0, 4, 8), (2, 4, 6)]
RPS_BEATS = {'rock': 'scissors', 'paper': 'rock', 'scissors': 'paper'}


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def game_create_view(request):
    user = request.user
    chat = resolve_chat(user, request.data)
    if chat.is_group:
        raise ValidationError({"error": "Games are for one-to-one chats."})
    other = _direct_guard(user, chat)
    kind = request.data.get('kind')
    if kind not in ('ttt', 'rps'):
        raise ValidationError({"error": "Pick a game."})
    label = 'Tic-tac-toe' if kind == 'ttt' else 'Rock paper scissors'
    msg = Message.objects.create(chat=chat, sender=user, receiver=other, message_type='game', content=f"🎮 {label}",
                                 status='delivered' if other.is_online else 'sent')
    Game.objects.create(message=msg, kind=kind, starter=user, opponent=other,
                        board='.' * 9 if kind == 'ttt' else '', turn=other if kind == 'ttt' else None)
    notify_message(chat, msg, 'new')
    return Response(_out(request, msg), status=201)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def game_move_view(request):
    user = request.user
    g = Game.objects.select_related('message__chat').filter(pk=to_int(request.data.get('game_id'))).first()
    if not g or user.id not in (g.starter_id, g.opponent_id):
        raise PermissionDenied("Not your game.")
    if g.finished:
        raise ValidationError({"error": "This game is over."})
    move = request.data.get('move')
    if g.kind == 'ttt':
        cell = to_int(move)
        if cell is None or not 0 <= cell <= 8 or g.board[cell] != '.':
            raise ValidationError({"error": "Pick an empty square."})
        if g.turn_id != user.id:
            raise ValidationError({"error": "Wait for your turn."})
        mark = 'x' if user.id == g.starter_id else 'o'
        g.board = g.board[:cell] + mark + g.board[cell + 1:]
        if any(g.board[a] == g.board[b] == g.board[c] == mark for a, b, c in WINS):
            g.finished, g.winner = True, user
        elif '.' not in g.board:
            g.finished, g.draw = True, True
        else:
            g.turn_id = g.opponent_id if user.id == g.starter_id else g.starter_id
    else:
        if move not in RPS_BEATS:
            raise ValidationError({"error": "Pick rock, paper or scissors."})
        if str(user.id) in g.picks:
            raise ValidationError({"error": "You already picked."})
        g.picks[str(user.id)] = move
        if len(g.picks) == 2:
            a, b = g.picks[str(g.starter_id)], g.picks[str(g.opponent_id)]
            g.finished = True
            if a == b:
                g.draw = True
            else:
                g.winner_id = g.starter_id if RPS_BEATS[a] == b else g.opponent_id
    g.save()
    if g.message.chat:
        notify_message(g.message.chat, g.message, 'update')
    return Response(_out(request, g.message))


def game_data(g, me_id):
    """What the app gets. Rock-paper-scissors picks stay hidden until both have picked."""
    out = {"id": g.id, "kind": g.kind, "starter": g.starter.username, "opponent": g.opponent.username,
           "starter_id": g.starter_id, "opponent_id": g.opponent_id, "board": g.board,
           "turn_id": g.turn_id, "winner_id": g.winner_id, "winner": g.winner.username if g.winner_id else None,
           "finished": g.finished, "draw": g.draw}
    if g.kind == 'rps':
        out["picked"] = [int(k) for k in g.picks]
        out["my_pick"] = g.picks.get(str(me_id))
        out["picks"] = {k: v for k, v in g.picks.items()} if g.finished else {}
    return out


def live_data(live):
    now = timezone.now()
    return {"lat": live.lat, "lng": live.lng, "updated_at": live.updated_at, "expires_at": live.expires_at,
            "active": (not live.stopped) and live.expires_at > now}


# ================================================================ ask me anything
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def ask_send_view(request):
    user = request.user
    to = CustomUser.objects.filter(pk=to_int(request.data.get('user_id')), is_active=True).first()
    text = clean_text(request.data.get('text'), 300)
    if not to or to.id == user.id or not are_friends(user, to.id) or blocked_between(user.id, to.id):
        raise PermissionDenied("You can't ask this person.")
    if not text:
        raise ValidationError({"error": "Write your question."})
    if Question.objects.filter(from_user=user, to_user=to, created_at__gte=timezone.now() - timedelta(hours=1)).count() >= 3:
        raise ValidationError({"error": "Too many questions, try again later."})
    Question.objects.create(from_user=user, to_user=to, text=text)
    send_push([to.id], 'Chatzy', '🙈 Someone asked you a question', {})
    notify_users([to.id], 'ask')
    return Response({"ok": True}, status=201)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def ask_inbox_view(request):
    """My own questions (asker is never shown)."""
    rows = Question.objects.filter(to_user=request.user)[:100]
    return Response([{"id": q.id, "text": q.text, "answer": q.answer, "answered_at": q.answered_at,
                      "created_at": q.created_at} for q in rows])


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def ask_answer_view(request):
    q = Question.objects.filter(pk=to_int(request.data.get('id')), to_user=request.user).first()
    if not q:
        raise ValidationError({"error": "Not found."})
    if request.data.get('delete'):
        q.delete()
        return Response({"ok": True})
    ans = clean_text(request.data.get('answer'), 500)
    if not ans:
        raise ValidationError({"error": "Write an answer."})
    q.answer, q.answered_at = ans, timezone.now()
    q.save(update_fields=['answer', 'answered_at'])
    return Response({"ok": True})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def ask_public_view(request):
    """A friend's answered questions (shown on their profile card)."""
    uid = to_int(request.query_params.get('user_id'))
    if not uid or not (uid == request.user.id or are_friends(request.user, uid)) or blocked_between(request.user.id, uid):
        return Response([])
    rows = Question.objects.filter(to_user_id=uid).exclude(answer='')[:20]
    return Response([{"id": q.id, "text": q.text, "answer": q.answer} for q in rows])


# ================================================================ shared checklist
from .models import Checklist, ChecklistItem   # noqa: E402

MAX_ITEMS = 40


def checklist_data(c):
    return {"id": c.id, "title": c.title,
            "items": [{"id": i.id, "text": i.text, "done": i.done,
                       "by": i.done_by.username if i.done_by_id else None} for i in c.items.all()]}


def _member_checklist(request, checklist_id):
    c = Checklist.objects.select_related('message__chat').filter(pk=to_int(checklist_id)).first()
    chat = c.message.chat if c else None
    if not chat or not chat.participants.filter(id=request.user.id).exists():
        raise PermissionDenied("Not your list.")
    _direct_guard(request.user, chat)
    return c, chat


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def checklist_create_view(request):
    user = request.user
    chat = resolve_chat(user, request.data)
    other = _direct_guard(user, chat)
    title = clean_text(request.data.get('title'), 80) or 'Checklist'
    raw = request.data.get('items')
    items = [clean_text(x, 120) for x in (raw if isinstance(raw, (list, tuple)) else [])]
    items = [x for x in items if x][:MAX_ITEMS]
    if not items:
        raise ValidationError({"error": "Add at least one item."})
    msg = Message.objects.create(chat=chat, sender=user, receiver=other, message_type='checklist', content=f"✅ {title}",
                                 status='delivered' if (other and other.is_online) else 'sent')
    c = Checklist.objects.create(message=msg, title=title)
    ChecklistItem.objects.bulk_create([ChecklistItem(checklist=c, text=t, position=i) for i, t in enumerate(items)])
    notify_message(chat, msg, 'new')
    return Response(_out(request, msg), status=201)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def checklist_toggle_view(request):
    item = ChecklistItem.objects.select_related('checklist').filter(pk=to_int(request.data.get('item_id'))).first()
    if not item:
        raise ValidationError({"error": "Not found."})
    c, chat = _member_checklist(request, item.checklist_id)
    item.done = not item.done
    item.done_by = request.user if item.done else None
    item.save(update_fields=['done', 'done_by'])
    notify_message(chat, c.message, 'update')
    return Response(_out(request, c.message))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def checklist_add_view(request):
    c, chat = _member_checklist(request, request.data.get('checklist_id'))
    text = clean_text(request.data.get('text'), 120)
    if not text:
        raise ValidationError({"error": "Write the item."})
    if c.items.count() >= MAX_ITEMS:
        raise ValidationError({"error": f"At most {MAX_ITEMS} items."})
    ChecklistItem.objects.create(checklist=c, text=text, position=c.items.count())
    notify_message(chat, c.message, 'update')
    return Response(_out(request, c.message))


# ================================================================ tell me when X is online
from .models import OnlineWatch   # noqa: E402


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def online_watch_view(request):
    user = request.user
    if request.method == 'POST':
        uid = to_int(request.data.get('user_id'))
        if not uid or uid == user.id or not are_friends(user, uid) or blocked_between(user.id, uid):
            raise PermissionDenied("You can't watch this person.")
        if request.data.get('on') in (False, 'false', '0', 0):
            OnlineWatch.objects.filter(watcher=user, target_id=uid).delete()
        else:
            if OnlineWatch.objects.filter(watcher=user).count() >= 30:
                raise ValidationError({"error": "Too many alerts (max 30)."})
            OnlineWatch.objects.get_or_create(watcher=user, target_id=uid)
    return Response(list(OnlineWatch.objects.filter(watcher=user).values_list('target_id', flat=True)))
