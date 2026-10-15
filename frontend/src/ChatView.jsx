import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { BsCheckAll } from 'react-icons/bs';
import { BiTrash, BiTimer, BiMicrophone, BiX, BiPhoneCall, BiVideo, BiDotsVerticalRounded, BiPaperclip, BiSearch, BiLock } from 'react-icons/bi';
import api from './api';
import Avatar from './Avatar';
import MessageBubble from './MessageBubble';
import ForwardModal from './ForwardModal';
import { useModal } from './PromptModal';
import { useRealtime, sendSocket, isSocketOpen } from './socket';
import { getMe, getPicUrl, errMsg, humanDuration, startCall, formatListTime } from './config';
import { CHAT_THEMES, THEME_CSS, resolveTheme, getAppTheme } from './theme';
import { setActiveChat } from './notify';
import { useChatExtras } from './chatExtras';


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

  const [newMessage, setNewMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [isViewOnce, setIsViewOnce] = useState(false);
  const [viewOnceData, setViewOnceData] = useState(null);
  const [sending, setSending] = useState(false);

  const [showTopMenu, setShowTopMenu] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [forwardMsg, setForwardMsg] = useState(null);
  const [pinnedMsg, setPinnedMsg] = useState(null);
  const [highlightId, setHighlightId] = useState(null);

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
  const docInputRef = useRef(null);
  const inputRef = useRef(null);
  const markedAt = useRef(0);
  const initToken = useRef(0);
  const tickRef = useRef(0);
  const ids = useRef({});
  ids.current = { friendId, groupId, chatId: meta?.chat_id, me, locked: !!meta?.is_locked, unlocked };

  const appKey = getAppTheme();
  const T = meta && meta.theme && meta.theme !== 'default' ? resolveTheme(meta.theme) : resolveTheme(appKey);
  const [modal, ask] = useModal(T);
  const isGroupChat = !!groupId;
  const locked = !!meta?.is_locked && !unlocked;
  const extras = useChatExtras({ chatId: meta?.chat_id, ask, messagesLen: messages.length, T });

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

    (async () => {
      try {
        const meData = await getMe();
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
    if (Date.now() - lastTypingSent.current > 1500) { lastTypingSent.current = Date.now(); sendTyping(true); }
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => { lastTypingSent.current = 0; sendTyping(false); }, 1800);
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
    if (!content.trim() && !selectedFile) return;

    const formData = new FormData();
    if (groupId) formData.append('chat', groupId);
    else formData.append('receiver', friendId);

    if (isViewOnce) content = `[VIEW_ONCE]${content}`;
    if (content.trim()) formData.append('content', content);
    if (selectedFile) formData.append('file_url', selectedFile);
    if (msgType !== 'text') formData.append('message_type', msgType);
    if (replyingTo) formData.append('reply_to', replyingTo.id);

    setSending(true);
    try {
      const response = await api.post('messages/', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (response?.data) setMessages((prev) => (prev.some((m) => m.id === response.data.id) ? prev : [...prev, response.data]));
      setNewMessage('');
      setSelectedFile(null);
      setReplyingTo(null);
      setIsViewOnce(false);
      clearTimeout(typingTimerRef.current);
      sendTyping(false);
      isUserScrolling.current = false;
      setTimeout(() => scrollToBottom(true), 100);
    } catch (error) { await handleSendError(error, 'Failed to send message!'); }
    setSending(false);
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
    formData.append('voice_note', blob, `voicenote.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`);
    formData.append('message_type', 'audio');
    if (replyingTo) formData.append('reply_to', replyingTo.id);
    setReplyingTo(null);
    try {
      const response = await api.post('messages/', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (response?.data) setMessages((prev) => (prev.some((m) => m.id === response.data.id) ? prev : [...prev, response.data]));
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

  const onSeenBy = (msg) => {
    const seen = (msg.read_by_names || []).map((u) => u.username);
    const seenIds = (msg.read_by || []);
    const others = (meta?.participants || []).filter((p) => p.id !== msg.sender && !seenIds.includes(p.id)).map((p) => p.username);
    ask({
      type: 'alert',
      title: '👁 Seen by',
      message: `${seen.length ? seen.join(', ') : 'Nobody yet'}${others.length ? `  |  Not yet: ${others.join(', ')}` : ''}`,
    });
  };

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

  const themeMenu = async () => {
    if (!meta) return;
    const choices = [{ label: '🎨 Follow app theme', value: 'default' }, ...Object.entries(CHAT_THEMES).filter(([k]) => k !== 'default').map(([k, v]) => ({ label: v.label, value: k }))];
    const v = await ask({ type: 'choice', title: 'Chat theme', current: meta.theme, choices });
    if (!v) return;
    try { await api.post('chats/theme/', { chat_id: meta.chat_id, theme: v }); await fetchMeta(); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Failed') }); }
  };

  const toggleSetting = async (key) => {
    try { await api.post('chats/settings/', { chat_id: meta.chat_id, [key]: !meta[key] }); await fetchMeta(); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Failed') }); }
  };

  const clearChat = async () => {
    const ok = await ask({ type: 'confirm', title: 'Clear this chat for you?', danger: true, okText: 'Clear' });
    if (!ok) return;
    try { await api.post(`chats/${meta.chat_id}/clear_chat/`); setMessages([]); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Failed') }); }
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

  const showMembers = () => {
    ask({ type: 'alert', title: `👥 ${contactName} (${(meta?.participants || []).length})`, message: (meta?.participants || []).map((p) => p.username).join(', ') });
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

  const menuItems = !meta ? [] : [
    ['🔍 Search messages', () => { setSearchOpen(true); }],
    ...(isGroupChat ? [['👥 Group members', showMembers]] : []),
    [`⏳ Disappearing: ${humanDuration(meta.disappearing_time)}`, disappearingMenu],
    [meta.is_locked ? '🔐 Chat lock (change / remove)' : '🔐 Chat lock', lockMenu],
    ['🎨 Chat theme', themeMenu],
    ['🖼 Wallpaper (colours)', extras.chooseWallpaper],
    ['📷 Wallpaper from photo', extras.pickWallpaperPhoto],
    [`⏰ Scheduled messages (${extras.scheduledCount})`, extras.openScheduledList],
    [meta.is_pinned ? '📌 Unpin chat' : '📌 Pin chat', () => toggleSetting('is_pinned')],
    [meta.is_muted ? '🔔 Unmute' : '🔇 Mute', () => toggleSetting('is_muted')],
    ['🧹 Clear chat (for me)', clearChat, true],
    ...(!isGroupChat ? [
      [meta.blocked_by_me ? '✅ Unblock' : '🚫 Block', blockToggle, !meta.blocked_by_me],
      ['➖ Unfriend', unfriend, true],
    ] : [
      ['🚪 Exit group', exitGroup, true],
      ...(meta.created_by === me?.id ? [['🗑️ Delete group', deleteGroup, true]] : []),
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
    ? (typingNames.length ? `✍️ ${typingNames.join(', ')} ${typingNames.length > 1 ? 'are' : 'is'} typing...` : `${(meta?.participants || []).length} members`)
    : (meta?.blocked_me ? '' : (friendTyping ? '✍️ Typing...' : (receiver?.is_online ? '● Online' : (receiver?.last_seen ? `last seen ${formatListTime(receiver.last_seen)}` : 'Offline'))));
  const online = !isGroupChat && !friendTyping && !!receiver?.is_online && !meta?.blocked_me;

  let lastDisplayedDate = null;

  // ------------------------------------------------------------- render
  const wrapStyle = { backgroundColor: T.bg };
  // NOTE: height is set by the .chat-card CSS class (88dvh) so it works on phones too.
  const cardStyle = { maxWidth: '450px', overflow: 'hidden', border: `1px solid ${T.accent}33`, ...(T.light ? { background: T.panel } : {}) };

  if (booting || notFound) {
    return (
      <div className={`d-flex justify-content-center align-items-center vh-100 px-3 ${T.light ? 't-light' : ''}`} style={wrapStyle}>
        <style>{THEME_CSS}</style>
        <div className="text-center text-white">
          {booting ? <p>Loading chat…</p> : (<><p>Chat kedaikkala 😕</p><button className="btn btn-sm btn-outline-light rounded-pill" onClick={() => navigate('/home')}>← Back</button></>)}
        </div>
      </div>
    );
  }

  if (locked) {
    return (
      <div className={`d-flex justify-content-center align-items-center vh-100 px-3 ${T.light ? 't-light' : ''}`} style={wrapStyle}>
        <style>{THEME_CSS}</style>
        <div className="glass-card p-4 text-center w-100" style={{ maxWidth: 340, ...(T.light ? { background: T.panel } : {}), border: `1px solid ${T.accent}55` }}>
          <BiLock style={{ fontSize: 44, color: T.accent }} />
          <h6 className="text-white fw-bold mt-2">{contactName} chat locked</h6>
          <form onSubmit={submitPin}>
            <input
              autoFocus type="password" inputMode="numeric" maxLength={4} value={pinEntry} placeholder="••••"
              onChange={(e) => setPinEntry(e.target.value.replace(/\D/g, ''))}
              className="form-control text-white text-center my-3 fs-4"
              style={{ background: 'rgba(255,255,255,0.08)', border: `1px solid ${T.accent}`, letterSpacing: 10 }}
            />
            {pinError && <div className="text-danger small mb-2">{pinError}</div>}
            <div className="d-flex gap-2 justify-content-center">
              <button type="button" className="btn btn-outline-light rounded-pill px-3" onClick={() => navigate('/home')}>← Back</button>
              <button type="submit" disabled={pinEntry.length !== 4} className="btn fw-bold rounded-pill px-4" style={{ background: T.accent, color: '#1f2937' }}>Unlock</button>
            </div>
          </form>
        </div>
        {modal}
      </div>
    );
  }

  const bubbleCommon = {
    isGroup: isGroupChat,
    T,
    onReply: (m) => { setEditing(null); setReplyingTo(m); setTimeout(() => inputRef.current && inputRef.current.focus(), 50); },
    onDelete,
    onReact,
    onPin,
    onForward: (m) => setForwardMsg(m),
    onEdit,
    onCopy,
    onSeenBy,
    onOpenViewOnce: (m) => setViewOnceData(m),
  };

  return (
    <div className={`d-flex justify-content-center align-items-center chat-shell px-3 position-relative ${T.light ? 't-light' : ''}`} style={wrapStyle}>
      <style>
        {`
        .hide-scroll::-webkit-scrollbar { display: none; }
        .hide-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        .chat-shell { height: 100vh; height: 100dvh; }
        .chat-card { height: 88vh; height: 88dvh; }
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
        <ForwardModal
          msg={forwardMsg}
          T={T}
          onClose={(sent) => { setForwardMsg(null); if (sent) ask({ type: 'alert', title: 'Forwarded ✅' }); }}
        />
      )}

      {viewOnceData && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex flex-column justify-content-center align-items-center"
             style={{ background: 'rgba(20, 5, 10, 0.95)', backdropFilter: 'blur(10px)', zIndex: 9000 }}>
          <div className="p-4 rounded-4 text-center position-relative pop-anim"
               style={{ border: '2px solid #fcd34d', boxShadow: '0 0 40px rgba(252, 211, 77, 0.6)', background: 'linear-gradient(135deg, rgba(59,14,27,0.9), rgba(0,0,0,0.95))', maxWidth: '90%', width: '450px' }}>
            <BiX className="position-absolute top-0 end-0 m-3 text-white fs-2 rounded-circle" style={{ cursor: 'pointer', background: 'rgba(255,255,255,0.1)' }} onClick={closeViewOnce} />
            <h4 className="text-warning fw-bold mb-4 mt-2" style={{ textShadow: '0 0 15px #fcd34d' }}>✨ Secret View ✨</h4>
            <div className="d-flex flex-column justify-content-center align-items-center w-100">
              {viewOnceData.file_url && viewOnceData.message_type === 'video' && (
                <video src={getPicUrl(viewOnceData.file_url)} controls autoPlay className="img-fluid rounded border border-warning" style={{ maxHeight: '50vh' }} />
              )}
              {viewOnceData.file_url && viewOnceData.message_type === 'image' && (
                <img src={getPicUrl(viewOnceData.file_url)} className="img-fluid rounded border border-warning" style={{ maxHeight: '50vh' }} alt="View Once" />
              )}
              {viewOnceData.file_url && viewOnceData.message_type === 'document' && (
                <a href={getPicUrl(viewOnceData.file_url)} target="_blank" rel="noreferrer" className="btn btn-warning">📄 {viewOnceData.file_name || 'Open document'}</a>
              )}
              {viewOnceData.content && viewOnceData.content.replace('[VIEW_ONCE]', '') && (
                <div className="text-white fs-3 fw-bold mt-4 text-center text-break w-100" style={{ whiteSpace: 'pre-wrap' }}>
                  {viewOnceData.content.replace('[VIEW_ONCE]', '')}
                </div>
              )}
            </div>
            <div className="mt-4 pt-3 border-top border-warning opacity-75 text-light" style={{ fontSize: '11px' }}>
              <BiTimer className="fs-5 me-1" /> This message will self-destruct upon closing.
            </div>
          </div>
        </div>
      )}

      <div className="glass-card chat-card p-3 d-flex flex-column w-100 position-relative" style={cardStyle}>

        {/* ---------------------------------------------------------- header */}
        <div className="d-flex justify-content-between align-items-center pb-2 border-bottom flex-shrink-0" style={{ borderColor: `${T.accent}33` }}>
          <div className="d-flex align-items-center" style={{ minWidth: 0 }}>
            <button className="btn btn-sm btn-outline-light me-2 rounded-pill px-2 py-0" onClick={() => navigate('/home')} style={{ borderColor: 'rgba(255,255,255,0.2)' }}>←</button>
            {isGroupChat ? (
              <div className="rounded-circle d-flex justify-content-center align-items-center me-2 shadow" style={{ width: '38px', height: '38px', background: T.accent, flexShrink: 0 }}>👥</div>
            ) : (
              <div className="me-2"><Avatar src={receiver?.profile_picture} name={contactName} size={38} online={online} T={T} /></div>
            )}
            <div className="ms-1" style={{ minWidth: 0 }}>
              <h6 className="mb-0 fw-bold text-white lh-1 d-flex align-items-center">
                <span className="text-truncate" style={{ maxWidth: 130 }}>{contactName}</span>
                {dTime > 0 && (
                  <span className="badge ms-2 rounded-pill shadow-sm d-flex align-items-center gap-1" style={{ fontSize: '9px', background: T.accent, color: '#1f2937' }}>
                    <BiTimer /> {humanDuration(dTime)}
                  </span>
                )}
                {meta?.is_pinned && <span className="ms-1" style={{ fontSize: 10 }}>📌</span>}
                {meta?.is_muted && <span className="ms-1" style={{ fontSize: 10 }}>🔇</span>}
                {meta?.is_locked && <BiLock className="ms-1" style={{ color: T.accent }} />}
              </h6>
              <small className={online ? 'text-success fw-bold' : 'text-light opacity-50'} style={{ fontSize: '10px' }}>{subtitle}</small>
            </div>
          </div>

          <div className="d-flex gap-1 align-items-center flex-shrink-0">
            <button className="btn btn-sm rounded-circle p-1" style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${T.accent}66` }}
                    title="Voice call"
                    onClick={() => startCall(isGroupChat ? { group: true, chatId: groupId, name: contactName, callType: 'audio' } : { friendId, name: contactName, callType: 'audio' })}>
              <BiPhoneCall className="fs-5" style={{ color: T.accent }} />
            </button>
            <button className="btn btn-sm rounded-circle p-1" style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${T.accent}66` }}
                    title="Video call"
                    onClick={() => startCall(isGroupChat ? { group: true, chatId: groupId, name: contactName, callType: 'video' } : { friendId, name: contactName, callType: 'video' })}>
              <BiVideo className="fs-5" style={{ color: T.accent }} />
            </button>
            <div className="position-relative">
              <button className="btn btn-sm text-light rounded-circle p-1" style={{ background: 'rgba(255,255,255,0.05)' }} onClick={() => setShowTopMenu(!showTopMenu)}>
                <BiDotsVerticalRounded className="fs-4" style={{ color: T.accent }} />
              </button>
              {showTopMenu && (
                <>
                  <div onClick={() => setShowTopMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 900 }} />
                  <div className="shadow-lg p-1 rounded-3" style={{ position: 'absolute', right: 0, top: '115%', zIndex: 901, background: T.light ? '#fff' : '#26121a', border: `1px solid ${T.accent}`, minWidth: 230, maxHeight: '60vh', overflowY: 'auto' }}>
                    {menuItems.map(([label, fn, danger]) => (
                      <button key={label} className="btn btn-sm w-100 text-start" style={{ fontSize: 12, color: danger ? '#f87171' : (T.light ? '#1f2937' : '#fff') }}
                              onClick={() => { setShowTopMenu(false); fn(); }}>{label}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ---------------------------------------------------------- search */}
        {searchOpen && (
          <div className="flex-shrink-0 pt-2">
            <div className="d-flex gap-2 align-items-center">
              <BiSearch className="text-light" />
              <input autoFocus className="form-control form-control-sm text-white" placeholder="Search in this chat…" value={searchQ} onChange={(e) => doSearch(e.target.value)}
                     style={{ background: 'rgba(255,255,255,0.08)', border: `1px solid ${T.accent}55`, fontSize: 12 }} />
              <BiX className="text-white fs-4" style={{ cursor: 'pointer' }} onClick={() => { setSearchOpen(false); setSearchQ(''); setSearchResults([]); }} />
            </div>
            {searchQ.trim() && (
              <div className="mt-2 rounded hide-scroll" style={{ maxHeight: 160, overflowY: 'auto', background: 'rgba(0,0,0,0.25)' }}>
                {searchResults.length === 0 && <div className="p-2 text-white-50 small">No messages found.</div>}
                {searchResults.map((m) => (
                  <div key={m.id} className="p-2 border-bottom border-secondary text-white" style={{ cursor: 'pointer', fontSize: 12 }}
                       onClick={() => { setSearchOpen(false); setSearchQ(''); setSearchResults([]); setTimeout(() => jumpTo(m.id), 100); }}>
                    <b style={{ color: T.accent }}>{m.sender_name}</b> <span className="opacity-50">• {formatListTime(m.created_at)}</span>
                    <div className="text-truncate">{m.content}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---------------------------------------------------------- messages */}
        <div
          className="flex-grow-1 p-2 overflow-auto d-flex flex-column gap-1 hide-scroll"
          style={{ minHeight: 0, borderRadius: 12, ...extras.wallpaperStyle }}
          ref={chatContainerRef}
          onScroll={handleScroll}
          onLoadCapture={() => { if (!isUserScrolling.current) scrollToBottom(false); }}
        >

          {pinnedMsg && (
            <div className="d-flex justify-content-between align-items-center bg-dark p-2 mb-2 rounded border-start border-3 shadow-sm" style={{ borderColor: T.accent, fontSize: '11px', position: 'sticky', top: 0, zIndex: 100 }}>
              <div className="text-white text-truncate" style={{ maxWidth: '85%', cursor: 'pointer' }} onClick={() => jumpTo(pinnedMsg.id)}>
                <strong>📌 Pinned: </strong>
                <span className="opacity-75">{pinnedMsg.content ? pinnedMsg.content.replace('[VIEW_ONCE]', '') : (pinnedMsg.file_name || 'Media Message')}</span>
              </div>
              <BiX className="text-white fs-5" style={{ cursor: 'pointer' }} onClick={() => onPin(pinnedMsg)} />
            </div>
          )}

          <div className="text-center text-light opacity-75 mb-2 p-1 rounded" style={{ fontSize: '10px', background: 'rgba(255,255,255,0.03)' }}>
            🔒 Secret chat. Swipe right to reply. Long press (or ⌄) for options.
          </div>

          {visible.map((msg) => {
            const label = formatDateLabel(msg.created_at);
            const showDate = lastDisplayedDate !== label;
            lastDisplayedDate = label;
            const replyMsg = msg.reply_to ? messages.find((m) => m.id === msg.reply_to) : null;
            return (
              <React.Fragment key={msg.id}>
                {showDate && (
                  <div className="d-flex justify-content-center my-1 w-100">
                    <div className="px-2 rounded-pill shadow-sm" style={{ background: 'rgba(255,255,255,0.1)', fontSize: '10px', color: T.light ? '#374151' : '#ddd' }}>{label}</div>
                  </div>
                )}
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
          <div className="pt-2 flex-shrink-0 text-center text-white-50 small">
            🚫 You blocked {contactName}. <button className="btn btn-sm btn-outline-light rounded-pill ms-2" onClick={blockToggle}>Unblock</button>
          </div>
        ) : meta?.blocked_me ? (
          <div className="pt-2 flex-shrink-0 text-center text-white-50 small">You can't send messages to this contact.</div>
        ) : (
          <form onSubmit={sendMessage} className="pt-2 flex-shrink-0 position-relative">
            {replyingTo && (
              <div className="w-100 bg-dark p-2 mb-1 rounded d-flex justify-content-between align-items-center border-start border-3" style={{ borderColor: T.accent }}>
                <div className="text-white" style={{ fontSize: '11px', minWidth: 0 }}>
                  <strong>Replying to {replyingTo.sender_name}</strong><br />
                  <span className="opacity-75 text-truncate d-block" style={{ maxWidth: 260 }}>{replyingTo.content ? replyingTo.content.replace('[VIEW_ONCE]', '') : (replyingTo.file_name || 'Media')}</span>
                </div>
                <BiX className="text-white fs-5" style={{ cursor: 'pointer' }} onClick={() => setReplyingTo(null)} />
              </div>
            )}
            {editing && (
              <div className="w-100 bg-dark p-2 mb-1 rounded d-flex justify-content-between align-items-center border-start border-3" style={{ borderColor: '#38bdf8' }}>
                <div className="text-white" style={{ fontSize: '11px' }}><strong>✏️ Editing message</strong></div>
                <BiX className="text-white fs-5" style={{ cursor: 'pointer' }} onClick={() => { setEditing(null); setNewMessage(''); }} />
              </div>
            )}
            {selectedFile && (
              <div className="text-success mb-1 d-flex align-items-center gap-2" style={{ fontSize: '11px' }}>
                📎 {selectedFile.name} ready
                <BiX className="text-white fs-5" style={{ cursor: 'pointer' }} onClick={() => setSelectedFile(null)} />
              </div>
            )}

            <input ref={photoInputRef} type="file" className="d-none" accept="image/*,video/*" onChange={(e) => { setSelectedFile(e.target.files[0] || null); e.target.value = ''; setShowAttach(false); }} />
            <input ref={docInputRef} type="file" className="d-none" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.json" onChange={(e) => { setSelectedFile(e.target.files[0] || null); e.target.value = ''; setShowAttach(false); }} />

            <div className="d-flex gap-2 align-items-center">
              {isRecording ? (
                <div className="d-flex align-items-center w-100 bg-dark rounded-pill px-3 py-1" style={{ border: `1px solid ${T.accent}88` }}>
                  <div className="text-danger fw-bold me-auto d-flex align-items-center gap-2">
                    <div className="rounded-circle bg-danger blink-anim" style={{ width: '10px', height: '10px' }}></div>
                    {formatRec(recordingTime)}
                  </div>
                  <button type="button" className="btn btn-sm text-light px-2" onClick={cancelRecording} title="Cancel Recording"><BiTrash className="fs-5" /></button>
                  <button type="button" className="btn btn-sm text-success px-2" onClick={sendRecording} title="Send Audio"><BsCheckAll className="fs-4" /></button>
                </div>
              ) : (
                <>
                  <div className="position-relative">
                    <button type="button" className="btn btn-outline-light rounded-circle p-1" onClick={() => setShowAttach(!showAttach)} title="Attach"><BiPaperclip className="fs-5" /></button>
                    {showAttach && (
                      <>
                        <div onClick={() => setShowAttach(false)} style={{ position: 'fixed', inset: 0, zIndex: 900 }} />
                        <div className="shadow-lg p-1 rounded-3" style={{ position: 'absolute', bottom: '120%', left: 0, zIndex: 901, background: T.light ? '#fff' : '#26121a', border: `1px solid ${T.accent}`, minWidth: 160 }}>
                          {[
                            ['🖼 Photo / Video', () => photoInputRef.current && photoInputRef.current.click()],
                            ['📄 Document', () => docInputRef.current && docInputRef.current.click()],
                            ['📍 Location', shareLocation],
                            ['⏰ Schedule message', () => { setShowAttach(false); extras.openSchedule(newMessage, () => setNewMessage('')); }],
                          ].map(([l, fn]) => (
                            <button type="button" key={l} className="btn btn-sm w-100 text-start" style={{ fontSize: 12, color: T.light ? '#1f2937' : '#fff' }} onClick={fn}>{l}</button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  <button type="button" className={`btn rounded-circle p-1 ${isViewOnce ? 'btn-danger shadow' : 'btn-outline-secondary'}`} onClick={() => setIsViewOnce(!isViewOnce)} title="View Once Message">💣</button>

                  <textarea
                    ref={inputRef}
                    rows={1}
                    className="form-control px-2 py-1 text-white form-control-sm"
                    placeholder={editing ? 'Edit message...' : 'Type a message...'}
                    value={newMessage}
                    onChange={handleTyping}
                    onKeyDown={onComposerKey}
                    style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${T.accent}55`, fontSize: '12px', resize: 'none', overflowY: 'auto', maxHeight: 120, lineHeight: 1.4 }}
                  />

                  {!newMessage.trim() && !selectedFile ? (
                    <button type="button" className="btn btn-outline-warning rounded-circle p-1" onClick={startRecording} style={{ borderColor: T.accent }}>
                      <BiMicrophone className="fs-5" style={{ color: T.accent }} />
                    </button>
                  ) : (
                    <button type="submit" disabled={sending} className="btn px-3 fw-bold rounded-pill btn-sm" style={{ background: T.accent, color: '#1f2937', fontSize: '12px' }}>{editing ? 'Save' : 'Send'}</button>
                  )}
                </>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default ChatView;
