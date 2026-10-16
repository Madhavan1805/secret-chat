import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BiSearch, BiCheck, BiX, BiLogOut, BiLock, BiDotsVerticalRounded, BiPhoneCall, BiPhoneIncoming, BiPhoneOutgoing, BiVideo } from 'react-icons/bi';
import { BsChatSquareTextFill } from 'react-icons/bs';
import api from './api';
import Avatar from './Avatar';
import StatusTab from './StatusTab';
import { useModal } from './PromptModal';
import { useRealtime, disconnectSocket, isSocketOpen } from './socket';
import { getMe, clearMe, errMsg, formatListTime, formatDuration, startCall } from './config';
import { CHAT_THEMES, APP_MODES, THEME_CSS, resolveTheme, getAppTheme, setAppTheme } from './theme';
import { requestNotifyPermission, notifyPermission, setActiveChat } from './notify';
import { pushLogin, pushLogout } from './push';

// one row of the chats / groups list
function ChatRow({ T, rowBg, avatar, title, subtitle, subtitleColor, time, unread, pinned, muted, locked, onOpen, menu, menuOpen, setMenuOpen }) {
  return (
    <div className="d-flex align-items-center p-2 rounded mb-2 position-relative" style={{ background: rowBg, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.05)' }} onClick={onOpen}>
      <div className="me-3">{avatar}</div>
      <div className="d-flex flex-column flex-grow-1" style={{ minWidth: 0 }}>
        <div className="d-flex align-items-center gap-1">
          <h6 className="mb-0 fw-bold text-white text-truncate" style={{ fontSize: '14px' }}>{title}</h6>
          {pinned && <span style={{ fontSize: 10 }}>📌</span>}
          {muted && <span style={{ fontSize: 10 }}>🔇</span>}
          {locked && <BiLock style={{ color: T.accent }} />}
        </div>
        <small className="text-truncate" style={{ fontSize: '11px', color: subtitleColor || 'rgba(255,255,255,0.55)' }}>{subtitle}</small>
      </div>
      <div className="d-flex flex-column align-items-end ms-2" style={{ minWidth: 44 }}>
        <small style={{ fontSize: 10, color: unread > 0 && !muted ? '#22c55e' : 'rgba(255,255,255,0.45)' }}>{time}</small>
        {unread > 0 && (
          <span className="badge rounded-pill mt-1" style={{ background: muted ? '#6b7280' : '#22c55e', fontSize: 10 }}>{unread}</span>
        )}
      </div>
      <button
        className="btn btn-sm p-0 ms-1 border-0"
        style={{ color: T.accent }}
        onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen ? null : true); }}
      >
        <BiDotsVerticalRounded className="fs-5" />
      </button>
      {menuOpen && (
        <>
          <div onClick={(e) => { e.stopPropagation(); setMenuOpen(null); }} style={{ position: 'fixed', inset: 0, zIndex: 900 }} />
          <div
            className="shadow-lg p-1 rounded-3"
            style={{ position: 'absolute', right: 8, top: '85%', zIndex: 901, background: T.light ? '#fff' : '#26121a', border: `1px solid ${T.accent}`, minWidth: 150 }}
            onClick={(e) => e.stopPropagation()}
          >
            {menu.map(([label, fn, danger]) => (
              <button
                key={label}
                className="btn btn-sm w-100 text-start"
                style={{ color: danger ? '#f87171' : (T.light ? '#1f2937' : '#fff'), fontSize: 12 }}
                onClick={() => { setMenuOpen(null); fn(); }}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Home() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  const [activeTab, setActiveTab] = useState('chats');
  const [showTopMenu, setShowTopMenu] = useState(false);
  const [rowMenu, setRowMenu] = useState(null);

  const [me, setMe] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [friends, setFriends] = useState([]);
  const [groups, setGroups] = useState([]);
  const [calls, setCalls] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [statuses, setStatuses] = useState([]);

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');

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

  const handleRequestAction = async (reqId, action) => {
    try {
      await api.patch(`requests/${reqId}/`, { status: action });
      refresh();
    } catch (error) { ask({ type: 'alert', title: errMsg(error, 'Failed') }); }
  };

  const handleProfileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('profile_picture', file);
    try {
      await api.patch('users/update_profile/', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      await getMe(true);
      refresh();
      ask({ type: 'alert', title: 'Profile Picture Updated! 📸' });
    } catch (error) { ask({ type: 'alert', title: errMsg(error, 'Upload failed') }); }
  };

  const removeProfilePicture = async () => {
    try {
      await api.patch('users/update_profile/', { remove_picture: 'true' });
      await getMe(true);
      refresh();
      ask({ type: 'alert', title: 'Profile Picture Removed! 🗑️' });
    } catch (error) { ask({ type: 'alert', title: errMsg(error, 'Failed') }); }
  };

  const handleProfileSave = async () => {
    if (!editName.trim()) { ask({ type: 'alert', title: 'Name cannot be empty!' }); return; }
    try {
      const formData = new FormData();
      formData.append('username', editName);
      formData.append('bio', editBio);
      const response = await api.patch('users/update_profile/', formData);
      localStorage.setItem('username', response.data.username);
      await getMe(true);
      setIsEditingProfile(false);
      refresh();
      ask({ type: 'alert', title: 'Profile Updated Successfully! ✅' });
    } catch (error) { ask({ type: 'alert', title: errMsg(error, 'Update failed!') }); }
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
      return;
    }
    try {
      await api.post('chats/create_group/', { group_name: groupName, participants: selectedGroupMembers });
      ask({ type: 'alert', title: `Group '${groupName}' created successfully! 🎉` });
      setGroupName('');
      setSelectedGroupMembers([]);
      setActiveTab('groups');
      refresh();
    } catch (error) { ask({ type: 'alert', title: errMsg(error, 'Failed to create group.') }); }
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

  const doLogout = () => {
    const keep = {};
    Object.keys(localStorage).forEach((k) => { if (/^(pinned_msg_|app_theme)/.test(k)) keep[k] = localStorage.getItem(k); });
    pushLogout();
    disconnectSocket();
    clearMe();
    localStorage.clear();
    Object.entries(keep).forEach(([k, v]) => localStorage.setItem(k, v));
    navigate('/');
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
  return (
    <div className={`d-flex justify-content-center align-items-center vh-100 px-3 ${T.light ? 't-light' : ''}`} style={{ backgroundColor: T.bg }}>
      <style>
        {`
        @import url('https://fonts.googleapis.com/css2?family=Great+Vibes&family=Playfair+Display:ital,wght@0,700;1,400&display=swap');
        .hide-scroll::-webkit-scrollbar { display: none; }
        .hide-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        ${THEME_CSS}
        `}
      </style>

      {modal}

      <div className="glass-card p-4 d-flex flex-column w-100 position-relative" style={{ maxWidth: '450px', height: '88vh', border: `1px solid ${T.accent}33`, overflow: 'hidden', ...(T.light ? { background: T.panel } : {}) }}>

        <div className="d-flex justify-content-between align-items-center pb-2 border-bottom flex-shrink-0" style={{ borderColor: `${T.accent}33` }}>
          <div>
            <div className="position-relative" style={{ height: '42px', paddingLeft: '5px' }}>
              <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.7rem', fontWeight: '700', color: T.light ? '#1f2937' : '#fdfbf7', letterSpacing: '1px' }}>Secret</span>
              <span className="position-absolute" style={{ fontFamily: "'Great Vibes', cursive", fontSize: '2.2rem', color: T.accent, textShadow: T.light ? 'none' : `0 0 8px ${T.accent}99`, left: '62px', top: '10px' }}>Chat</span>
            </div>
            <div className="text-light opacity-75 mt-1" style={{ fontSize: '12px' }}>
              Welcome, <span className="fw-bold" style={{ color: T.accent }}>{currentUsername}</span>
            </div>
          </div>

          <div className="position-relative">
            <button className="btn btn-sm text-light rounded-circle p-1" style={{ background: 'rgba(255,255,255,0.05)' }} onClick={() => setShowTopMenu(!showTopMenu)}>
              <BiDotsVerticalRounded className="fs-3" style={{ color: T.accent }} />
            </button>

            {showTopMenu && (
              <div className="dropdown-menu dropdown-menu-end show shadow-lg p-2 rounded-3"
                   style={{ right: 0, top: '110%', position: 'absolute', zIndex: 1000, background: T.light ? '#fff' : 'rgba(59, 14, 27, 0.95)', border: `1px solid ${T.accent}55` }}>
                <button className="dropdown-item text-white mb-1 rounded d-flex align-items-center gap-2" onClick={() => { setActiveTab('profile'); setShowTopMenu(false); }} style={{ fontSize: '14px' }}>
                  <span>👤</span> My Profile
                </button>
                <hr className="my-1 border-secondary" />
                <button className="dropdown-item text-danger fw-bold rounded d-flex align-items-center gap-2" onClick={doLogout} style={{ fontSize: '14px' }}>
                  <BiLogOut className="fs-5" /> Logout
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="d-flex p-1 gap-2 my-2 hide-scroll overflow-auto flex-shrink-0" style={{ whiteSpace: 'nowrap' }}>
          {['chats', 'groups', 'status', 'calls', 'requests'].map((tab) => (
            <button key={tab}
              className={`btn rounded-pill py-1 px-3 position-relative ${activeTab === tab ? 'fw-bold' : 'text-light'}`}
              onClick={() => setActiveTab(tab)}
              style={{
                textTransform: 'capitalize',
                fontSize: '12px',
                background: activeTab === tab ? T.mine : 'rgba(255,255,255,0.05)',
                color: activeTab === tab ? T.mineText : (T.light ? '#374151' : '#fff'),
                border: `1px solid ${activeTab === tab ? T.accent : `${T.accent}33`}`,
              }}>
              {tab}
              {tab === 'chats' && hasNewMessage && <span className="position-absolute top-0 start-100 translate-middle p-1 bg-success border border-light rounded-circle shadow" style={{ width: '10px', height: '10px' }}></span>}
              {tab === 'groups' && groupUnread && <span className="position-absolute top-0 start-100 translate-middle p-1 bg-success border border-light rounded-circle shadow" style={{ width: '10px', height: '10px' }}></span>}
              {tab === 'calls' && missedCalls > 0 && <span className="position-absolute top-0 start-100 translate-middle p-1 bg-danger border border-light rounded-circle shadow" style={{ width: '10px', height: '10px' }}></span>}
              {tab === 'requests' && pendingRequests.length > 0 && <span className="position-absolute top-0 start-100 translate-middle p-1 bg-danger border border-light rounded-circle shadow" style={{ width: '10px', height: '10px' }}></span>}
            </button>
          ))}
        </div>

        <div className="flex-grow-1 overflow-auto px-1 hide-scroll" style={{ minHeight: 0 }}>

          {/* ------------------------------------------------ CHATS TAB */}
          {activeTab === 'chats' && (
            <>
              <div className="mb-2">
                <div className="rounded-pill d-flex align-items-center p-2 px-3" style={{ background: 'rgba(255, 255, 255, 0.08)', border: `1px solid ${T.accent}33` }}>
                  <BiSearch className="text-light fs-5 me-2" />
                  <input type="text" placeholder="Search Friend's ID (@username)..." className="bg-transparent border-0 w-100 text-white shadow-none" style={{ outline: 'none' }} value={searchQuery} onChange={handleSearch} />
                </div>
              </div>

              {searchQuery.length > 0 ? (
                searchResults.length > 0 ? (
                  searchResults.map((user) => (
                    <div key={user.id} className="d-flex align-items-center justify-content-between p-2 rounded mb-2" style={{ background: rowBg }}>
                      <div className="d-flex align-items-center">
                        <div className="me-3"><Avatar src={user.profile_picture} name={user.username} size={40} T={T} /></div>
                        <h6 className="mb-0 fw-bold text-white" style={{ fontSize: '14px' }}>{user.username}</h6>
                      </div>
                      <button className="btn btn-sm fw-bold px-3 rounded-pill" onClick={() => sendRequest(user.id)} style={{ background: T.accent, color: '#1f2937' }}>Add</button>
                    </div>
                  ))
                ) : (<p className="text-center text-light opacity-75 mt-4">No Secret ID found.</p>)
              ) : (
                <div className="mt-2">
                  {friends.length > 0 ? (
                    friends.map((friend) => {
                      const ov = friend.ov;
                      const typedText = lastText(ov, me?.id);
                      return (
                        <ChatRow
                          key={friend.id}
                          T={T}
                          rowBg={rowBg}
                          avatar={<Avatar src={friend.profile_picture} name={friend.username} size={44} online={friend.is_online} T={T} />}
                          title={friend.username}
                          subtitle={ov?.is_locked ? '🔒 Locked chat' : (typedText || (friend.is_online ? '● Online' : 'Tap to chat'))}
                          subtitleColor={!typedText && friend.is_online ? '#22c55e' : undefined}
                          time={formatListTime(ov?.last_message?.created_at)}
                          unread={friend.unread_count}
                          pinned={ov?.is_pinned}
                          muted={ov?.is_muted}
                          locked={ov?.is_locked}
                          onOpen={() => openFriend(friend)}
                          menuOpen={rowMenu === `f${friend.id}`}
                          setMenuOpen={(v) => setRowMenu(v ? `f${friend.id}` : null)}
                          menu={[
                            [ov?.is_pinned ? '📌 Unpin chat' : '📌 Pin chat', () => chatSetting({ friend_id: friend.id, is_pinned: !ov?.is_pinned })],
                            [ov?.is_muted ? '🔔 Unmute' : '🔇 Mute', () => chatSetting({ friend_id: friend.id, is_muted: !ov?.is_muted })],
                            [friend.is_blocked ? '✅ Unblock' : '🚫 Block', () => (friend.is_blocked ? doUnblock(friend.id) : doBlock(friend)), !friend.is_blocked],
                            ['➖ Unfriend', () => doUnfriend(friend), true],
                          ]}
                        />
                      );
                    })
                  ) : (
                    <div className="d-flex flex-column justify-content-center align-items-center h-100 text-light opacity-50 text-center mt-4">
                      <BsChatSquareTextFill className="fs-2 mb-2" style={{ color: T.accent }} />
                      <p className="mb-1 fw-bold" style={{ fontSize: '14px' }}>No chats yet</p>
                      <small style={{ fontSize: '12px' }}>Search a friend's ID to connect.</small>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ------------------------------------------------ GROUPS TAB */}
          {activeTab === 'groups' && (
            <div className="mt-2 px-1">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h6 className="text-white fw-bold mb-0" style={{ fontSize: '14px' }}>Your Groups</h6>
              </div>

              {groups.length > 0 ? (
                groups.map((group) => (
                  <ChatRow
                    key={group.chat_id}
                    T={T}
                    rowBg={rowBg}
                    avatar={<div className="rounded-circle d-flex justify-content-center align-items-center shadow" style={{ width: 44, height: 44, background: T.accent }}>👥</div>}
                    title={group.group_name}
                    subtitle={group.is_locked ? '🔒 Locked chat' : (lastText(group, me?.id) || `${group.member_count} members`)}
                    time={formatListTime(group.last_message?.created_at)}
                    unread={group.unread_count}
                    pinned={group.is_pinned}
                    muted={group.is_muted}
                    locked={group.is_locked}
                    onOpen={() => openGroup(group)}
                    menuOpen={rowMenu === `g${group.chat_id}`}
                    setMenuOpen={(v) => setRowMenu(v ? `g${group.chat_id}` : null)}
                    menu={[
                      [group.is_pinned ? '📌 Unpin group' : '📌 Pin group', () => chatSetting({ chat_id: group.chat_id, is_pinned: !group.is_pinned })],
                      [group.is_muted ? '🔔 Unmute' : '🔇 Mute', () => chatSetting({ chat_id: group.chat_id, is_muted: !group.is_muted })],
                    ]}
                  />
                ))
              ) : (
                <p className="text-center text-light opacity-50 mt-4" style={{ fontSize: '13px' }}>No active groups.</p>
              )}

              <hr className="border-secondary my-3" />

              <div className="text-center text-light opacity-75 mb-2">
                <h6 className="fw-bold" style={{ fontSize: '13px', color: T.accent }}>Create New Group</h6>
              </div>

              <input type="text" className="form-control mb-2 text-white form-control-sm" placeholder="Group Name..."
                     value={groupName} onChange={(e) => setGroupName(e.target.value)}
                     style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${T.accent}55`, fontSize: '13px' }} />

              <h6 className="text-light mb-1 opacity-75" style={{ fontSize: '11px' }}>Select Friends:</h6>
              <div className="overflow-auto mb-2 hide-scroll" style={{ maxHeight: '120px' }}>
                {friends.length > 0 ? friends.map((friend) => (
                  <div key={friend.id} className="d-flex align-items-center justify-content-between p-1 rounded mb-1" style={{ background: rowBg }}>
                    <span className="text-white" style={{ fontSize: '12px' }}>{friend.username}</span>
                    <input type="checkbox" className="form-check-input" style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: T.accent }}
                           checked={selectedGroupMembers.includes(friend.id)}
                           onChange={() => toggleGroupMember(friend.id)} />
                  </div>
                )) : <p className="text-light opacity-50 text-center" style={{ fontSize: '11px' }}>No friends available.</p>}
              </div>

              <button className="btn w-100 fw-bold rounded-pill btn-sm" style={{ background: T.accent, color: '#1f2937', fontSize: '12px' }} onClick={handleCreateGroup}>
                Create Group
              </button>
            </div>
          )}

          {/* ------------------------------------------------ STATUS TAB */}
          {activeTab === 'status' && (
            <StatusTab
              T={T}
              rowBg={rowBg}
              me={me}
              currentUsername={currentUsername}
              friends={friends}
              statuses={statuses}
              refreshStatuses={fetchStatuses}
            />
          )}

          {/* ------------------------------------------------ CALLS TAB */}
          {activeTab === 'calls' && (
            <div>
              {calls.length === 0 ? (
                <div className="text-center mt-4 text-light opacity-75">
                  <BiPhoneCall className="fs-2 mb-2" style={{ color: T.accent }} />
                  <h6 className="fw-bold" style={{ fontSize: '14px' }}>No calls yet</h6>
                  <p style={{ fontSize: '11px' }}>Open a chat and tap the phone icon to call.</p>
                </div>
              ) : (
                calls.map((c) => {
                  const missed = c.status === 'missed' || c.status === 'declined';
                  const outgoingCall = c.direction === 'outgoing';
                  const label = c.status === 'completed' ? formatDuration(c.duration) || 'Completed'
                    : c.status === 'ringing' ? 'Ringing…' : c.status === 'ongoing' ? 'Ongoing' : (c.status === 'declined' ? 'Declined' : 'Missed');
                  return (
                    <div key={c.id} className="d-flex align-items-center p-2 rounded mb-2" style={{ background: rowBg }}>
                      <div className="me-3"><Avatar name={c.peer_name} size={40} T={T} /></div>
                      <div className="flex-grow-1" style={{ minWidth: 0 }}>
                        <h6 className="mb-0 fw-bold text-truncate" style={{ fontSize: '13px', color: missed && !outgoingCall ? '#f87171' : '#fff' }}>{c.peer_name}</h6>
                        <small className="d-flex align-items-center gap-1" style={{ fontSize: '10px', color: missed && !outgoingCall ? '#f87171' : 'rgba(255,255,255,0.55)' }}>
                          {outgoingCall ? <BiPhoneOutgoing /> : <BiPhoneIncoming />}
                          {c.call_type === 'video' ? 'Video' : 'Voice'} • {label} • {formatListTime(c.started_at)}
                        </small>
                      </div>
                      <button className="btn btn-sm p-1" title="Voice call" onClick={() => startCall({ friendId: c.peer_id, name: c.peer_name, callType: 'audio' })}><BiPhoneCall className="fs-5" style={{ color: T.accent }} /></button>
                      <button className="btn btn-sm p-1" title="Video call" onClick={() => startCall({ friendId: c.peer_id, name: c.peer_name, callType: 'video' })}><BiVideo className="fs-5" style={{ color: T.accent }} /></button>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ------------------------------------------------ REQUESTS TAB */}
          {activeTab === 'requests' && (
            <div>
              {pendingRequests.length === 0 ? (
                <p className="text-center text-light opacity-50 mt-3" style={{ fontSize: '12px' }}>No pending requests.</p>
              ) : (
                pendingRequests.map((req) => (
                  <div key={req.id} className="d-flex align-items-center p-2 rounded mb-2" style={{ background: rowBg }}>
                    <div className="me-2"><Avatar src={req.sender_profile_picture} name={req.sender_name} size={35} T={T} /></div>
                    <div className="flex-grow-1"><h6 className="mb-0 fw-bold text-white" style={{ fontSize: '13px' }}>{req.sender_name}</h6></div>
                    <div className="d-flex gap-1">
                      <button className="btn btn-sm rounded-circle d-flex align-items-center justify-content-center" style={{ background: '#4ade80', color: '#000', width: '30px', height: '30px' }} onClick={() => handleRequestAction(req.id, 'accepted')}><BiCheck className="fs-5" /></button>
                      <button className="btn btn-sm btn-outline-danger rounded-circle d-flex align-items-center justify-content-center" style={{ width: '30px', height: '30px' }} onClick={() => handleRequestAction(req.id, 'declined')}><BiX className="fs-5" /></button>
                    </div>
                  </div>
                ))
              )}

              {sentRequests.length > 0 && (
                <>
                  <h6 className="text-light mb-2 mt-3 opacity-75" style={{ fontSize: '12px' }}>Waiting for them to accept</h6>
                  {sentRequests.map((req) => (
                    <div key={req.id} className="d-flex align-items-center p-2 rounded mb-2" style={{ background: rowBg }}>
                      <div className="flex-grow-1"><h6 className="mb-0 text-white" style={{ fontSize: '13px' }}>{req.receiver_name}</h6></div>
                      <small className="text-warning" style={{ fontSize: 10 }}>Pending…</small>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* ------------------------------------------------ PROFILE TAB */}
          {activeTab === 'profile' && (
            <div className="d-flex flex-column align-items-center mt-2 pb-3">
              <div className="mb-2"><Avatar src={me?.profile_picture} name={currentUsername} size={90} T={T} /></div>
              <input type="file" id="dp-upload" className="d-none" accept="image/*" onChange={handleProfileUpload} />
              <div className="d-flex gap-2 mb-2">
                <label htmlFor="dp-upload" className="btn btn-sm rounded-pill px-3 m-0 fw-bold" style={{ cursor: 'pointer', background: T.accent, color: '#1f2937', fontSize: '11px' }}>Change Photo 📸</label>
                {me?.profile_picture && (<button className="btn btn-sm btn-outline-danger rounded-pill px-3" style={{ fontSize: '11px' }} onClick={removeProfilePicture}>Remove 🗑️</button>)}
              </div>

              {isEditingProfile ? (
                <div className="w-100 px-2">
                  <label className="text-light opacity-75 mb-1" style={{ fontSize: '11px' }}>Name (Secret ID)</label>
                  <input type="text" className="form-control text-white mb-1 form-control-sm" style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${T.accent}55`, fontSize: '12px' }} value={editName} onChange={(e) => setEditName(e.target.value)} />
                  <label className="text-light opacity-75 mb-1" style={{ fontSize: '11px' }}>Bio</label>
                  <textarea className="form-control text-white mb-2 form-control-sm" rows="2" style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${T.accent}55`, fontSize: '12px' }} value={editBio} onChange={(e) => setEditBio(e.target.value)}></textarea>
                  <div className="d-flex gap-2">
                    <button className="btn flex-grow-1 py-1 fw-bold btn-sm" style={{ background: T.accent, color: '#1f2937', fontSize: '12px' }} onClick={handleProfileSave}>Save</button>
                    <button className="btn btn-outline-light flex-grow-1 py-1 btn-sm" style={{ fontSize: '12px' }} onClick={() => setIsEditingProfile(false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <h5 className="text-white fw-bold mb-1" style={{ fontSize: '16px' }}>{currentUsername}</h5>
                  <p className="text-center text-light px-2 fst-italic my-1" style={{ fontSize: '12px' }}>{me?.bio ? `"${me.bio}"` : 'No bio added.'}</p>
                  <button className="btn btn-sm btn-outline-light rounded-pill px-3 mt-2" style={{ fontSize: '11px' }} onClick={() => { setEditName(currentUsername); setEditBio(me?.bio || ''); setIsEditingProfile(true); }}>Edit Profile ✏️</button>
                </>
              )}

              <div className="w-100 px-2 mt-4">
                <h6 className="fw-bold mb-2" style={{ fontSize: '12px', color: T.accent }}>🎨 App Theme</h6>
                <div className="d-flex gap-2 flex-wrap mb-3">
                  {APP_MODES.map((m) => (
                    <button key={m.key} className="btn btn-sm rounded-pill"
                      style={{ fontSize: 11, border: `1px solid ${T.accent}`, background: appTheme === m.key ? T.accent : 'transparent', color: appTheme === m.key ? '#1f2937' : (T.light ? '#374151' : '#fff') }}
                      onClick={() => changeAppTheme(m.key)}>{m.label}</button>
                  ))}
                  {Object.entries(CHAT_THEMES).filter(([k]) => !APP_MODES.some((m) => m.key === k)).map(([k, v]) => (
                    <button key={k} className="btn btn-sm rounded-pill"
                      style={{ fontSize: 11, border: `1px solid ${T.accent}`, background: appTheme === k ? T.accent : 'transparent', color: appTheme === k ? '#1f2937' : (T.light ? '#374151' : '#fff') }}
                      onClick={() => changeAppTheme(k)}>{v.label}</button>
                  ))}
                </div>

                <h6 className="fw-bold mb-2" style={{ fontSize: '12px', color: T.accent }}>🔔 Notifications</h6>
                {notifPerm === 'granted' ? (
                  <p className="text-success small">Enabled ✅ (new messages when this tab is in background)</p>
                ) : notifPerm === 'unsupported' ? (
                  <p className="text-white-50 small">This browser does not support notifications.</p>
                ) : (
                  <button className="btn btn-sm rounded-pill mb-3" style={{ fontSize: 11, background: T.accent, color: '#1f2937' }} onClick={enableNotifications}>Enable notifications</button>
                )}

                <h6 className="fw-bold mb-2 mt-2" style={{ fontSize: '12px', color: T.accent }}>🚫 Blocked users</h6>
                {blockedUsers.length === 0 ? (
                  <p className="text-white-50 small">Nobody is blocked.</p>
                ) : blockedUsers.map((u) => (
                  <div key={u.id} className="d-flex align-items-center justify-content-between p-2 rounded mb-1" style={{ background: rowBg }}>
                    <span className="text-white" style={{ fontSize: 13 }}>{u.username}</span>
                    <button className="btn btn-sm btn-outline-light rounded-pill" style={{ fontSize: 11 }} onClick={() => doUnblock(u.id)}>Unblock</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Home;
