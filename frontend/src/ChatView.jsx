import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { BsCheckAll } from 'react-icons/bs';
import { BiTrash, BiTimer, BiMicrophone, BiX, BiPhoneCall, BiVideo, BiDotsVerticalRounded, BiPlus, BiSearch, BiLock, BiArrowBack, BiSend, BiCheck, BiSmile, BiVolumeMute } from 'react-icons/bi';
import api from './api';
import Avatar from './Avatar';
import MessageBubble from './MessageBubble';
import ForwardModal from './ForwardModal';
import { useModal } from './PromptModal';
import { useRealtime, sendSocket, isSocketOpen } from './socket';
import { getMe, getPicUrl, errMsg, humanDuration, startCall, formatListTime, shortFile } from './config';
import { THEME_CSS, resolveTheme, getAppTheme, themeVars, paintPage } from './theme';
import { Seal, SealButton } from './ui';
import { EventSheet } from './PlusUI2';
import Doodle from './Doodle';
import { startSharing } from './liveShare';
import { ChecklistSheet } from './PlusUI3';
import { shownName, getNick, setNick, getDraft, setDraft } from './nick';
import { gifsAvailable as gifsOn, GallerySheet, InfoSheet, PollSheet, GroupSheet, StickerPanel, MentionList, exportChatText } from './ChatSheets';
import { setActiveChat } from './notify';
import { useChatExtras } from './chatExtras';
import { useBackClose } from './backClose';
import { pushLogin } from './push';
import { playSound } from './sounds';
import EmojiPicker from './EmojiPicker';
import ProfileModal from './ProfileModal';
import { rainAll } from './fx';
import { CapsuleSheet, WhisperSheet, ReminderSheet, ExpenseSheet, BalancesSheet, ModeChip } from './PlusUI';


const DISAPPEAR_CHOICES = [
  { label: 'Off 🛑', value: 0 },
  { label: '10 Seconds 💣', value: 10 },
  { label: '1 Minute', value: 60 },
  { label: '1 Hour', value: 3600 },
  { label: '24 Hours', value: 86400 },
  { label: '7 Days', value: 604800 },
  { label: 'Custom Time ⏳', value: 'custom' },
];

