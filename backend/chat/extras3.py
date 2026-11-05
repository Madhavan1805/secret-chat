"""Live location, small chat games (tic-tac-toe, rock-paper-scissors) and 'Ask me anything'."""
import random
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


GROUP_GAMES = {'grps': '🪨📄✂️ Group rock paper scissors', 'gnum': '🔢 Guess the number', 'gspin': '🎡 Truth or dare spinner',
               'ludo': '🎲 Ludo', 'wyr': '🤔 Would you rather', 'mlt': '👀 Most likely to'}
WYR = [("Always be 10 minutes late", "Always be 20 minutes early"), ("Lose your phone for a week", "Lose your wallet for a week"),
       ("Only eat sweets forever", "Only eat spicy food forever"), ("Be able to fly", "Be invisible"),
       ("Live in the mountains", "Live by the beach"), ("Never use social media again", "Never watch movies again"),
       ("Know every language", "Play every instrument"), ("Have unlimited pizza", "Have unlimited biryani"),
       ("Go back to school days", "Jump 10 years ahead"), ("Be famous", "Be rich and unknown")]
MLT = ["Most likely to fall asleep in a movie", "Most likely to become a millionaire", "Most likely to get lost with a map",
       "Most likely to text back after 3 days", "Most likely to cry at a movie", "Most likely to forget a birthday",
       "Most likely to become famous", "Most likely to eat the last piece", "Most likely to be late to everything",
       "Most likely to talk to a stranger and make a friend"]

# ---- Ludo: 52 shared cells, 5 home-column cells, token positions -1 (yard), 0..50 track, 51..55 home column, 56 home
LUDO_SAFE = {0, 8, 13, 21, 26, 34, 39, 47}


def _ludo_cell(idx, pos):
    return (idx * 13 + pos) % 52 if 0 <= pos <= 50 else None


def _ludo_movable(st, uid, die):
    idx = st['players'].index(uid)
    out = []
    for t, pos in enumerate(st['pos'][str(uid)]):
        if pos == -1:
            if die == 6:
                out.append(t)
        elif pos + die <= 56:
            out.append(t)
    return out


def _ludo_apply(st, uid, t, die):
    idx = st['players'].index(uid)
    mine = st['pos'][str(uid)]
    new = 0 if mine[t] == -1 else mine[t] + die
    mine[t] = new
    extra = die == 6
    note = ''
    cell = _ludo_cell(idx, new)
    if cell is not None and cell not in LUDO_SAFE:
        for oid in st['players']:
            if oid == uid:
                continue
            oi = st['players'].index(oid)
            for j, op in enumerate(st['pos'][str(oid)]):
                if _ludo_cell(oi, op) == cell:
                    st['pos'][str(oid)][j] = -1
                    extra = True
                    note = 'captured'
    if new == 56:
        extra = True
        note = 'home'
    return extra, note


def _ludo_next(st, extra):
    if not extra:
        st['turn'] = (st['turn'] + 1) % len(st['players'])
    st['die'] = None

TRUTHS = ["What's the most embarrassing thing you've done in public?", "Who in this group do you secretly talk to the most?",
          "What's a lie you told that you still remember?", "Which of your habits would annoy this group the most?",
          "Who here would you trust with your phone unlocked?", "What's the last thing you searched on your phone?",
          "Your biggest fear in one line?", "What song do you play when nobody is around?"]
DARES = ["Send a voice note singing the chorus of any song.", "Change your status to 'I love homework' for an hour.",
         "Send your most recent selfie to the group.", "Talk only in emojis for the next 5 minutes.",
         "Type a message with your eyes closed and send it.", "Send a 10-second voice note in a funny accent.",
         "Compliment everyone in the group in one line each.", "Say the alphabet backwards in a voice note."]


