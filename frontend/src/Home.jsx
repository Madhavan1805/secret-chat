import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BiSearch, BiCheck, BiX, BiLock, BiDotsVerticalRounded, BiPhoneCall, BiPhoneIncoming, BiPhoneOutgoing, BiVideo, BiChat, BiGroup, BiAperture, BiUser, BiQrScan, BiArchive, BiChevronRight, BiVolumeMute, BiPlus } from 'react-icons/bi';
import api from './api';
import Avatar from './Avatar';
import StatusTab from './StatusTab';
import { useModal } from './PromptModal';
import { useRealtime, disconnectSocket, isSocketOpen } from './socket';
import { getMe, clearMe, errMsg, formatListTime, formatDuration, startCall } from './config';
import { THEME_CSS, resolveTheme, getAppTheme, setAppTheme, themeVars } from './theme';
import { Seal, Sheet } from './ui';
import { QrSheet } from './Sheets';
import ProfileHub from './ProfileHub';
import { requestNotifyPermission, notifyPermission, setActiveChat } from './notify';
import { pushLogin, pushLogout } from './push';

// one row of the chats / groups list
function ChatRow({ avatar, title, subtitle, subtitleHot, time, unread, pinned, muted, locked, onOpen, menu, menuOpen, setMenuOpen }) {
  return (
    <div className={`sc-row${pinned ? ' pinned' : ''}`} role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}>
      {avatar}
      <div className="sc-row-main">
        <h3 className="sc-row-name">
          <span className="t">{title}</span>
          {muted && <BiVolumeMute style={{ color: 'var(--sub)', flexShrink: 0 }} aria-label="Muted" />}
          {locked && <BiLock style={{ color: 'var(--accent)', flexShrink: 0 }} aria-label="Locked" />}
        </h3>
        <span className="sc-row-sub" style={subtitleHot ? { color: 'var(--online)' } : undefined}>{subtitle}</span>
      </div>
      <div className="sc-row-end">
        <span className={`sc-row-time${unread > 0 && !muted ? ' hot' : ''}`}>{time}</span>
        {unread > 0 && <span className={`sc-badge${muted ? ' muted' : ''}`}>{unread > 99 ? '99+' : unread}</span>}
      </div>
      <button type="button" className="sc-dots" aria-label="Chat options" onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen ? null : true); }}>
        <BiDotsVerticalRounded />
      </button>
      {menuOpen && (
        <>
          <div onClick={(e) => { e.stopPropagation(); setMenuOpen(null); }} style={{ position: 'fixed', inset: 0, zIndex: 900 }} />
          <div className="sc-menu" onClick={(e) => e.stopPropagation()}>
            {menu.map(([label, fn, danger, keepOpen]) => (
              <button key={label} type="button" className={danger ? 'danger' : ''} onClick={() => { if (!keepOpen) setMenuOpen(null); fn(); }}>{label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// the floating bottom navigation
function NavBar({ tab, setTab, badges }) {
  const items = [['chats', 'Chats', BiChat], ['groups', 'Groups', BiGroup], ['status', 'Status', BiAperture], ['calls', 'Calls', BiPhoneCall], ['profile', 'You', BiUser]];
  return (
    <nav className="sc-nav" aria-label="Main">
      <div className="sc-nav-bar">
        {items.map(([key, label, Icon]) => (
          <button key={key} type="button" className="sc-nav-item" aria-current={tab === key ? 'page' : undefined} aria-label={label} onClick={() => setTab(key)}>
            <Icon /><span className="lbl">{label}</span>
            {badges[key] && <span className="sc-dot" />}
          </button>
        ))}
      </div>
    </nav>
  );
}

function Home() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  const [activeTab, setActiveTab] = useState('chats');
  const [showArchived, setShowArchived] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [muteFor, setMuteFor] = useState(null);
  const [rowMenu, setRowMenu] = useState(null);

  const [me, setMe] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [friends, setFriends] = useState([]);
  const [groups, setGroups] = useState([]);
  const [calls, setCalls] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [statuses, setStatuses] = useState([]);

  const [groupName, setGroupName] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState([]);

  const [appTheme, setAppThemeState] = useState(getAppTheme());
  const [notifPerm, setNotifPerm] = useState(notifyPermission());

  const loadingRef = useRef(false);
  const debounceRef = useRef(null);
  const tickRef = useRef(0);

  const T = resolveTheme(appTheme);
  const rowBg = T.light ? '#ffffff' : 'rgba(255,255,255,0.06)';
  const [modal, ask] = useModal(T);

  const currentUsername = me?.username || localStorage.getItem('username') || 'User';

  // ------------------------------------------------------------------ data
  const fetchStatuses = async () => {
    try {
      const res = await api.get('statuses/');
      if (Array.isArray(res?.data)) setStatuses(res.data);
    } catch (e) { /* ignore */ }
  };

  const fetchCalls = async () => {
    try {
      const res = await api.get('calls/');
      if (Array.isArray(res?.data)) setCalls(res.data);
    } catch (e) { /* ignore */ }
  };

  const fetchBlocked = async () => {
    try {
      const res = await api.get('users/blocked/');
      if (Array.isArray(res?.data)) setBlockedUsers(res.data);
    } catch (e) { /* ignore */ }
  };

  const refresh = async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const [usersRes, reqRes, ovRes, meData] = await Promise.all([
        api.get('users/'), api.get('requests/'), api.get('chats/overview/'), getMe(),
      ]);
      const allUsers = Array.isArray(usersRes.data) ? usersRes.data : [];
      const requests = Array.isArray(reqRes.data) ? reqRes.data : [];
      const overview = ovRes.data || { direct: [], groups: [] };
      const mine = allUsers.find((u) => u.id === meData.id) || meData;
      setMe(mine);
      pushLogin(meData.id);
      localStorage.setItem('username', mine.username);

      setPendingRequests(
        requests
          .filter((r) => r.status === 'pending' && r.receiver === mine.id)
          .map((r) => ({ ...r, sender_profile_picture: allUsers.find((u) => u.id === r.sender)?.profile_picture })),
      );
      setSentRequests(requests.filter((r) => r.status === 'pending' && r.sender === mine.id));

      const friendIds = [...new Set(
        requests.filter((r) => r.status === 'accepted').map((r) => (r.sender === mine.id ? r.receiver : r.sender)),
      )];
      const byFriend = {};
      (overview.direct || []).forEach((row) => { byFriend[row.friend_id] = row; });

      const list = friendIds
        .map((id) => allUsers.find((u) => u.id === id))
        .filter(Boolean)
        .map((u) => {
          const ov = byFriend[u.id] || null;
          return { ...u, ov, unread_count: ov ? ov.unread_count : (u.unread_count || 0) };
        });
      const stamp = (x) => (x.ov?.last_message ? new Date(x.ov.last_message.created_at).getTime() : 0);
      list.sort((a, b) => (Number(!!b.ov?.is_pinned) - Number(!!a.ov?.is_pinned)) || (stamp(b) - stamp(a)) || a.username.localeCompare(b.username));
      setFriends(list);

      const g = [...(overview.groups || [])];
      const gstamp = (x) => (x.last_message ? new Date(x.last_message.created_at).getTime() : 0);
      g.sort((a, b) => (Number(b.is_pinned) - Number(a.is_pinned)) || (gstamp(b) - gstamp(a)));
      setGroups(g);
    } catch (error) {
      console.error('Failed to load home data:', error);
    } finally {
      loadingRef.current = false;
    }
  };

  const scheduleRefresh = () => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(refresh, 250);
  };

  useEffect(() => {
    setActiveChat(null);
    refresh();
    fetchStatuses();
    fetchCalls();
    const interval = setInterval(() => {
      tickRef.current += 1;
      // WebSocket connected -> only a slow safety refresh; otherwise poll every 3 s
      if (!isSocketOpen() || tickRef.current % 10 === 0) { refresh(); fetchStatuses(); }
    }, 3000);
    return () => { clearInterval(interval); clearTimeout(debounceRef.current); };
  }, []);

  useRealtime((evt) => {
    switch (evt.event) {
      case '_open':
        refresh(); fetchStatuses(); fetchCalls();
        break;
      case 'message': case 'read': case 'group_read': case 'chat_updated':
      case 'friends_changed': case 'request': case 'presence': case 'blocklist':
        scheduleRefresh();
        if (evt.event === 'blocklist') fetchBlocked();
        break;
      case 'status': case 'status_view':
        fetchStatuses();
        break;
      case 'call_incoming': case 'call_accepted': case 'call_declined':
      case 'call_cancelled': case 'call_ended':
        fetchCalls();
        break;
      default:
        break;
    }
  });

  useEffect(() => {
    if (activeTab === 'calls') fetchCalls();
    if (activeTab === 'profile') fetchBlocked();
  }, [activeTab]);

  // ---------------------------------------------------------------- actions
  const handleSearch = async (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (query.length > 0) {
      try {
        const response = await api.get(`users/?search=${encodeURIComponent(query)}`);
        const results = Array.isArray(response.data) ? response.data : [];
        const friendIds = new Set(friends.map((f) => f.id));
        setSearchResults(results.filter((u) => u.id !== me?.id && !friendIds.has(u.id)));
      } catch (error) { /* ignore */ }
    } else {
      setSearchResults([]);
    }
  };

  const sendRequest = async (receiverId) => {
    try {
      await api.post('requests/', { receiver: receiverId });
      setSearchQuery('');
      setSearchResults([]);
      refresh();
      ask({ type: 'alert', title: 'Secret Request Sent! 🚀' });
    } catch (error) {
      ask({ type: 'alert', title: errMsg(error, 'Request failed!') });
    }
  };

  // used by the QR scanner and the "Add" box: look the person up, then send a request
  const addByUsername = async (username) => {
    if (!username || username === me?.username) { ask({ type: 'alert', title: 'That is your own code' }); return; }
    try {
      const res = await api.get(`users/?search=${encodeURIComponent(username)}`);
      const list = Array.isArray(res.data) ? res.data : [];
      const user = list.find((u) => u.username.toLowerCase() === username.toLowerCase());
      if (!user) { ask({ type: 'alert', title: `No Secret ID named "${username}"` }); return; }
      if (friends.some((f) => f.id === user.id)) { ask({ type: 'alert', title: `${user.username} is already your friend` }); return; }
      await api.post('requests/', { receiver: user.id });
      refresh();
      ask({ type: 'alert', title: `Request sent to ${user.username}` });
    } catch (error) { ask({ type: 'alert', title: errMsg(error, 'Request failed') }); }
  };

  const handleRequestAction = async (reqId, action) => {
    try {
      await api.patch(`requests/${reqId}/`, { status: action });
      refresh();
    } catch (error) { ask({ type: 'alert', title: errMsg(error, 'Failed') }); }
  };

  const openFriend = (friend) => navigate(`/chat/${encodeURIComponent(friend.username)}`, { state: { friendId: friend.id } });
  const openGroup = (group) => navigate(`/chat/${encodeURIComponent(group.group_name)}`, { state: { chatId: group.chat_id } });

  const chatSetting = async (payload) => {
    try { await api.post('chats/settings/', payload); refresh(); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Failed') }); }
  };

  const doBlock = async (friend) => {
    const ok = await ask({ type: 'confirm', title: `Block ${friend.username}?`, message: 'They cannot message or call you, and cannot see your online status.', danger: true, okText: 'Block' });
    if (!ok) return;
    try { await api.post('users/block/', { user_id: friend.id }); refresh(); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Failed') }); }
  };

  const doUnblock = async (userId) => {
    try { await api.post('users/unblock/', { user_id: userId }); fetchBlocked(); refresh(); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Failed') }); }
  };

  const doUnfriend = async (friend) => {
    const ok = await ask({ type: 'confirm', title: `Unfriend ${friend.username}?`, message: 'Chat will be hidden. You can send a request again later.', danger: true, okText: 'Unfriend' });
    if (!ok) return;
    try { await api.post('users/unfriend/', { user_id: friend.id }); refresh(); } catch (e) { ask({ type: 'alert', title: errMsg(e, 'Failed') }); }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedGroupMembers.length === 0) {
      ask({ type: 'alert', title: 'Please enter a group name and select at least one friend!' });
      return false;
    }
    try {
      await api.post('chats/create_group/', { group_name: groupName, participants: selectedGroupMembers });
      ask({ type: 'alert', title: `Group '${groupName}' created successfully! 🎉` });
      setGroupName('');
      setSelectedGroupMembers([]);
      setActiveTab('groups');
      refresh();
      return true;
    } catch (error) { ask({ type: 'alert', title: errMsg(error, 'Failed to create group.') }); return false; }
  };

  const toggleGroupMember = (friendId) => {
    setSelectedGroupMembers((prev) => (prev.includes(friendId) ? prev.filter((id) => id !== friendId) : [...prev, friendId]));
  };

  const changeAppTheme = (key) => { setAppTheme(key); setAppThemeState(key); };

  const enableNotifications = async () => {
    const p = await requestNotifyPermission();
    setNotifPerm(p);
    if (p === 'denied') ask({ type: 'alert', title: 'Browser settings-la notification allow pannunga' });
  };

  const doLogout = async () => {
    try { await api.post('auth/logout/'); } catch (e) { /* offline: still log out here */ }
    const keep = {};
    Object.keys(localStorage).forEach((k) => { if (/^(pinned_msg_|app_theme|custom_reactions|recent_emojis|sounds_off|lock_)/.test(k)) keep[k] = localStorage.getItem(k); });
    pushLogout();
    disconnectSocket();
    clearMe();
    localStorage.clear();
    Object.entries(keep).forEach(([k, v]) => localStorage.setItem(k, v));
    navigate('/');
  };

  // permanent account delete (asks twice: a warning, then the password)
  const deleteAccount = async () => {
    const ok = await ask({
      type: 'confirm', danger: true, okText: 'Continue',
      title: 'Delete account permanently?',
      message: 'Your profile, chats, statuses and friends will be erased. This cannot be undone.',
    });
    if (!ok) return;
    const pw = await ask({
      type: 'prompt', danger: true, okText: 'Delete forever', inputType: 'password', inputMode: 'text',
      title: 'Enter your password to confirm', placeholder: 'Password',
    });
    if (!pw) return;
    try {
      await api.post('users/delete_account/', { password: pw });
    } catch (error) {
      await ask({ type: 'alert', title: errMsg(error, 'Could not delete account') });
      return;
    }
    await ask({ type: 'alert', title: 'Your account was deleted' });
    doLogout();
  };

  const hasNewMessage = friends.some((f) => f.unread_count > 0 && !f.ov?.is_muted);
  const groupUnread = groups.some((g) => g.unread_count > 0 && !g.is_muted);
  const missedCalls = calls.filter((c) => c.direction === 'incoming' && c.status === 'missed').length;

  const lastText = (row, myId) => {
    if (!row?.last_message) return null;
    const mine = row.last_message.sender_id === myId;
    return `${mine ? 'You: ' : ''}${row.last_message.preview}`;
  };

  // ------------------------------------------------------------------- UI
  const ql = searchQuery.trim().toLowerCase();
  const byQuery = (name) => !ql || name.toLowerCase().includes(ql);
  const liveFriends = friends.filter((f) => !f.ov?.is_archived);
  const archivedFriends = friends.filter((f) => f.ov?.is_archived);
  const liveGroups = groups.filter((g) => !g.is_archived);
  const archivedGroups = groups.filter((g) => g.is_archived);
  const archivedCount = archivedFriends.length + archivedGroups.length;

  const buildMenu = (key, payload, o, extra = []) => {
    if (muteFor === key) {
      return [
        ['Mute 8 hours', () => { setMuteFor(null); chatSetting({ ...payload, mute_hours: 8 }); }],
        ['Mute 1 week', () => { setMuteFor(null); chatSetting({ ...payload, mute_hours: 168 }); }],
        ['Mute always', () => { setMuteFor(null); chatSetting({ ...payload, mute_hours: -1 }); }],
        ['‹ Back', () => setMuteFor(null), false, true],
      ];
    }
    return [
      [o.is_pinned ? 'Unpin' : 'Pin to top', () => chatSetting({ ...payload, is_pinned: !o.is_pinned })],
      o.is_muted ? ['Unmute', () => chatSetting({ ...payload, mute_hours: 0 })] : ['Mute…', () => setMuteFor(key), false, true],
      [o.is_archived ? 'Unarchive' : 'Archive', () => chatSetting({ ...payload, is_archived: !o.is_archived })],
      ...extra,
    ];
  };

  const friendRow = (friend) => {
    const ov = friend.ov;
    const typedText = lastText(ov, me?.id);
    const key = `f${friend.id}`;
    return (
      <ChatRow
        key={friend.id}
        avatar={<Avatar src={friend.profile_picture} name={friend.username} size={52} online={friend.is_online} T={T} />}
        title={friend.username}
        subtitle={ov?.is_locked ? 'Locked chat' : (typedText || (friend.is_online ? 'Online' : 'Say hi'))}
        subtitleHot={!typedText && friend.is_online}
        time={formatListTime(ov?.last_message?.created_at)}
        unread={friend.unread_count}
        pinned={ov?.is_pinned}
        muted={ov?.is_muted}
        locked={ov?.is_locked}
        onOpen={() => openFriend(friend)}
        menuOpen={rowMenu === key}
        setMenuOpen={(v) => { setMuteFor(null); setRowMenu(v ? key : null); }}
        menu={buildMenu(key, { friend_id: friend.id }, { is_pinned: ov?.is_pinned, is_muted: ov?.is_muted, is_archived: ov?.is_archived }, [
          [friend.is_blocked ? 'Unblock' : 'Block', () => (friend.is_blocked ? doUnblock(friend.id) : doBlock(friend)), !friend.is_blocked],
          ['Unfriend', () => doUnfriend(friend), true],
        ])}
      />
    );
  };

  const groupRow = (group) => {
    const key = `g${group.chat_id}`;
    return (
      <ChatRow
        key={group.chat_id}
        avatar={group.group_photo
          ? <Avatar src={group.group_photo} name={group.group_name} size={52} T={T} />
          : <div className="sc-ring" style={{ background: 'var(--raised)', padding: 0 }}><div style={{ width: 52, height: 52, display: 'grid', placeItems: 'center', border: 0, color: 'var(--accent)', fontSize: 24 }}><BiGroup /></div></div>}
        title={group.group_name}
        subtitle={group.is_locked ? 'Locked chat' : (lastText(group, me?.id) || `${group.member_count} members`)}
        time={formatListTime(group.last_message?.created_at)}
        unread={group.unread_count}
        pinned={group.is_pinned}
        muted={group.is_muted}
        locked={group.is_locked}
        onOpen={() => openGroup(group)}
        menuOpen={rowMenu === key}
        setMenuOpen={(v) => { setMuteFor(null); setRowMenu(v ? key : null); }}
        menu={buildMenu(key, { chat_id: group.chat_id }, group)}
      />
    );
  };

  const tabTitle = { chats: 'Chats', groups: 'Groups', status: 'Status', calls: 'Calls', profile: 'You' }[activeTab];
  const tabSub = {
    chats: pendingRequests.length ? `${pendingRequests.length} new request${pendingRequests.length > 1 ? 's' : ''}` : `Hi ${currentUsername}`,
    groups: `${groups.length} group${groups.length === 1 ? '' : 's'}`,
    status: 'Disappears after 24 hours',
    calls: missedCalls ? `${missedCalls} missed` : 'Recent calls',
    profile: 'Your profile and settings',
  }[activeTab];
  const badges = { chats: hasNewMessage || pendingRequests.length > 0, groups: groupUnread, calls: missedCalls > 0 };

  return (
    <div className={`home-shell ${T.light ? 't-light' : ''}`} style={themeVars(T)}>
      <style>{THEME_CSS}</style>
      {modal}

      <div className="sc-card">
        <header className="sc-top">
          <div className="sc-brand">
            <Seal size={34} keyhole />
            <span className="sc-wordmark">Secret Chat</span>
          </div>
          <div className="sc-top-actions">
            <button type="button" className="sc-iconbtn" aria-label="Scan or show QR code" onClick={() => setShowQr(true)}><BiQrScan /></button>
            <button type="button" className="sc-iconbtn" aria-label="New group" onClick={() => setShowNewGroup(true)}><BiPlus /></button>
          </div>
        </header>

        <h1 className="sc-title">{tabTitle}<small>{tabSub}</small></h1>

        <div className="sc-body hide-scroll">

          {/* ------------------------------------------------ CHATS */}
          {activeTab === 'chats' && (
            <>
              <label className="sc-search">
                <BiSearch style={{ fontSize: 20 }} />
                <input type="text" placeholder="Search chats or add by Secret ID" value={searchQuery}
                  onChange={handleSearch} aria-label="Search chats" />
              </label>

              {pendingRequests.length > 0 && !ql && (
                <>
                  <div className="sc-section">Friend requests</div>
                  {pendingRequests.map((req) => (
                    <div key={req.id} className="sc-row" style={{ cursor: 'default' }}>
                      <Avatar src={req.sender_profile_picture} name={req.sender_name} size={46} T={T} />
                      <div className="sc-row-main"><h3 className="sc-row-name"><span className="t">{req.sender_name}</span></h3><span className="sc-row-sub">wants to connect</span></div>
                      <button type="button" className="sc-iconbtn on" aria-label={`Accept ${req.sender_name}`} onClick={() => handleRequestAction(req.id, 'accepted')}><BiCheck /></button>
                      <button type="button" className="sc-iconbtn" aria-label={`Decline ${req.sender_name}`} onClick={() => handleRequestAction(req.id, 'declined')}><BiX /></button>
                    </div>
                  ))}
                </>
              )}

              {ql && searchResults.length > 0 && (
                <>
                  <div className="sc-section">Add people</div>
                  {searchResults.map((user) => (
                    <div key={user.id} className="sc-row" style={{ cursor: 'default' }}>
                      <Avatar src={user.profile_picture} name={user.username} size={46} T={T} />
                      <div className="sc-row-main"><h3 className="sc-row-name"><span className="t">{user.username}</span></h3></div>
                      <button type="button" className="sc-btn" style={{ height: 36, fontSize: 14 }} onClick={() => sendRequest(user.id)}>Add</button>
                    </div>
                  ))}
                </>
              )}

              {!ql && archivedCount > 0 && (
                <div className="sc-row" role="button" tabIndex={0} onClick={() => setShowArchived((v) => !v)} onKeyDown={(e) => { if (e.key === 'Enter') setShowArchived((v) => !v); }}>
                  <span className="sc-iconbtn" style={{ width: 52, height: 52, borderRadius: 20 }}><BiArchive /></span>
                  <div className="sc-row-main"><h3 className="sc-row-name"><span className="t">Archived</span></h3><span className="sc-row-sub">{archivedCount} chat{archivedCount > 1 ? 's' : ''} tucked away</span></div>
                  <BiChevronRight style={{ fontSize: 22, color: 'var(--sub)', transform: showArchived ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }} />
                </div>
              )}
              {!ql && showArchived && (<>{archivedFriends.map(friendRow)}{archivedGroups.map(groupRow)}</>)}

              {liveFriends.filter((f) => byQuery(f.username)).map(friendRow)}
              {ql && liveGroups.filter((g) => byQuery(g.group_name)).map(groupRow)}

              {!ql && sentRequests.length > 0 && (
                <>
                  <div className="sc-section">Waiting for them to accept</div>
                  {sentRequests.map((req) => (
                    <div key={req.id} className="sc-row" style={{ cursor: 'default' }}>
                      <div className="sc-row-main"><h3 className="sc-row-name"><span className="t">{req.receiver_name}</span></h3></div>
                      <span className="sc-row-time">Pending</span>
                    </div>
                  ))}
                </>
              )}

              {friends.length === 0 && !ql && (
                <div className="sc-empty">
                  <Seal size={64} keyhole style={{ margin: '0 auto' }} />
                  <b>No chats yet</b>
                  Search a Secret ID above, or scan a friend's QR code to say hi.
                  <div style={{ marginTop: 16 }}><button type="button" className="sc-btn" onClick={() => setShowQr(true)}><BiQrScan /> Scan or share my code</button></div>
                </div>
              )}
            </>
          )}

          {/* ------------------------------------------------ GROUPS */}
          {activeTab === 'groups' && (
            <>
              {liveGroups.map(groupRow)}
              {liveGroups.length === 0 && (
                <div className="sc-empty"><BiGroup style={{ fontSize: 40, color: 'var(--accent)' }} /><b>No groups yet</b>Create one and add your friends.
                  <div style={{ marginTop: 16 }}><button type="button" className="sc-btn" onClick={() => setShowNewGroup(true)}><BiPlus /> New group</button></div>
                </div>
              )}
            </>
          )}

          {/* ------------------------------------------------ STATUS */}
          {activeTab === 'status' && (
            <StatusTab T={T} rowBg="var(--surface)" me={me} currentUsername={currentUsername} friends={friends} statuses={statuses} refreshStatuses={fetchStatuses} />
          )}

          {/* ------------------------------------------------ CALLS */}
          {activeTab === 'calls' && (
            <>
              {calls.length === 0 ? (
                <div className="sc-empty"><BiPhoneCall style={{ fontSize: 40, color: 'var(--accent)' }} /><b>No calls yet</b>Open a chat and tap the phone icon.</div>
              ) : calls.map((c) => {
                const missed = c.status === 'missed' || c.status === 'declined';
                const outgoingCall = c.direction === 'outgoing';
                const label = c.status === 'completed' ? formatDuration(c.duration) || 'Completed'
                  : c.status === 'ringing' ? 'Ringing…' : c.status === 'ongoing' ? 'Ongoing' : (c.status === 'declined' ? 'Declined' : 'Missed');
                const bad = missed && !outgoingCall;
                return (
                  <div key={c.id} className="sc-row" style={{ cursor: 'default' }}>
                    <Avatar name={c.peer_name} size={48} T={T} />
                    <div className="sc-row-main">
                      <h3 className="sc-row-name" style={bad ? { color: '#ff7d8c' } : undefined}><span className="t">{c.peer_name}</span></h3>
                      <span className="sc-row-sub" style={{ display: 'flex', alignItems: 'center', gap: 5, color: bad ? '#ff7d8c' : undefined }}>
                        {outgoingCall ? <BiPhoneOutgoing /> : <BiPhoneIncoming />}{c.call_type === 'video' ? 'Video' : 'Voice'} · {label} · {formatListTime(c.started_at)}
                      </span>
                    </div>
                    <button type="button" className="sc-iconbtn" aria-label="Voice call" onClick={() => startCall({ friendId: c.peer_id, name: c.peer_name, callType: 'audio' })}><BiPhoneCall /></button>
                    <button type="button" className="sc-iconbtn" aria-label="Video call" onClick={() => startCall({ friendId: c.peer_id, name: c.peer_name, callType: 'video' })}><BiVideo /></button>
                  </div>
                );
              })}
            </>
          )}

          {/* ------------------------------------------------ YOU */}
          {activeTab === 'profile' && (
            <ProfileHub
              T={T} me={me} currentUsername={currentUsername} ask={ask} refresh={refresh}
              appTheme={appTheme} changeAppTheme={changeAppTheme}
              notifPerm={notifPerm} enableNotifications={enableNotifications}
              blockedUsers={blockedUsers} doUnblock={doUnblock}
              deleteAccount={deleteAccount} doLogout={doLogout} onAddUser={addByUsername}
            />
          )}
        </div>

        <NavBar tab={activeTab} setTab={(t) => { setRowMenu(null); setActiveTab(t); }} badges={badges} />
      </div>

      {showQr && <QrSheet T={T} me={me} onClose={() => setShowQr(false)} onAddUser={(u) => { setShowQr(false); addByUsername(u); }} />}

      {showNewGroup && (
        <Sheet T={T} title="New group" onClose={() => setShowNewGroup(false)}>
          <label className="sc-label">Group name</label>
          <input className="sc-field" placeholder="Weekend plan" value={groupName} onChange={(e) => setGroupName(e.target.value)} maxLength={60} />
          <label className="sc-label">Add friends ({selectedGroupMembers.length} selected)</label>
          <div className="sc-set-group">
            {friends.length === 0 && <p style={{ margin: 0, padding: 16, color: 'var(--sub)' }}>Add a friend first.</p>}
            {friends.map((friend) => (
              <button key={friend.id} type="button" className="sc-set" onClick={() => toggleGroupMember(friend.id)} aria-pressed={selectedGroupMembers.includes(friend.id)}>
                <Avatar src={friend.profile_picture} name={friend.username} size={38} T={T} />
                <span className="txt"><b>{friend.username}</b></span>
                <span className="sc-iconbtn" style={{ width: 28, height: 28, fontSize: 18, background: selectedGroupMembers.includes(friend.id) ? 'var(--accent)' : 'var(--raised)', color: '#fff' }}>{selectedGroupMembers.includes(friend.id) && <BiCheck />}</span>
              </button>
            ))}
          </div>
          <button type="button" className="sc-btn" style={{ width: '100%' }} onClick={async () => { if (await handleCreateGroup()) setShowNewGroup(false); }}>Create group</button>
        </Sheet>
      )}
    </div>
  );
}

export default Home;
