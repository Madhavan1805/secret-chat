import React, { useState } from 'react';
import { BiSearch, BiBell, BiUserPlus, BiChat, BiGroup, BiAperture, BiPhoneCall, BiUser } from 'react-icons/bi';
import { Seal } from './ui';
import { THEME_CSS, themeVars } from './theme';

// Shown when the DECOY PIN is used: looks like a fresh account with nothing in it.
// No network calls are made, so none of the real data is touched or loaded.
const TABS = [
  ['chats', 'Messages', BiChat, 'No chats yet', 'Add a friend with their Secret ID to start talking.'],
  ['groups', 'Groups', BiGroup, 'No groups yet', 'Groups you create or join will show up here.'],
  ['status', 'Status', BiAperture, 'No updates', 'Status updates from your friends will show up here.'],
  ['calls', 'Calls', BiPhoneCall, 'No calls yet', 'Your recent calls will show up here.'],
  ['profile', 'You', BiUser, 'Your profile', 'Add friends to get started.'],
];

export default function DecoyApp({ T }) {
  const [tab, setTab] = useState('chats');
  const cur = TABS.find((t) => t[0] === tab);
  return (
    <div className="home-shell" style={themeVars(T)}>
      <style>{THEME_CSS}</style>
      <div className="sc-card">
        <header className="sc-top">
          <span className="sc-wordmark" aria-label="Chatzy"><span className="w1">Chatzy</span></span>
          <div className="sc-top-actions">
            <button type="button" className="sc-iconbtn" aria-label="Requests"><BiBell /></button>
            <button type="button" className="sc-iconbtn" aria-label="Find people"><BiUserPlus /></button>
          </div>
        </header>
        <h1 className="sc-title">{cur[1]}</h1>
        <div className="sc-body hide-scroll">
          {tab === 'chats' && (
            <label className="sc-search"><BiSearch style={{ fontSize: 20 }} /><input type="text" placeholder="Search your chats" aria-label="Search chats" /></label>
          )}
          <div className="sc-empty">
            <Seal size={64} keyhole style={{ margin: '0 auto' }} />
            <b>{cur[3]}</b>
            <p>{cur[4]}</p>
          </div>
        </div>
        <nav className="sc-nav" aria-label="Main">
          <div className="sc-nav-bar">
            {TABS.map(([key, label, Icon]) => (
              <button type="button" key={key} className="sc-nav-item" aria-current={tab === key ? 'page' : undefined} aria-label={label} onClick={() => setTab(key)}>
                <Icon /><span className="lbl">{label}</span>
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