def _members(chat):
    return list(chat.participants.filter(is_active=True))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def game_create_view(request):
    user = request.user
    chat = resolve_chat(user, request.data)
    other = _direct_guard(user, chat)
    kind = request.data.get('kind')
    if kind in GROUP_GAMES:
        label = GROUP_GAMES[kind]
        msg = Message.objects.create(chat=chat, sender=user, receiver=other, message_type='game', content=f"🎮 {label}",
                                     status='delivered' if (other and other.is_online) else 'sent')
        state = {}
        if kind == 'gnum':
            state = {"secret": random.randint(1, 100), "guesses": []}
        elif kind == 'gspin':
            state = {"spins": 0}
        elif kind == 'ludo':
            players = [user.id] + ([other.id] if other else [])
            state = {"players": players, "started": bool(other), "die": None, "turn": 0, "msg": '',
                     "pos": {str(u): [-1, -1, -1, -1] for u in players}}
        elif kind == 'wyr':
            a, b = random.choice(WYR)
            state = {"a": a, "b": b, "votes": {}}
        elif kind == 'mlt':
            state = {"q": random.choice(MLT), "votes": {}}
        Game.objects.create(message=msg, kind=kind, starter=user, opponent=None, state=state)
        notify_message(chat, msg, 'new')
        return Response(_out(request, msg), status=201)
    if chat.is_group:
        raise ValidationError({"error": "Pick a group game."})
    if kind not in ('ttt', 'rps'):
        raise ValidationError({"error": "Pick a game."})
    label = 'Tic-tac-toe' if kind == 'ttt' else 'Rock paper scissors'
    msg = Message.objects.create(chat=chat, sender=user, receiver=other, message_type='game', content=f"🎮 {label}",
                                 status='delivered' if other.is_online else 'sent')
    Game.objects.create(message=msg, kind=kind, starter=user, opponent=other,
                        board='.' * 9 if kind == 'ttt' else '', turn=other if kind == 'ttt' else None)
    notify_message(chat, msg, 'new')
    return Response(_out(request, msg), status=201)


def _vote_move(g, user, move, st, options):
    chat = g.message.chat
    votes = st.setdefault('votes', {})
    if move == 'reveal':
        if user.id != g.starter_id:
            raise PermissionDenied("Only the one who started the game can end it.")
        g.finished = True
        return
    if g.finished:
        raise ValidationError({"error": "Voting is closed."})
    if options is not None:
        if move not in options:
            raise ValidationError({"error": "Pick A or B."})
        votes[str(user.id)] = move
    else:
        target = to_int(move)
        if target is None or not chat.participants.filter(pk=target).exists() or target == user.id:
            raise ValidationError({"error": "Pick someone else from the chat."})
        votes[str(user.id)] = target
    if {m.id for m in _members(chat)} <= {int(k) for k in votes}:
        g.finished = True


