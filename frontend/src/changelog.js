// What changed in each update, newest first. The "What's new" page in Profile shows this list.
// Add a new entry on top (with a new id) for every release.
export const CHANGELOG = [
  {
    id: '2026-11-19', date: '19 Nov 2026', title: 'Reels and broadcast media',
    items: [
      '🎬 Reels: swipe through short videos from your friends and Discover, post your own, like and comment',
      '▶️ Discover also mixes in YouTube Shorts, so there is always something new to watch',
      '📢 Broadcast lists can now send photos, videos and files',
      '🎵 Song search finds many more songs, and you can pick any part of a full song from your phone',
      '⌨️ The keyboard stays open after you tap Send',
    ],
  },
  {
    id: '2026-11-18', date: '18 Nov 2026', title: 'Feedback, birthdays and updates',
    items: [
      '📝 Feedback box: send ideas or problems to the Chatzy team and read their reply',
      '🎂 Birthdays now pop up like a message banner, with a quick Wish button',
      '🔄 When a new version is ready, a pop-up asks you to update',
      '🖼️ Tap your own profile photo to view it full size',
    ],
  },
  {
    id: '2026-11-05', date: '5 Nov 2026', title: 'Calls, new menu and display size',
    items: [
      '📞 Voice and video calls, Instagram style: new call screen, mute, camera flip, group calls',
      '💬 Missed calls and call duration show in the chat',
      '😍 New message menu with reactions, a preview and action buttons',
      '🌧️ Hold any emoji, even your own custom ones, and it rains on both screens',
      '👀 See who reacted to a message, with a tab for each emoji',
      '📱 Display size in Profile makes the whole app bigger or smaller',
    ],
  },
  {
    id: '2026-11-04', date: '4 Nov 2026', title: 'Avatars and online pop-up',
    items: [
      '🎨 Pick a cartoon avatar for your profile photo',
      '👥 Tap a group or member photo to view it full size',
      '🟢 A cute pop-up when a friend comes online',
      '🖼️ Photo albums open in a gallery: swipe, select and download',
    ],
  },
];

export const LATEST_UPDATE = CHANGELOG[0].id;
const SEEN_KEY = 'changelog_seen';
export const hasUnseenUpdate = () => { try { return localStorage.getItem(SEEN_KEY) !== LATEST_UPDATE; } catch (e) { return false; } };
export const markUpdateSeen = () => { try { localStorage.setItem(SEEN_KEY, LATEST_UPDATE); } catch (e) { /* ignore */ } };