const formatDateLabel = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatRec = (secs) => `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;

function ChatView() {
  const { contactName } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [me, setMe] = useState(null);
  const [friendId, setFriendId] = useState(null);
  const [groupId, setGroupId] = useState(null);
  const [meta, setMeta] = useState(null);
  const [receiver, setReceiver] = useState(null);
  const [messages, setMessages] = useState([]);
  const [booting, setBooting] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [unlocked, setUnlocked] = useState(true);
  const [pinEntry, setPinEntry] = useState('');
  const [pinError, setPinError] = useState('');

  const [newMessage, setNewMessage] = useState(() => getDraft(contactName));
  const [selectedFiles, setSelectedFiles] = useState([]);       // photos, videos, audio, documents waiting to be sent
  const [sendProg, setSendProg] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [isViewOnce, setIsViewOnce] = useState(false);
  const [viewOnceData, setViewOnceData] = useState(null);
  const [sending, setSending] = useState(false);

  const [showTopMenu, setShowTopMenu] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [forwardMsg, setForwardMsg] = useState(null);
  const [pinnedMsg, setPinnedMsg] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const [showGallery, setShowGallery] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const [showPoll, setShowPoll] = useState(false);
  const [showEvent, setShowEvent] = useState(false);
  const [showDoodle, setShowDoodle] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [watching, setWatching] = useState(false);
  useEffect(() => { if (friendId) api.get('users/online-watch/').then((r) => setWatching((r.data || []).includes(friendId))).catch(() => {}); }, [friendId]);
  useEffect(() => { const t = setTimeout(() => { if (!editing) setDraft(contactName, newMessage); }, 400); return () => clearTimeout(t); }, [newMessage, contactName, editing]);
  const [nickTick, setNickTick] = useState(0);
  const [showCapsule, setShowCapsule] = useState(false);
  const [showWhisper, setShowWhisper] = useState(false);
  const [showExpense, setShowExpense] = useState(false);
  const [showBalances, setShowBalances] = useState(false);
  const [remindFor, setRemindFor] = useState(null);          // a message (or {} for a plain reminder)
  const [sendMode, setSendMode] = useState(null);           // { unlock_at } time capsule, or { whisper:[ids], names:[..] }
  const [infoMsg, setInfoMsg] = useState(null);
  const [panelTab, setPanelTab] = useState('emoji');
  const [mentionQuery, setMentionQuery] = useState(null);
  const [stamp, setStamp] = useState(0);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const [friendTyping, setFriendTyping] = useState(false);
  const [groupTyping, setGroupTyping] = useState({});
  const [tick, setTick] = useState(0);

  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const prevMessagesLength = useRef(0);
  const isUserScrolling = useRef(false);
  const mediaRecorderRef = useRef(null);
  const recordingIntervalRef = useRef(null);
  const cancelRecordRef = useRef(false);
  const audioChunksRef = useRef([]);
  const typingTimerRef = useRef(null);
  const lastTypingSent = useRef(0);
  const friendTypingTimer = useRef(null);
  const searchTimer = useRef(null);
  const photoInputRef = useRef(null);
  const inputRef = useRef(null);
  const caretRef = useRef(null);          // last cursor position in the message box (for emojis)
  const markedAt = useRef(0);
  const initToken = useRef(0);
  const statusSeen = useRef(new Map());   // my message id -> last tick status (to play the tick sound)
  const tickRef = useRef(0);
  const ids = useRef({});
  ids.current = { friendId, groupId, chatId: meta?.chat_id, me, locked: !!meta?.is_locked, unlocked };

  const appKey = getAppTheme();
  const T = meta && meta.theme && meta.theme !== 'default' ? resolveTheme(meta.theme) : resolveTheme(appKey);
  const [modal, ask] = useModal(T);
  const isGroupChat = !!groupId;
  const locked = !!meta?.is_locked && !unlocked;
  // the back button closes the search bar / emoji panel / attach menu first
  useBackClose(searchOpen, () => { setSearchOpen(false); setSearchQ(''); setSearchResults([]); });
  useBackClose(showEmoji, () => setShowEmoji(false));
  useBackClose(showAttach, () => setShowAttach(false));
  const extras = useChatExtras({ chatId: meta?.chat_id, ask, messagesLen: messages.length, T, theme: meta?.theme, onTheme: (v) => applyTheme(v) });

  // ------------------------------------------------------------- data loaders
  const fetchMeta = async () => {
    const { friendId: f, groupId: g } = ids.current;
    if (!f && !g) return null;
    try {
      const res = await api.get(g ? `chats/meta/?chat_id=${g}` : `chats/meta/?friend_id=${f}`);
      setMeta(res.data);
      setUnlocked(res.data.is_unlocked);
      return res.data;
    } catch (e) {
      if (e?.response?.status === 403 || e?.response?.status === 404) navigate('/home');
      return null;
    }
  };

  const fetchReceiver = async () => {
    const { friendId: f } = ids.current;
    if (!f) return;
    try {
      const res = await api.get(`users/${f}/`);
      setReceiver(res.data);
      const meId = ids.current.me?.id;
      if (meId != null && res.data.typing_with != null && Number(res.data.typing_with) === Number(meId)) setFriendTyping(true);
    } catch (e) { /* ignore */ }
  };

  const markRead = (list) => {
    const { friendId: f, groupId: g, me: mine } = ids.current;
    if (!mine || Date.now() - markedAt.current < 1500) return;
    if (g) {
      const need = list.some((m) => m.sender !== mine.id && m.message_type !== 'system' && !(m.read_by || []).includes(mine.id));
      if (need) { markedAt.current = Date.now(); api.post('messages/mark_group_read/', { chat_id: g }).catch(() => {}); }
    } else if (f) {
      const need = list.some((m) => m.sender === f && m.status !== 'read');
      if (need) { markedAt.current = Date.now(); api.post('messages/mark_as_read/', { sender_id: f }).catch(() => {}); }
    }
  };

  const fetchMessages = async () => {
    const { friendId: f, groupId: g, locked: isLocked, unlocked: isUnlocked } = ids.current;
    if (!f && !g) return;
    if (isLocked && !isUnlocked) return;
    try {
      const res = await api.get(g ? `messages/?chat=${g}` : `messages/?receiver=${f}`);
      if (Array.isArray(res.data)) {
        setMessages(res.data);
        markRead(res.data);
        // double-tick / blue-tick sound when one of MY messages is delivered or read
        const mineId = ids.current.me?.id;
        if (mineId != null && !g) {
          let ticked = false;
          res.data.forEach((m) => {
            if (m.sender !== mineId) return;
            const old = statusSeen.current.get(m.id);
            if (old && old !== m.status && m.status !== 'sent') ticked = true;
            statusSeen.current.set(m.id, m.status);
          });
          if (ticked) playSound('tick');
        }
      }
    } catch (e) {
      if (e?.response?.status === 423) setUnlocked(false);
    }
  };

  // keep latest versions for timers / socket handlers
  const latest = useRef({});
  latest.current = { fetchMeta, fetchReceiver, fetchMessages };

  // ------------------------------------------------------------ boot a chat
  useEffect(() => {
    const myToken = ++initToken.current;
    setBooting(true);
    setNotFound(false);
    setMessages([]);
    setMeta(null);
    setReceiver(null);
    setFriendId(null);
    setGroupId(null);
    setUnlocked(true);
    setPinEntry('');
    setPinError('');
    setReplyingTo(null);
    setEditing(null);
    setSearchOpen(false);
    prevMessagesLength.current = 0;
    isUserScrolling.current = false;
    statusSeen.current = new Map();

    (async () => {
      try {
        const meData = await getMe();
        pushLogin(meData.id);
        let fid = location.state?.friendId ?? null;
        let gid = location.state?.chatId ?? null;
        if (!fid && !gid) {
          const r = await api.get(`users/?search=${encodeURIComponent(contactName)}`);
          const u = (Array.isArray(r.data) ? r.data : []).find((x) => x.username === contactName);
          if (u) fid = u.id;
          else {
            const ov = await api.get('chats/overview/');
            const g = ((ov.data && ov.data.groups) || []).find((x) => x.group_name === contactName);
            if (g) gid = g.chat_id;
          }
        }
        if (myToken !== initToken.current) return;
        if (!fid && !gid) { setNotFound(true); setBooting(false); return; }
        setMe(meData);
        setFriendId(fid);
        setGroupId(gid);
        ids.current = { ...ids.current, friendId: fid, groupId: gid, me: meData };
        const m = await latest.current.fetchMeta();
        if (myToken !== initToken.current) return;
        if (m) {
          setActiveChat(m.chat_id);
          const saved = localStorage.getItem(`pinned_msg_${gid ? `group_${gid}` : `user_${fid}`}`);
          if (saved) { try { setPinnedMsg(JSON.parse(saved)); } catch (e) { setPinnedMsg(null); } } else setPinnedMsg(null);
          if (m.is_unlocked) {
            ids.current = { ...ids.current, chatId: m.chat_id, locked: m.is_locked, unlocked: true };
            await latest.current.fetchMessages();
          }
        }
        if (fid) latest.current.fetchReceiver();
        setBooting(false);
      } catch (e) {
        if (myToken === initToken.current) { setNotFound(true); setBooting(false); }
      }
    })();
  }, [contactName, location.key]);

  // leaving the chat: stop mic, relock, clear typing, clear active chat
  useEffect(() => () => {
    cancelRecordRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch (e) { /* ignore */ }
    }
    clearInterval(recordingIntervalRef.current);
    clearTimeout(typingTimerRef.current);
    clearTimeout(friendTypingTimer.current);
    setActiveChat(null);
    const { chatId, locked: wasLocked, friendId: f, groupId: g } = ids.current;
    if (wasLocked && chatId) api.post('chats/relock/', { chat_id: chatId }).catch(() => {});
    try {
      if (g) sendSocket({ type: 'typing', chat_id: g, is_typing: false });
      else if (f && !sendSocket({ type: 'typing', to: f, is_typing: false })) api.post('users/stop_typing/').catch(() => {});
    } catch (e) { /* ignore */ }
  }, []);

  // ------------------------------------------------------------- polling
  useEffect(() => {
    const interval = setInterval(() => {
      tickRef.current += 1;
      if (!window.__chatManagerMounted && tickRef.current % 8 === 0) api.post('users/heartbeat/').catch(() => {});
      const open = isSocketOpen();
      if (!open || tickRef.current % 5 === 0) {
        latest.current.fetchMessages();
        if (!open) latest.current.fetchReceiver();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // ------------------------------------------------------------- realtime
  useRealtime((evt) => {
    const cur = ids.current;
    switch (evt.event) {
      case '_open':
        latest.current.fetchMeta().then(() => latest.current.fetchMessages());
        latest.current.fetchReceiver();
        break;
      case 'message':
        if (cur.chatId && Number(evt.chat_id) === Number(cur.chatId)) {
          latest.current.fetchMessages();
          if (evt.action === 'new' && evt.sender_id === cur.friendId) setFriendTyping(false);
        }
        break;
      case 'read':
        if (cur.friendId && evt.reader_id === cur.friendId) latest.current.fetchMessages();
        break;
      case 'rain':
        if (cur.chatId && Number(evt.chat_id) === Number(cur.chatId) && Number(evt.from_id) !== Number(localStorage.getItem('user_id'))) rainAll(evt.emoji);
        break;
      case 'group_read':
        if (cur.chatId && Number(evt.chat_id) === Number(cur.chatId)) latest.current.fetchMessages();
        break;
      case 'chat_updated':
        if (cur.chatId && Number(evt.chat_id) === Number(cur.chatId)) { latest.current.fetchMeta().then(() => latest.current.fetchMessages()); }
        break;
      case 'blocklist': case 'friends_changed':
        latest.current.fetchMeta();
        break;
      case 'presence':
        if (cur.friendId && evt.user_id === cur.friendId) setReceiver((p) => (p ? { ...p, is_online: evt.is_online } : p));
        break;
      case 'typing':
        if (cur.groupId && Number(evt.chat_id) === Number(cur.groupId)) {
          setGroupTyping((p) => {
            const n = { ...p };
            if (evt.is_typing) n[evt.from_name] = Date.now(); else delete n[evt.from_name];
            return n;
          });
        } else if (cur.friendId && evt.from_id === cur.friendId && !evt.chat_id) {
          clearTimeout(friendTypingTimer.current);
          if (evt.is_typing) {
            setFriendTyping(true);
            friendTypingTimer.current = setTimeout(() => setFriendTyping(false), 4000);
          } else setFriendTyping(false);
        }
        break;
      default:
        break;
    }
  });

  useEffect(() => {
    if (!Object.keys(groupTyping).length) return undefined;
    const t = setInterval(() => {
      setGroupTyping((p) => {
        const now = Date.now();
        const n = {};
        Object.entries(p).forEach(([k, v]) => { if (now - v < 4000) n[k] = v; });
        return Object.keys(n).length === Object.keys(p).length ? p : n;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [groupTyping]);

  // when the friend polled-typing fallback sets friendTyping, clear it later
  useEffect(() => {
    if (!friendTyping) return undefined;
    const t = setTimeout(() => setFriendTyping(false), 4500);
    return () => clearTimeout(t);
  }, [friendTyping]);

  // 1-second ticker only while disappearing messages are on (hides expired messages instantly)
  const dTime = meta?.disappearing_time || 0;
  useEffect(() => {
    if (!dTime) return undefined;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [dTime]);

  // screenshot alert (direct chats)
  useEffect(() => {
    const onKey = (e) => {
      if (!friendId || groupId) return;
      if (e.key === 'PrintScreen' || (e.metaKey && e.shiftKey && (e.code === 'Digit3' || e.code === 'Digit4'))) {
        api.post('messages/screenshot_alert/', { receiver_id: friendId }).catch(() => {});
      }
    };
    window.addEventListener('keyup', onKey);
    return () => window.removeEventListener('keyup', onKey);
  }, [friendId, groupId]);

  // ------------------------------------------------------------- scrolling
  const handleScroll = () => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      isUserScrolling.current = scrollHeight - scrollTop - clientHeight > 100;
    }
  };

  // Scrolls ONLY the messages box (not the whole page), so the input never gets pushed off screen.
  const scrollToBottom = (smooth = true) => {
    const el = chatContainerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };

  useEffect(() => {
    if (messages.length > prevMessagesLength.current) {
      const first = prevMessagesLength.current === 0;
      if (first || !isUserScrolling.current) scrollToBottom(!first);
    }
    prevMessagesLength.current = messages.length;
  }, [messages]);

  const jumpTo = (id) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) { ask({ type: 'alert', title: 'Message not found in this chat' }); return; }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightId(id);
    setTimeout(() => setHighlightId(null), 2200);
  };

  // ------------------------------------------------------------- typing
  const sendTyping = (isTyping) => {
    const { friendId: f, groupId: g } = ids.current;
    if (g) { sendSocket({ type: 'typing', chat_id: g, is_typing: isTyping }); return; }
    if (!f) return;
    if (!sendSocket({ type: 'typing', to: f, is_typing: isTyping })) {
      if (isTyping) api.post('users/typing/', { receiver_id: f }).catch(() => {});
      else api.post('users/stop_typing/').catch(() => {});
    }
  };
  const handleTyping = (e) => {
    setNewMessage(e.target.value);
    if (isGroupChat) {
      const m = e.target.value.slice(0, e.target.selectionStart).match(/(^|\s)@([\w.\-]*)$/);
      setMentionQuery(m ? m[2] : null);
    }
    if (Date.now() - lastTypingSent.current > 1500) { lastTypingSent.current = Date.now(); sendTyping(true); }
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => { lastTypingSent.current = 0; sendTyping(false); }, 1800);
  };

  const pickMention = (name) => {
    const pos = caretRef.current == null ? newMessage.length : Math.min(caretRef.current, newMessage.length);
    const before = newMessage.slice(0, pos).replace(/@([\w.\-]*)$/, `@${name} `);
    setNewMessage(before + newMessage.slice(pos));
    caretRef.current = before.length;
    setMentionQuery(null);
    setTimeout(() => inputRef.current && inputRef.current.focus(), 30);
  };

  // emoji button: put the emoji where the cursor was (or at the end)
  const insertEmoji = (emoji) => {
    const pos = caretRef.current == null ? newMessage.length : Math.min(caretRef.current, newMessage.length);
    setNewMessage(newMessage.slice(0, pos) + emoji + newMessage.slice(pos));
    caretRef.current = pos + emoji.length;
  };
  const toggleEmoji = () => {
    setShowAttach(false);
    if (!showEmoji && inputRef.current) inputRef.current.blur();    // hide the keyboard, show the emojis
    setShowEmoji(!showEmoji);
  };

  // desktop: Enter = send, Shift+Enter = new line. Phone: Enter = new line
  const onComposerKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
      e.preventDefault();
      sendMessage(e);
    }
  };

  // auto-grow the composer textarea (max 120px)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [newMessage, isRecording]);

  // ------------------------------------------------------------- sending
  const handleSendError = async (error, fallback) => {
    if (error?.response?.status === 423) { setUnlocked(false); return; }
    await ask({ type: 'alert', title: errMsg(error, fallback) });
    fetchMeta();
  };

  const submitEdit = async () => {
    const text = newMessage.trim();
    if (!text || !editing) return;
    setSending(true);
    try {
      await api.post(`messages/${editing.id}/edit/`, { content: text });
      setEditing(null);
      setNewMessage('');
      fetchMessages();
    } catch (error) { await handleSendError(error, 'Edit failed'); }
    setSending(false);
  };

  const sendMessage = async (e, customContent = null, msgType = 'text') => {
    if (e) e.preventDefault();
    if (sending) return;
    if (editing) { submitEdit(); return; }
    let content = customContent != null ? customContent : newMessage;
    if (!content.trim() && selectedFiles.length === 0) return;

    // every picked file goes out as its own message; the typed text / reply rides on the first one
    const jobs = selectedFiles.length ? selectedFiles : [null];
    setSending(true);
    try {
      for (let i = 0; i < jobs.length; i += 1) {
        const f = jobs[i];
        const first = i === 0;
        const text = first ? content : '';
        const formData = new FormData();
        if (groupId) formData.append('chat', groupId);
        else formData.append('receiver', friendId);
        const body = isViewOnce ? `[VIEW_ONCE]${text}` : text;
        if (body.trim()) formData.append('content', body);
        if (f) formData.append('file_url', shortFile(f));
        if (msgType !== 'text' && first) formData.append('message_type', msgType);
        if (replyingTo && first) formData.append('reply_to', replyingTo.id);
        if (sendMode?.unlock_at) formData.append('unlock_at', sendMode.unlock_at);
        if (sendMode?.timelock) { formData.append('time_lock', '1'); if (sendMode.relock) formData.append('time_lock_relock', '1'); }
        if (sendMode?.whisper) sendMode.whisper.forEach((id) => formData.append('whisper_to', id));
        if (jobs.length > 1) setSendProg(`${i + 1}/${jobs.length}`);

        const response = await api.post('messages/', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        if (response?.data) {
          setMessages((prev) => (prev.some((m) => m.id === response.data.id) ? prev : [...prev, response.data]));
          statusSeen.current.set(response.data.id, response.data.status);
        }
        if (f) setSelectedFiles((prev) => prev.slice(1));          // this one is sent: the rest stay for a retry
        if (first) { setNewMessage(''); setReplyingTo(null); }
      }
      playSound('send');
      setStamp((k) => k + 1);
      setMentionQuery(null);
      setShowEmoji(false);
      caretRef.current = null;
      setNewMessage('');
      setSelectedFiles([]);
      setReplyingTo(null);
      setIsViewOnce(false);
      setSendMode(null);
      clearTimeout(typingTimerRef.current);
      sendTyping(false);
      isUserScrolling.current = false;
      setTimeout(() => scrollToBottom(true), 100);
    } catch (error) { await handleSendError(error, 'Failed to send message!'); }
    setSendProg('');
    setSending(false);
  };

  // pick several files at once (photos, videos, audio, documents); they are added to what is already waiting
  const MAX_FILES = 10;
  const addFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    setShowAttach(false);
    if (!picked.length) return;
    const room = MAX_FILES - selectedFiles.length;
    if (picked.length > room) ask({ type: 'alert', title: `You can send up to ${MAX_FILES} files at once` });
    setSelectedFiles((prev) => [...prev, ...picked.slice(0, Math.max(room, 0))]);
  };

  const shareLocation = () => {
    setShowAttach(false);
    if (!navigator.geolocation) { ask({ type: 'alert', title: 'Geolocation is not supported by your browser' }); return; }
    navigator.geolocation.getCurrentPosition((position) => {
      const { latitude, longitude } = position.coords;
      sendMessage(null, `https://www.google.com/maps?q=${latitude},${longitude}`, 'location');
    }, () => ask({ type: 'alert', title: 'Unable to retrieve your location' }));
  };

  // ------------------------------------------------------------- voice notes
  const sendAudioMessage = async (blob) => {
    const formData = new FormData();
    if (groupId) formData.append('chat', groupId);
    else formData.append('receiver', friendId);
    formData.append('voice_note', blob, `voice.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`);
    formData.append('message_type', 'audio');
    if (replyingTo) formData.append('reply_to', replyingTo.id);
    setReplyingTo(null);
    try {
      const response = await api.post('messages/', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (response?.data) {
        setMessages((prev) => (prev.some((m) => m.id === response.data.id) ? prev : [...prev, response.data]));
        statusSeen.current.set(response.data.id, response.data.status);
      }
      playSound('send');
      setTimeout(() => scrollToBottom(true), 100);
    } catch (error) { await handleSendError(error, 'Failed to send audio!'); }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      setIsRecording(true);
      setRecordingTime(0);
      cancelRecordRef.current = false;
      recordingIntervalRef.current = setInterval(() => setRecordingTime((p) => p + 1), 1000);
      recorder.ondataavailable = (ev) => { if (ev.data.size > 0) audioChunksRef.current.push(ev.data); };
      recorder.onstop = () => {
        clearInterval(recordingIntervalRef.current);
        stream.getTracks().forEach((t) => t.stop());
        setIsRecording(false);
        if (cancelRecordRef.current) return;
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size > 0) sendAudioMessage(blob);
      };
      recorder.start(200);
    } catch (err) {
      ask({ type: 'alert', title: 'Microphone permission denied machan! Browser settings-la check pannu.' });
    }
  };
  const cancelRecording = () => {
    cancelRecordRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
  };
  const sendRecording = () => {
    cancelRecordRef.current = false;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
  };

  // ------------------------------------------------------------- message actions
  const onReact = async (msg, emoji) => {
    try { await api.post(`messages/${msg.id}/react/`, { emoji }); fetchMessages(); } catch (e) { /* ignore */ }
  };

  const onDelete = async (msg) => {
    const isSender = msg.sender === me?.id;
    const choices = [];
    if (isSender) choices.push({ label: '🗑 Delete for Everyone', value: 'everyone' });
    choices.push({ label: 'Delete for Me', value: 'me' });
    const v = await ask({ type: 'choice', title: 'Message Options', choices });
    if (!v) return;
    try {
      if (v === 'everyone') await api.patch(`messages/${msg.id}/`, { is_deleted: true });
      else await api.post(`messages/${msg.id}/hide/`);
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      playSound('delete');
    } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Delete failed') }); }
  };

  const onPin = (msg) => {
    const key = `pinned_msg_${groupId ? `group_${groupId}` : `user_${friendId}`}`;
    if (pinnedMsg && pinnedMsg.id === msg.id) { localStorage.removeItem(key); setPinnedMsg(null); return; }
    const small = { id: msg.id, content: msg.content, message_type: msg.message_type, file_name: msg.file_name };
    localStorage.setItem(key, JSON.stringify(small));
    setPinnedMsg(small);
  };

  const onEdit = (msg) => {
    setEditing(msg);
    setReplyingTo(null);
    setNewMessage(msg.content || '');
    setTimeout(() => inputRef.current && inputRef.current.focus(), 50);
  };

  const onCopy = async (msg) => {
    try { await navigator.clipboard.writeText((msg.content || '').replace('[VIEW_ONCE]', '')); } catch (e) { /* ignore */ }
  };

  // seen-by (groups) and message info (direct) share one screen
  const onSeenBy = (msg) => setInfoMsg(msg);

  const onStar = async (msg) => {
    try {
      const r = await api.post('messages/star/', { message_id: msg.id });
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, is_starred: !!r.data.starred } : m)));
    } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Could not star this message') }); }
  };

  const onVote = async (optionId) => {
    try {
      const r = await api.post('polls/vote/', { option_id: optionId });
      if (r.data && r.data.id) setMessages((prev) => prev.map((m) => (m.id === r.data.id ? r.data : m)));
    } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Could not vote') }); }
  };

  // locked message: stays open after they unlock it, or locks again every time they leave the chat
  const chooseLockMode = async () => {
    setShowAttach(false);
    if (sendMode?.timelock) { setSendMode(null); return; }
    const v = await ask({ type: 'choice', title: 'Locked message', message: 'They open it by typing the time it was sent, like 1230.', choices: [
      { label: '🔓 Stays open once they unlock it', value: 'stay' },
      { label: '🔒 Locks again when they leave the chat', value: 'relock' }] });
    if (!v) return;
    setSendMode({ timelock: true, relock: v === 'relock' });
    setTimeout(() => inputRef.current && inputRef.current.focus(), 80);
  };

  // "lock again" messages close when I leave this chat or put the app in the background
  const relockRef = useRef(() => {});
  relockRef.current = () => {
    const mineId = Number(localStorage.getItem('user_id'));
    if (!meta?.chat_id || !messages.some((m) => m.time_lock_relock && m.time_lock && !m.masked && m.sender !== mineId)) return;
    api.post('messages/time_relock/', { chat_id: meta.chat_id }).catch(() => {});
    setMessages((prev) => prev.map((m) => (m.time_lock_relock && m.time_lock && m.sender !== mineId
      ? { ...m, masked: 'timelock', content: '', file_url: null, voice_note: null, file_name: null } : m)));
  };
  useEffect(() => {
    const onHide = () => { if (document.hidden) relockRef.current(); };
    document.addEventListener('visibilitychange', onHide);
    return () => { document.removeEventListener('visibilitychange', onHide); relockRef.current(); };
  }, []);

  const createExpense = async (payload) => {
    const r = await api.post('expenses/create/', { chat_id: meta.chat_id, ...payload });
    if (r.data && r.data.id) setMessages((prev) => (prev.some((m) => m.id === r.data.id) ? prev : [...prev, r.data]));
    playSound('send');
    setShowExpense(false);
    setTimeout(() => scrollToBottom(true), 100);
  };

  const onSettle = async (expenseId, userId) => {
    try {
      const r = await api.post('expenses/settle/', { expense_id: expenseId, user_id: userId });
      if (r.data && r.data.id) setMessages((prev) => prev.map((m) => (m.id === r.data.id ? r.data : m)));
    } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Could not update') }); }
  };

  const createReminder = async ({ text, remind_at }) => {
    await api.post('reminders/create/', { chat_id: meta.chat_id, text, remind_at, message_id: remindFor?.id });
    setRemindFor(null);
    ask({ type: 'alert', title: 'Reminder set', message: 'Both of you will get it at that time.' });
  };

  const createPoll = async (payload) => {
    try {
      const r = await api.post('polls/create/', { chat_id: meta.chat_id, ...payload });
      if (r.data && r.data.id) setMessages((prev) => (prev.some((m) => m.id === r.data.id) ? prev : [...prev, r.data]));
      playSound('send');
      setTimeout(() => scrollToBottom(true), 100);
      return true;
    } catch (e) { await handleSendError(e, 'Could not create the poll'); return false; }
  };

  const watchToggle = async () => {
    try {
      const r = await api.post('users/online-watch/', { user_id: friendId, on: !watching });
      const on = (r.data || []).includes(friendId);
      setWatching(on);
      if (on) ask({ type: 'alert', title: 'Done', message: `You will get one notification when ${contactName} is next online.` });
    } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Failed') }); }
  };
  const nicknameMenu = async () => {
    const v = await ask({ type: 'prompt', title: `Nickname for ${contactName}`, message: 'Only you see it. Leave empty to remove.', initial: getNick(contactName), maxLength: 30, okText: 'Save' });
    if (v === null || v === undefined || v === false) return;
    setNick(contactName, String(v).trim());
    setNickTick((n) => n + 1);
  };
  const createChecklist = async (payload) => {
    try {
      const r = await api.post('checklist/create/', { chat_id: meta.chat_id, ...payload });
      if (r.data && r.data.id) setMessages((prev) => (prev.some((m) => m.id === r.data.id) ? prev : [...prev, r.data]));
      setTimeout(() => scrollToBottom(true), 100);
      return true;
    } catch (e) { await handleSendError(e, 'Could not create the checklist'); return false; }
  };
  const startLive = () => {
    setShowAttach(false);
    if (!navigator.geolocation) { ask({ type: 'alert', title: 'Geolocation is not supported by your browser' }); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const r = await api.post('live/start/', { chat_id: meta.chat_id, lat: pos.coords.latitude, lng: pos.coords.longitude, minutes: 60 });
        if (r.data && r.data.id) { setMessages((prev) => (prev.some((m) => m.id === r.data.id) ? prev : [...prev, r.data])); startSharing(r.data.id); }
        setTimeout(() => scrollToBottom(true), 100);
      } catch (e) { await handleSendError(e, 'Could not share live location'); }
    }, () => ask({ type: 'alert', title: 'Unable to retrieve your location' }));
  };
  const startGame = async () => {
    setShowAttach(false);
    const kind = await ask({ type: 'choice', title: 'Play a game', choices: [{ label: '❌⭕ Tic-tac-toe', value: 'ttt' }, { label: '🪨📄✂️ Rock paper scissors', value: 'rps' }] });
    if (!kind) return;
    try {
      const r = await api.post('games/create/', { chat_id: meta.chat_id, kind });
      if (r.data && r.data.id) setMessages((prev) => (prev.some((m) => m.id === r.data.id) ? prev : [...prev, r.data]));
      setTimeout(() => scrollToBottom(true), 100);
    } catch (e) { await handleSendError(e, 'Could not start the game'); }
  };
  const createAlbum = async () => {
    const title = await ask({ type: 'prompt', title: 'New photo album', message: 'Everybody in this chat can add photos. It disappears after 24 hours.', initial: '', maxLength: 60, okText: 'Create' });
    if (title === null || title === undefined || title === false) return;
    try {
      const r = await api.post('albums/create/', { chat_id: meta.chat_id, title });
      if (r.data && r.data.id) setMessages((prev) => (prev.some((m) => m.id === r.data.id) ? prev : [...prev, r.data]));
      setTimeout(() => scrollToBottom(true), 100);
    } catch (e) { await handleSendError(e, 'Could not create the album'); }
  };
  const onAlbumChanged = (m) => setMessages((prev) => prev.map((x) => (x.id === m.id ? m : x)));

  const sendSticker = (emoji) => sendMessage(null, `[STICKER]${emoji}`);
  const sendGif = (url) => sendMessage(null, `[GIF]${url}`);

  const closeViewOnce = async () => {
    if (!viewOnceData) return;
    const msgId = viewOnceData.id;
    setViewOnceData(null);
    localStorage.setItem(`viewed_once_${msgId}`, 'true');
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
    try {
      if (groupId) await api.post(`messages/${msgId}/hide/`);
      else await api.delete(`messages/${msgId}/`);
    } catch (err) {
      try { await api.post(`messages/${msgId}/hide/`); } catch (e) { /* ignore */ }
    }
  };

  // ------------------------------------------------------------- search
  const doSearch = (q) => {
    setSearchQ(q);
    clearTimeout(searchTimer.current);
    if (!q.trim() || !meta) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const r = await api.get(`messages/search/?chat_id=${meta.chat_id}&q=${encodeURIComponent(q)}`);
        setSearchResults(Array.isArray(r.data) ? r.data : []);
      } catch (e) { setSearchResults([]); }
    }, 300);
  };

  // ------------------------------------------------------------- lock screen
  const submitPin = async (e) => {
    e.preventDefault();
    setPinError('');
    try {
      await api.post('chats/unlock/', { chat_id: meta.chat_id, pin: pinEntry });
      setPinEntry('');
      ids.current = { ...ids.current, unlocked: true };
      setUnlocked(true);
      await fetchMeta();
      await fetchMessages();
    } catch (err) {
      const d = err?.response?.data;
      if (err?.response?.status === 429) setPinError(errMsg(err, 'Too many attempts. Konjam neram kazhichu try pannunga.'));
      else setPinError(`❌ Incorrect PIN${d?.attempts_left != null ? ` (${d.attempts_left} attempts left)` : ''}`);
      setPinEntry('');
    }
  };

  // ------------------------------------------------------------- menu actions
  const askPin = (title) => ask({ type: 'prompt', title, inputType: 'password', maxLength: 4, placeholder: '••••' });

  const lockMenu = async () => {
    if (!meta) return;
    if (!meta.is_locked) {
      const pin = await askPin('Set a 4-digit PIN 🔒');
      if (pin == null) return;
      if (!/^\d{4}$/.test(pin)) { ask({ type: 'alert', title: 'PIN must be exactly 4 digits' }); return; }
      try { await api.post('chats/lock/', { chat_id: meta.chat_id, pin }); await fetchMeta(); ask({ type: 'alert', title: 'Chat locked 🔐' }); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Failed') }); }
      return;
    }
    const what = await ask({ type: 'choice', title: 'Chat Lock', choices: [{ label: '🔁 Change PIN', value: 'change' }, { label: '🔓 Remove lock', value: 'remove' }] });
    if (!what) return;
    const oldPin = await askPin('Enter current PIN');
    if (oldPin == null) return;
    let pin = '';
    if (what === 'change') {
      pin = await askPin('Enter NEW 4-digit PIN');
      if (pin == null) return;
      if (!/^\d{4}$/.test(pin)) { ask({ type: 'alert', title: 'PIN must be exactly 4 digits' }); return; }
    }
    try {
      await api.post('chats/lock/', { chat_id: meta.chat_id, old_pin: oldPin, pin });
      await fetchMeta();
      ask({ type: 'alert', title: what === 'change' ? 'PIN changed ✅' : 'Lock removed 🔓' });
    } catch (e) {
      const d = e?.response?.data;
      ask({ type: 'alert', title: `${errMsg(e, 'Failed')}${d?.attempts_left != null ? ` (${d.attempts_left} attempts left)` : ''}` });
    }
  };

  const disappearingMenu = async () => {
    if (!meta) return;
    let v = await ask({ type: 'choice', title: 'Disappearing messages', current: meta.disappearing_time, choices: DISAPPEAR_CHOICES });
    if (v == null) return;
    if (v === 'custom') {
      const s = await ask({ type: 'prompt', title: 'Enter seconds (e.g. 3600 = 1 hour)', inputType: 'number', maxLength: 8, initial: '3600' });
      if (s == null) return;
      v = parseInt(s, 10);
      if (!v || v < 1) { ask({ type: 'alert', title: 'Enter a valid number' }); return; }
    }
    try {
      await api.post('chats/disappearing/', { chat_id: meta.chat_id, seconds: v });
      await fetchMeta();
      await fetchMessages();
    } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Failed') }); }
  };

  const applyTheme = async (v) => {
    if (!meta) return;
    try { await api.post('chats/theme/', { chat_id: meta.chat_id, theme: v }); await fetchMeta(); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Failed') }); }
  };

  const toggleSetting = async (key) => {
    try { await api.post('chats/settings/', { chat_id: meta.chat_id, [key]: !meta[key] }); await fetchMeta(); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Failed') }); }
  };

  const clearChat = async () => {
    const hasStarred = messages.some((m) => m.is_starred);
    const hasPinned = !!pinnedMsg;
    let keep = false;
    if (hasStarred || hasPinned) {
      // starred / pinned messages: let the user decide whether they go too
      const what = hasStarred && hasPinned ? 'starred and pinned' : (hasStarred ? 'starred' : 'pinned');
      const v = await ask({
        type: 'choice',
        title: 'Clear this chat?',
        message: `You have ${what} messages in this chat. Should they be deleted too?`,
        choices: [
          { label: `Keep ${what} messages`, value: 'keep' },
          { label: `Delete everything, even ${what}`, value: 'all', danger: true },
        ],
      });
      if (!v) return;
      keep = v === 'keep';
    } else {
      const ok = await ask({ type: 'confirm', title: 'Clear this chat for you?', danger: true, okText: 'Clear' });
      if (!ok) return;
    }
    try {
      await api.post(`chats/${meta.chat_id}/clear_chat/`, keep ? { keep_starred: true, keep_ids: pinnedMsg ? [pinnedMsg.id] : [] } : {});
      if (keep) {
        setMessages((prev) => prev.filter((m) => m.is_starred || (pinnedMsg && m.id === pinnedMsg.id)));
      } else {
        setMessages([]);
        if (pinnedMsg) {
          try { localStorage.removeItem(`pinned_msg_${groupId ? `group_${groupId}` : `user_${friendId}`}`); } catch (e) { /* ignore */ }
          setPinnedMsg(null);
        }
      }
    } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Failed') }); }
  };

  const reportUser = async () => {
    const reason = await ask({ type: 'choice', title: `Report ${contactName}?`, message: 'The admin will review this account.', choices: [
      { label: 'Spam', value: 'spam' }, { label: 'Harassment', value: 'harassment' }, { label: 'Fake account', value: 'fake' },
      { label: 'Inappropriate content', value: 'inappropriate' }, { label: 'Something else', value: 'other' }] });
    if (!reason) return;
    try { await api.post('reports/', { user_id: friendId, reason }); ask({ type: 'alert', title: 'Reported', message: 'Thanks. The admin will look at it.' }); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Failed') }); }
  };
  const blockToggle = async () => {
    if (!friendId) return;
    if (meta?.blocked_by_me) {
      try { await api.post('users/unblock/', { user_id: friendId }); await fetchMeta(); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Failed') }); }
      return;
    }
    const ok = await ask({ type: 'confirm', title: `Block ${contactName}?`, message: 'They cannot message or call you.', danger: true, okText: 'Block' });
    if (!ok) return;
    try { await api.post('users/block/', { user_id: friendId }); await fetchMeta(); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Failed') }); }
  };

  const unfriend = async () => {
    const ok = await ask({ type: 'confirm', title: `Unfriend ${contactName}?`, danger: true, okText: 'Unfriend' });
    if (!ok) return;
    try { await api.post('users/unfriend/', { user_id: friendId }); navigate('/home'); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Failed') }); }
  };

  const exitGroup = async () => {
    const ok = await ask({ type: 'confirm', title: 'Exit this group?', danger: true, okText: 'Exit' });
    if (!ok) return;
    try { await api.post(`chats/${groupId}/leave_group/`); navigate('/home'); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Failed to exit group') }); }
  };

  const deleteGroup = async () => {
    const ok = await ask({ type: 'confirm', title: 'Delete this group for everyone?', danger: true, okText: 'Delete' });
    if (!ok) return;
    try { await api.delete(`chats/${groupId}/`); navigate('/home'); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Only the group creator can delete the group') }); }
  };

  const muteMenu = async () => {
    if (!meta) return;
    if (meta.is_muted) {
      try { await api.post('chats/settings/', { chat_id: meta.chat_id, mute_hours: 0 }); await fetchMeta(); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Failed') }); }
      return;
    }
    const hours = await ask({ type: 'choice', title: 'Mute notifications for', choices: [{ label: '8 hours', value: 8 }, { label: '1 week', value: 168 }, { label: 'Always', value: -1 }] });
    if (hours == null) return;
    try { await api.post('chats/settings/', { chat_id: meta.chat_id, mute_hours: hours }); await fetchMeta(); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Failed') }); }
  };

  const archiveToggle = async () => {
    try {
      await api.post('chats/settings/', { chat_id: meta.chat_id, is_archived: !meta.is_archived });
      if (!meta.is_archived) navigate('/home'); else fetchMeta();
    } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Failed') }); }
  };

  const doExport = () => exportChatText(contactName, messages);

  const menuItems = !meta ? [] : [
    ...(!isGroupChat ? [['View profile', () => setProfileOpen(true)], ['Set nickname', nicknameMenu], [watching ? '🔕 Cancel online alert' : '🔔 Tell me when online', watchToggle]] : [['Group info and members', () => setShowGroup(true)]]),
    ['Search messages', () => { setSearchOpen(true); }],
    ['Media, docs and links', () => setShowGallery(true)],
    [`Disappearing: ${humanDuration(meta.disappearing_time)}`, disappearingMenu],
    [meta.is_locked ? 'Chat lock (change or remove)' : 'Chat lock', lockMenu],
    ['Chat theme and wallpaper', extras.openTheme],
    [`Scheduled messages (${extras.scheduledCount})`, extras.openScheduledList],
    ['Expense balances', () => setShowBalances(true)],
    [meta.is_pinned ? 'Unpin chat' : 'Pin chat', () => toggleSetting('is_pinned')],
    [meta.is_muted ? 'Unmute' : 'Mute…', muteMenu],
    [meta.is_archived ? 'Unarchive' : 'Archive chat', archiveToggle],
    ['Export chat (.txt)', doExport],
    ['Clear chat (for me)', clearChat, true],
    ...(!isGroupChat ? [
      [meta.blocked_by_me ? 'Unblock' : 'Block', blockToggle, !meta.blocked_by_me],
      ['Report', reportUser, true],
      ['Unfriend', unfriend, true],
    ] : [
      ['Exit group', exitGroup, true],
      ...(meta.created_by === me?.id ? [['Delete group', deleteGroup, true]] : []),
    ]),
  ];

  // ------------------------------------------------------------- derived view data
  const dStarted = meta?.disappearing_started_at ? new Date(meta.disappearing_started_at).getTime() : null;
  const nowMs = Date.now();
  const visible = messages.filter((m) => {
    if (!m) return false;
    if ((m.content || '').startsWith('[VIEW_ONCE]') && localStorage.getItem(`viewed_once_${m.id}`) === 'true') return false;
    if (dTime > 0 && dStarted && m.message_type !== 'system') {
      const created = new Date(m.created_at).getTime();
      if (created >= dStarted && nowMs - created > dTime * 1000) return false;
    }
    return true;
  });
  void tick;

  const typingNames = Object.keys(groupTyping).filter((n) => n !== me?.username);
  const subtitle = isGroupChat
    ? (typingNames.length ? `${typingNames.join(', ')} ${typingNames.length > 1 ? 'are' : 'is'} typing…` : `${(meta?.participants || []).length} members`)
    : (meta?.blocked_me ? '' : (friendTyping ? 'typing…' : (receiver?.is_online ? 'Online' : (receiver?.last_seen ? `last seen ${formatListTime(receiver.last_seen)}` : 'Offline'))));
  const online = !isGroupChat && !friendTyping && !!receiver?.is_online && !meta?.blocked_me;

  let lastDisplayedDate = null;

  // ------------------------------------------------------------- render
  const shellClass = `chat-shell ${T.light ? 't-light' : ''}`;
  const vars = themeVars(T);
  useEffect(() => { paintPage(T); }, [T.bg]);

  if (booting || notFound) {
    return (
      <div className={shellClass} style={{ ...vars, alignItems: 'center' }}>
        <style>{THEME_CSS}</style>
        <div style={{ textAlign: 'center', alignSelf: 'center', color: 'var(--text)' }}>
          {booting ? (<><Seal size={64} keyhole /><p style={{ marginTop: 14, color: 'var(--sub)' }}>Opening chat…</p></>) : (
            <><p>Could not find this chat.</p><button type="button" className="sc-btn" onClick={() => navigate('/home')}>Back to chats</button></>
          )}
        </div>
      </div>
    );
  }

  if (locked) {
    return (
      <div className={shellClass} style={vars}>
        <style>{THEME_CSS}</style>
        <div className="sc-card" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 28, gap: 6 }}>
          <Seal size={84} keyhole />
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, margin: '14px 0 2px' }}>{contactName} is locked</h2>
          <p style={{ color: 'var(--sub)', margin: 0 }}>Enter this chat's 4-digit PIN</p>
          <form onSubmit={submitPin} style={{ width: '100%', maxWidth: 260 }}>
            <input autoFocus type="password" inputMode="numeric" maxLength={4} value={pinEntry} placeholder="••••" aria-label="Chat PIN"
              onChange={(e) => setPinEntry(e.target.value.replace(/\D/g, ''))}
              className="sc-field" style={{ textAlign: 'center', fontSize: 26, letterSpacing: 12, height: 56, margin: '18px 0 8px' }} />
            {pinError && <div style={{ color: '#ff7d8c', fontSize: 14, marginBottom: 8 }}>{pinError}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button type="button" className="sc-btn ghost" onClick={() => navigate('/home')}>Back</button>
              <button type="submit" className="sc-btn" disabled={pinEntry.length !== 4}>Unlock</button>
            </div>
          </form>
        </div>
        {modal}
      </div>
    );
  }

  const mentionNames = isGroupChat ? new Set((meta?.participants || []).map((p) => p.username.toLowerCase())) : null;
  const bubbleCommon = {
    isGroup: isGroupChat,
    T,
    mentionNames,
    onReply: (m) => { setEditing(null); setReplyingTo(m); setTimeout(() => inputRef.current && inputRef.current.focus(), 50); },
    onDelete,
    onReact,
    onPin,
    onForward: (m) => setForwardMsg(m),
    onEdit,
    onCopy,
    onSeenBy,
    onInfo: (m) => setInfoMsg(m),
    onStar,
    onVote,
    meId: me?.id,
    onRemind: (m) => setRemindFor(m),
    onSettle,
    onAlbumChanged,
    onAsk: ask,
    onUnlockTime: async (m) => {
      const code = await ask({ type: 'prompt', title: 'Locked message', message: 'Type the time this message was sent, like 1230.', placeholder: '1230', inputType: 'text', inputMode: 'numeric', maxLength: 5, okText: 'Open' });
      if (code === null || !String(code).trim()) return;
      try {
        const r = await api.post('messages/time_unlock/', { message_id: m.id, code, tz_offset: new Date().getTimezoneOffset() });
        if (r.data && r.data.id) setMessages((prev) => prev.map((x) => (x.id === r.data.id ? r.data : x)));
      } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Could not open it') }); }
    },
    onRain: (m, emoji) => { api.post('messages/rain/', { message_id: m.id, emoji }).catch(() => {}); },
    onBalances: () => setShowBalances(true),
    onCapsuleOpened: () => fetchMessages(),
    onOpenViewOnce: (m) => setViewOnceData(m),
  };

  const hasText = !!newMessage.trim() || selectedFiles.length > 0;
  const closePanels = () => { setShowAttach(false); setShowEmoji(false); };
  const replyPreview = (m) => (m.content ? m.content.replace('[VIEW_ONCE]', '').replace('[STICKER]', '') : (m.file_name || 'Media'));

  return (
    <div className={`${shellClass} position-relative`} style={vars}>
      <style>
        {`
        @keyframes blinker { 50% { opacity: 0; } }
        .blink-anim { animation: blinker 1s linear infinite; }
        @keyframes popIn { 0% { transform: scale(0.8); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        .pop-anim { animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        ${THEME_CSS}
        `}
      </style>

      {modal}
      {extras.modals}
      {extras.wallpaperInput}
      {forwardMsg && (
        <ForwardModal msg={forwardMsg} T={T} onClose={(sent) => { setForwardMsg(null); if (sent) ask({ type: 'alert', title: 'Forwarded' }); }} />
      )}

      {profileOpen && !isGroupChat && (
        <ProfileModal user={receiver} name={contactName} T={T} online={online} onClose={() => setProfileOpen(false)} />
      )}
      {showGallery && <GallerySheet T={T} chatId={meta.chat_id} onClose={() => setShowGallery(false)} />}
      {showGroup && isGroupChat && <GroupSheet T={T} meta={meta} me={me} ask={ask} onClose={() => setShowGroup(false)} onChanged={fetchMeta} />}
      {showChecklist && <ChecklistSheet T={T} onClose={() => setShowChecklist(false)} onCreate={createChecklist} />}
      {showDoodle && <Doodle T={T} onClose={() => setShowDoodle(false)} onDone={(f) => setSelectedFiles((prev) => [...prev, f].slice(0, MAX_FILES))} />}
      {showEvent && <EventSheet T={T} onClose={() => setShowEvent(false)} onCreate={createPoll} />}
      {showPoll && <PollSheet T={T} onClose={() => setShowPoll(false)} onCreate={createPoll} />}
      {showCapsule && <CapsuleSheet T={T} onClose={() => setShowCapsule(false)} onSet={(iso) => { setSendMode({ unlock_at: iso }); setShowCapsule(false); setTimeout(() => inputRef.current && inputRef.current.focus(), 80); }} />}
      {showWhisper && isGroupChat && <WhisperSheet T={T} members={meta?.participants} meId={me?.id} onClose={() => setShowWhisper(false)}
        onSet={(ids) => { setSendMode({ whisper: ids, names: (meta?.participants || []).filter((p) => ids.includes(p.id)).map((p) => p.username) }); setShowWhisper(false); setTimeout(() => inputRef.current && inputRef.current.focus(), 80); }} />}
      {showExpense && meta && <ExpenseSheet T={T} members={meta.participants} meId={me?.id} onClose={() => setShowExpense(false)} onCreate={createExpense} />}
      {showBalances && meta && <BalancesSheet T={T} chatId={meta.chat_id} meId={me?.id} onClose={() => setShowBalances(false)} />}
      {remindFor && <ReminderSheet T={T} defaultText={remindFor.content && !String(remindFor.content).startsWith('[') ? String(remindFor.content).slice(0, 120) : ''} onClose={() => setRemindFor(null)} onCreate={createReminder} />}
      {infoMsg && <InfoSheet T={T} msg={infoMsg} isGroup={isGroupChat} participants={meta?.participants} onClose={() => setInfoMsg(null)} />}

      {viewOnceData && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(8,4,12,.96)', backdropFilter: 'blur(10px)' }}>
          <div className="pop-anim" style={{ position: 'relative', width: '100%', maxWidth: 440, padding: 22, borderRadius: 28, background: 'var(--raised)', border: '1px solid var(--line)', textAlign: 'center', color: 'var(--text)' }}>
            <button type="button" className="sc-iconbtn" style={{ position: 'absolute', top: 12, right: 12 }} aria-label="Close and destroy" onClick={closeViewOnce}><BiX /></button>
            <Seal size={52} seed={7} style={{ margin: '0 auto' }} />
            <h4 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, margin: '10px 0 16px' }}>Seal broken</h4>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {viewOnceData.file_url && viewOnceData.message_type === 'video' && <video src={getPicUrl(viewOnceData.file_url)} controls autoPlay style={{ maxWidth: '100%', maxHeight: '50vh', borderRadius: 16 }} />}
              {viewOnceData.file_url && viewOnceData.message_type === 'image' && <img src={getPicUrl(viewOnceData.file_url)} alt="View once" style={{ maxWidth: '100%', maxHeight: '50vh', borderRadius: 16 }} />}
              {viewOnceData.file_url && viewOnceData.message_type === 'document' && <a href={getPicUrl(viewOnceData.file_url)} target="_blank" rel="noreferrer" className="sc-btn">{viewOnceData.file_name || 'Open document'}</a>}
              {viewOnceData.content && viewOnceData.content.replace('[VIEW_ONCE]', '') && (
                <div style={{ fontSize: 22, fontWeight: 600, marginTop: 16, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{viewOnceData.content.replace('[VIEW_ONCE]', '')}</div>
              )}
            </div>
            <p style={{ margin: '18px 0 0', color: 'var(--sub)', fontSize: 13 }}><BiTimer /> This message is destroyed when you close it.</p>
          </div>
        </div>
      )}

      <div className="sc-card">

        {/* ---------------------------------------------------------- header */}
        <header className="sc-chat-top">
          <button type="button" className="sc-iconbtn" style={{ background: 'transparent' }} aria-label="Back to chats" onClick={() => navigate('/home')}><BiArrowBack /></button>
          <div className="sc-chat-id" role="button" tabIndex={0} style={{ cursor: 'pointer' }}
               onClick={() => (isGroupChat ? setShowGroup(true) : setProfileOpen(true))}
               onKeyDown={(e) => { if (e.key === 'Enter') (isGroupChat ? setShowGroup(true) : setProfileOpen(true)); }}>
            {isGroupChat
              ? (meta?.group_photo ? <Avatar src={meta.group_photo} name={contactName} size={42} T={T} /> : <Seal size={42} keyhole seed={4} />)
              : <Avatar src={receiver?.profile_picture} name={contactName} size={42} online={online} T={T} />}
            <div style={{ minWidth: 0 }}>
              <h2 className="sc-chat-name">
                <span className="t">{shownName(contactName)}{nickTick ? '' : ''}</span>
                {meta?.is_muted && <BiVolumeMute style={{ color: 'var(--sub)', fontSize: 16 }} aria-label="Muted" />}
                {meta?.is_locked && <BiLock style={{ color: 'var(--accent)', fontSize: 15 }} aria-label="Locked" />}
                {dTime > 0 && <span className="sc-badge" style={{ height: 18, minWidth: 0, fontSize: 10, gap: 3, display: 'inline-flex', alignItems: 'center' }}><BiTimer />{humanDuration(dTime)}</span>}
              </h2>
              <span className={`sc-chat-sub${online ? ' on' : ''}`}>{subtitle}{!isGroupChat && receiver?.mood ? ` · ${receiver.mood.emoji} ${receiver.mood.text}`.trimEnd() : ''}{!isGroupChat && meta?.streak > 1 ? ` · 🔥 ${meta.streak}` : ''}</span>
            </div>
          </div>
          <button type="button" className="sc-iconbtn" aria-label="Voice call"
            onClick={() => startCall(isGroupChat ? { group: true, chatId: groupId, name: contactName, callType: 'audio' } : { friendId, name: contactName, callType: 'audio' })}><BiPhoneCall /></button>
          <button type="button" className="sc-iconbtn" aria-label="Video call"
            onClick={() => startCall(isGroupChat ? { group: true, chatId: groupId, name: contactName, callType: 'video' } : { friendId, name: contactName, callType: 'video' })}><BiVideo /></button>
          <div style={{ position: 'relative' }}>
            <button type="button" className="sc-iconbtn" aria-label="More options" onClick={() => setShowTopMenu(!showTopMenu)}><BiDotsVerticalRounded /></button>
            {showTopMenu && (
              <>
                <div onClick={() => setShowTopMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 900 }} />
                <div className="sc-menu hide-scroll" style={{ top: '110%', right: 0, minWidth: 250, maxHeight: '65vh', overflowY: 'auto' }}>
                  {menuItems.map(([label, fn, danger]) => (
                    <button key={label} type="button" className={danger ? 'danger' : ''} onClick={() => { setShowTopMenu(false); fn(); }}>{label}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </header>

        {/* ---------------------------------------------------------- search */}
        {searchOpen && (
          <div style={{ flexShrink: 0, padding: '8px 12px 0' }}>
            <div className="sc-search" style={{ margin: 0 }}>
              <BiSearch style={{ fontSize: 20 }} />
              <input autoFocus placeholder="Search in this chat" value={searchQ} onChange={(e) => doSearch(e.target.value)} aria-label="Search in this chat" />
              <button type="button" className="sc-dots" aria-label="Close search" onClick={() => { setSearchOpen(false); setSearchQ(''); setSearchResults([]); }}><BiX /></button>
            </div>
            {searchQ.trim() && (
              <div className="sc-set-group hide-scroll" style={{ maxHeight: 180, overflowY: 'auto', margin: '8px 0 0' }}>
                {searchResults.length === 0 && <div style={{ padding: 14, color: 'var(--sub)' }}>No messages found.</div>}
                {searchResults.map((m) => (
                  <button key={m.id} type="button" className="sc-set" style={{ padding: '10px 14px' }}
                    onClick={() => { setSearchOpen(false); setSearchQ(''); setSearchResults([]); setTimeout(() => jumpTo(m.id), 100); }}>
                    <span className="txt"><small style={{ color: 'var(--accent)', fontWeight: 600 }}>{m.sender_name} · {formatListTime(m.created_at)}</small><b style={{ fontWeight: 500, fontFamily: 'var(--font-body)' }} className="text-truncate">{m.content}</b></span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---------------------------------------------------------- messages */}
        <div
          className="sc-msgs hide-scroll"
          style={extras.wallpaperStyle}
          ref={chatContainerRef}
          onScroll={handleScroll}
          onLoadCapture={() => { if (!isUserScrolling.current) scrollToBottom(false); }}
        >
          {pinnedMsg && (
            <div className="sc-chip-row accent" style={{ position: 'sticky', top: 0, zIndex: 100, margin: '0 0 8px' }}>
              <div className="text-truncate" style={{ flex: 1, cursor: 'pointer' }} onClick={() => jumpTo(pinnedMsg.id)}>
                <b>Pinned </b><span style={{ color: 'var(--sub)' }}>{pinnedMsg.content ? pinnedMsg.content.replace('[VIEW_ONCE]', '') : (pinnedMsg.file_name || 'Media message')}</span>
              </div>
              <button type="button" className="sc-dots" aria-label="Unpin" onClick={() => onPin(pinnedMsg)}><BiX /></button>
            </div>
          )}

          <div className="sc-note"><BiLock style={{ verticalAlign: '-2px' }} /> Private chat. Swipe a message right to reply, long-press for more.</div>

          {isGroupChat && meta?.group_description && <div className="sc-note">{meta.group_description}</div>}

          {visible.map((msg) => {
            const label = formatDateLabel(msg.created_at);
            const showDate = lastDisplayedDate !== label;
            lastDisplayedDate = label;
            const replyMsg = msg.reply_to ? messages.find((m) => m.id === msg.reply_to) : null;
            return (
              <React.Fragment key={msg.id}>
                {showDate && <div className="sc-datechip">{label}</div>}
                <MessageBubble
                  msg={msg}
                  isMe={msg.sender === me?.id}
                  replyMsg={replyMsg}
                  highlighted={highlightId === msg.id}
                  pinned={pinnedMsg?.id === msg.id}
                  {...bubbleCommon}
                />
              </React.Fragment>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* ---------------------------------------------------------- composer */}
        {meta?.blocked_by_me ? (
          <div className="sc-composer" style={{ textAlign: 'center', color: 'var(--sub)' }}>
            You blocked {contactName}. <button type="button" className="sc-btn ghost" style={{ height: 34, marginLeft: 8 }} onClick={blockToggle}>Unblock</button>
          </div>
        ) : meta?.blocked_me ? (
          <div className="sc-composer" style={{ textAlign: 'center', color: 'var(--sub)' }}>You can't send messages to this contact.</div>
        ) : isGroupChat && meta?.announce_only && !meta?.is_admin ? (
          <div className="sc-composer" style={{ textAlign: 'center', color: 'var(--sub)' }}>📢 Only admins can send messages in this group.</div>
        ) : (
          <form onSubmit={sendMessage} className="sc-composer">
            {mentionQuery !== null && isGroupChat && (
              <MentionList names={(meta?.participants || []).map((p) => p.username).filter((n) => n !== me?.username)} query={mentionQuery} onPick={pickMention} />
            )}
            <ModeChip mode={sendMode} onClear={() => setSendMode(null)} />
            {replyingTo && (
              <div className="sc-chip-row accent">
                <div style={{ flex: 1, minWidth: 0 }}><b>Replying to {replyingTo.sender_name}</b><div className="text-truncate" style={{ color: 'var(--sub)' }}>{replyPreview(replyingTo)}</div></div>
                <button type="button" className="sc-dots" aria-label="Cancel reply" onClick={() => setReplyingTo(null)}><BiX /></button>
              </div>
            )}
            {editing && (
              <div className="sc-chip-row accent"><b style={{ flex: 1 }}>Editing message</b>
                <button type="button" className="sc-dots" aria-label="Cancel edit" onClick={() => { setEditing(null); setNewMessage(''); }}><BiX /></button>
              </div>
            )}
            {selectedFiles.length > 0 && (
              <div className="sc-chip-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <b style={{ flex: 1 }}>{sendProg ? `Sending ${sendProg}…` : `${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''} ready to send`}</b>
                  {!sending && <button type="button" className="sc-dots" aria-label="Remove all attachments" onClick={() => setSelectedFiles([])}><BiX /></button>}
                </div>
                <div className="px-files">
                  {selectedFiles.map((f, i) => (
                    <span key={`${f.name}-${i}`} className="px-file">
                      <span className="n">{f.type.startsWith('image') ? '🖼️' : f.type.startsWith('video') ? '🎬' : f.type.startsWith('audio') ? '🎵' : '📄'} {f.name}</span>
                      {!sending && <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setSelectedFiles((p) => p.filter((_, j) => j !== i))}><BiX /></button>}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {isViewOnce && (
              <div className="sc-chip-row accent"><Seal size={22} seed={5} /><span style={{ flex: 1 }}>Sealed: disappears after they open it</span>
                <button type="button" className="sc-dots" aria-label="Turn off sealed mode" onClick={() => setIsViewOnce(false)}><BiX /></button>
              </div>
            )}

            <input ref={photoInputRef} type="file" multiple className="d-none" accept="*/*" onChange={(e) => addFiles(e)} />


            {showEmoji && !isRecording && (
              <div style={{ marginBottom: 8 }}>
                <div className="sc-choice" style={{ marginBottom: 8 }}>
                  <button type="button" aria-pressed={panelTab === 'emoji'} onClick={() => setPanelTab('emoji')}>Emoji</button>
                  <button type="button" aria-pressed={panelTab === 'sticker'} onClick={() => setPanelTab('sticker')}>Stickers{gifsOn ? ' and GIFs' : ''}</button>
                </div>
                {panelTab === 'emoji' ? <EmojiPicker T={T} onPick={insertEmoji} /> : <StickerPanel onSticker={sendSticker} onGif={sendGif} />}
              </div>
            )}

            {isRecording ? (
              <div className="sc-pill" style={{ alignItems: 'center', padding: '8px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, color: '#ff7d8c', fontWeight: 700 }}>
                  <span className="blink-anim" style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff4d6a' }} />{formatRec(recordingTime)}
                </div>
                <button type="button" className="sc-tool" onClick={cancelRecording} aria-label="Cancel recording"><BiTrash /></button>
                <button type="button" className="sc-tool on" onClick={sendRecording} aria-label="Send voice message"><BsCheckAll /></button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <div className="sc-pill" style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ position: 'relative' }}>
                    <button type="button" className={`sc-tool${showAttach ? ' on' : ''}`} onClick={() => { setShowEmoji(false); setShowAttach(!showAttach); }} aria-label="Attach"><BiPlus /></button>
                    {showAttach && (
                      <>
                        <div onClick={() => setShowAttach(false)} style={{ position: 'fixed', inset: 0, zIndex: 900 }} />
                        <div className="sc-menu" style={{ bottom: '120%', top: 'auto', left: 0, right: 'auto', minWidth: 210 }}>
                          {[
                            ['Photo, video or file', () => photoInputRef.current && photoInputRef.current.click()],
                            ['Location', shareLocation],
                            ['Live location (1 hour)', startLive],
                            ...(!isGroupChat ? [['Play a game', startGame]] : []),
                            ['Poll', () => { setShowAttach(false); setShowPoll(true); }],
                            ['Checklist', () => { setShowAttach(false); setShowChecklist(true); }],
                            ['Doodle', () => { setShowAttach(false); setShowDoodle(true); }],
                            ['Event (RSVP)', () => { setShowAttach(false); setShowEvent(true); }],
                            ['Photo album (24h)', () => { setShowAttach(false); createAlbum(); }],
                            [isViewOnce ? 'View once (on, tap to turn off)' : 'View once', () => { setShowAttach(false); setIsViewOnce(!isViewOnce); }],
                            ['Schedule message', () => { setShowAttach(false); extras.openSchedule(newMessage, () => setNewMessage('')); }],
                            ['Time capsule', () => { setShowAttach(false); setShowCapsule(true); }],
                            [sendMode?.timelock ? 'Locked message (on, tap to turn off)' : 'Locked message', chooseLockMode],
                            ...(isGroupChat ? [['Whisper to some members', () => { setShowAttach(false); setShowWhisper(true); }]] : []),
                            ['Split expense', () => { setShowAttach(false); setShowExpense(true); }],
                            ['Remind us', () => { setShowAttach(false); setRemindFor({}); }],
                          ].map(([l, fn]) => <button type="button" key={l} onClick={fn}>{l}</button>)}
                        </div>
                      </>
                    )}
                  </div>
                  <button type="button" className={`sc-tool${showEmoji ? ' on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={toggleEmoji} aria-label="Emoji and stickers"><BiSmile /></button>
                  <textarea
                    ref={inputRef}
                    rows={1}
                    placeholder={editing ? 'Edit message' : 'Message'}
                    aria-label="Message"
                    value={newMessage}
                    onChange={(e) => { caretRef.current = e.target.selectionStart; handleTyping(e); }}
                    onSelect={(e) => { caretRef.current = e.target.selectionStart; }}
                    onFocus={closePanels}
                    onKeyDown={onComposerKey}
                  />
                </div>
                {hasText ? (
                  <SealButton label={editing ? 'Save edit' : 'Send'} disabled={sending} stampKey={stamp} onClick={sendMessage}>
                    {editing ? <BiCheck /> : <BiSend />}
                  </SealButton>
                ) : (
                  <button type="button" className="sc-iconbtn" style={{ width: 46, height: 46, background: 'var(--mine)', color: 'var(--mine-text)' }} onClick={startRecording} aria-label="Record voice message"><BiMicrophone /></button>
                )}
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

export default ChatView;