def _ludo_move(g, user, move, st):
    chat = g.message.chat
    members = _members(chat)
    if not st.get('started'):
        if move == 'join':
            if user.id in st['players']:
                return
            if len(st['players']) >= 4:
                raise ValidationError({"error": "Ludo has room for 4 players."})
            st['players'].append(user.id)
        elif move == 'start':
            if user.id != g.starter_id:
                raise PermissionDenied("Only the one who started the game can start it.")
            if len(st['players']) < 2:
                raise ValidationError({"error": "Need at least 2 players. Others can tap Join."})
            st['started'] = True
            st['pos'] = {str(u): [-1, -1, -1, -1] for u in st['players']}
            st['turn'], st['die'], st['msg'] = 0, None, 'Game started'
        else:
            raise ValidationError({"error": "The game has not started yet."})
        return
    if g.finished:
        raise ValidationError({"error": "This game is over."})
    if st['players'][st['turn']] != user.id:
        raise ValidationError({"error": "Wait for your turn."})
    names = {m.id: m.username for m in members}
    if move == 'roll':
        if st.get('die'):
            raise ValidationError({"error": "Move a token first."})
        die = random.randint(1, 6)
        st['die'] = die
        st['seq'] = st.get('seq', 0) + 1                      # the app animates the dice when this number changes
        st['last_die'], st['last_by'] = die, user.id
        movable = _ludo_movable(st, user.id, die)
        if not movable:
            st['msg'] = f"{names.get(user.id, '?')} rolled {die}, no move"
            _ludo_next(st, die == 6)
        elif len(movable) == 1:
            extra, note = _ludo_apply(st, user.id, movable[0], die)
            st['msg'] = f"{names.get(user.id, '?')} rolled {die}" + (' and captured a token!' if note == 'captured' else ' and got a token home!' if note == 'home' else '')
            _ludo_check_win(g, st, user.id)
            _ludo_next(st, extra and not g.finished)
        else:
            st['msg'] = f"{names.get(user.id, '?')} rolled {die}"
        return
    if not st.get('die') or not (isinstance(move, str) and move.startswith('t') and move[1:].isdigit()):
        raise ValidationError({"error": "Roll the dice first."})
    t = int(move[1:])
    die = st['die']
    if t not in _ludo_movable(st, user.id, die):
        raise ValidationError({"error": "That token cannot move."})
    extra, note = _ludo_apply(st, user.id, t, die)
    st['msg'] = f"{names.get(user.id, '?')} moved" + (' and captured a token!' if note == 'captured' else ' and got a token home!' if note == 'home' else '')
    _ludo_check_win(g, st, user.id)
    _ludo_next(st, extra and not g.finished)


def _ludo_check_win(g, st, uid):
    if all(p == 56 for p in st['pos'][str(uid)]):
        g.finished, g.winner_id = True, uid


def _group_move(g, user, move):
    chat = g.message.chat
    if not chat or not chat.participants.filter(pk=user.id).exists():
        raise PermissionDenied("Not your game.")
    st = g.state or {}
    if g.kind == 'ludo':
        _ludo_move(g, user, move, st)
    elif g.kind == 'wyr':
        _vote_move(g, user, move, st, ('a', 'b'))
    elif g.kind == 'mlt':
        _vote_move(g, user, move, st, None)
    elif g.kind == 'grps':
        if g.finished:
            raise ValidationError({"error": "This round is over."})
        picks = st.setdefault('picks', {})
        if move == 'reveal':
            if user.id != g.starter_id:
                raise PermissionDenied("Only the one who started the game can reveal.")
            if len(picks) < 2:
                raise ValidationError({"error": "Need at least 2 players."})
        else:
            if move not in RPS_BEATS:
                raise ValidationError({"error": "Pick rock, paper or scissors."})
            if str(user.id) in picks:
                raise ValidationError({"error": "You already picked."})
            picks[str(user.id)] = move
        everyone = {m.id for m in _members(chat)}
        if move == 'reveal' or everyone <= {int(k) for k in picks}:
            kinds = set(picks.values())
            winners = []
            if len(kinds) == 2:
                win = next(k for k in kinds if RPS_BEATS[k] in kinds)
                winners = [int(u) for u, k in picks.items() if k == win]
            st['winners'] = winners
            g.finished = True
            g.draw = not winners
            if len(winners) == 1:
                g.winner_id = winners[0]
    elif g.kind == 'gnum':
        if g.finished:
            raise ValidationError({"error": "Already guessed!"})
        n = to_int(move)
        if n is None or not 1 <= n <= 100:
            raise ValidationError({"error": "Guess a number from 1 to 100."})
        guesses = st.setdefault('guesses', [])
        secret = st['secret']
        guesses.append({"u": user.id, "n": n})
        st['guesses'] = guesses[-30:]
        if n == secret:
            g.finished, g.winner_id = True, user.id
    elif g.kind == 'gspin':
        members = _members(chat)
        if not members:
            raise ValidationError({"error": "No members."})
        pick = random.choice(members)
        kind = 'truth' if (move == 'truth' or (move != 'dare' and random.random() < 0.5)) else 'dare'
        st.update({"spins": st.get('spins', 0) + 1, "who": pick.id, "who_name": pick.username, "type": kind,
                   "prompt": random.choice(TRUTHS if kind == 'truth' else DARES), "by": user.username})
    g.state = st


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def game_move_view(request):
    user = request.user
    g = Game.objects.select_related('message__chat').filter(pk=to_int(request.data.get('game_id'))).first()
    if g and g.kind in GROUP_GAMES:
        ensure_unlocked(user, g.message.chat)
        _group_move(g, user, request.data.get('move'))
        g.save()
        notify_message(g.message.chat, g.message, 'update')
        return Response(_out(request, g.message))
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
    """What the app gets. Rock-paper-scissors picks stay hidden until both have picked; the number secret never leaves the server."""
    out = {"id": g.id, "kind": g.kind, "starter": g.starter.username, "opponent": g.opponent.username if g.opponent_id else '',
           "starter_id": g.starter_id, "opponent_id": g.opponent_id, "board": g.board,
           "turn_id": g.turn_id, "winner_id": g.winner_id, "winner": g.winner.username if g.winner_id else None,
           "finished": g.finished, "draw": g.draw}
    if g.kind == 'rps':
        out["picked"] = [int(k) for k in g.picks]
        out["my_pick"] = g.picks.get(str(me_id))
        out["picks"] = {k: v for k, v in g.picks.items()} if g.finished else {}
    elif g.kind in GROUP_GAMES:
        st = g.state or {}
        names = {}
        chat = g.message.chat
        if chat:
            names = {m.id: m.username for m in chat.participants.all()}
        if g.kind == 'grps':
            picks = st.get('picks', {})
            out["picked"] = [int(k) for k in picks]
            out["my_pick"] = picks.get(str(me_id))
            out["total"] = len(names)
            if g.finished:
                out["picks"] = [{"id": int(k), "name": names.get(int(k), '?'), "pick": v} for k, v in picks.items()]
                out["winners"] = [names.get(w, '?') for w in st.get('winners', [])]
        elif g.kind == 'gnum':
            secret = st.get('secret')
            out["guesses"] = [{"name": names.get(x['u'], '?'), "n": x['n'],
                               "hint": 'correct' if x['n'] == secret else ('higher' if x['n'] < secret else 'lower')}
                              for x in st.get('guesses', [])][-8:]
            if g.finished:
                out["secret"] = secret
        elif g.kind == 'ludo':
            out["ludo"] = {"players": [{"id": u, "name": names.get(u, '?')} for u in st.get('players', [])],
                           "started": st.get('started', False), "pos": st.get('pos', {}), "die": st.get('die'),
                           "turn": st.get('turn', 0), "msg": st.get('msg', ''), "seq": st.get('seq', 0),
                           "last_die": st.get('last_die'), "last_by": st.get('last_by'),
                           "movable": (_ludo_movable(st, st['players'][st['turn']], st['die'])
                                       if st.get('started') and st.get('die') and not g.finished else [])}
        elif g.kind in ('wyr', 'mlt'):
            votes = st.get('votes', {})
            out["voted"] = [int(k) for k in votes]
            out["my_vote"] = votes.get(str(me_id))
            out["total"] = len(names)
            if g.kind == 'wyr':
                out["a"], out["b"] = st.get('a'), st.get('b')
            else:
                out["q"] = st.get('q')
                out["members"] = [{"id": i, "name": n} for i, n in names.items()]
            if g.finished:
                if g.kind == 'wyr':
                    out["result"] = {"a": [names.get(int(u), '?') for u, v in votes.items() if v == 'a'],
                                     "b": [names.get(int(u), '?') for u, v in votes.items() if v == 'b']}
                else:
                    tally = {}
                    for v in votes.values():
                        tally[v] = tally.get(v, 0) + 1
                    out["result"] = sorted([{"name": names.get(int(t), '?'), "n": c} for t, c in tally.items()], key=lambda x: -x['n'])
        else:
            out["spin"] = {k: st.get(k) for k in ('who', 'who_name', 'type', 'prompt', 'by', 'spins')}
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
