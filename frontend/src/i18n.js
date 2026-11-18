// Tiny language switch: t('English text') gives the Tamil text when the app language is Tamil.
// Anything without a Tamil entry stays in English, so a missing word never breaks a screen.
const TA = {
  // bottom bar + titles
  'Messages': 'செய்திகள்', 'Groups': 'குழுக்கள்', 'Status': 'ஸ்டேடஸ்', 'Calls': 'அழைப்புகள்', 'You': 'நீங்கள்',
  'Search your chats': 'சாட்களைத் தேடுங்கள்', 'Search in this chat': 'இந்த சாட்டில் தேடுங்கள்', 'Message': 'செய்தி',
  // profile rows
  'Switch account': 'கணக்கை மாற்று', 'Add another account': 'இன்னொரு கணக்கைச் சேர்', 'Ask me anything': 'என்னிடம் கேளுங்கள்',
  'Anonymous questions from friends': 'நண்பர்களின் பெயரில்லாக் கேள்விகள்', 'My birthday': 'என் பிறந்தநாள்', 'Away auto-reply': 'தானியங்கி பதில்',
  'My mood': 'என் மனநிலை', 'Double-tap reaction': 'இரட்டை தட்டு ரியாக்ஷன்', 'Starred messages': 'நட்சத்திரக் குறியிட்ட செய்திகள்',
  'Privacy': 'தனியுரிமை', 'App lock': 'ஆப் லாக்', 'Logged-in devices': 'உள்நுழைந்த சாதனங்கள்', 'Admin panel': 'அட்மின் பேனல்',
  'Blocked users': 'தடுக்கப்பட்டவர்கள்', 'Display size': 'எழுத்து அளவு', 'Appearance': 'தோற்றம்', 'Quiet hours': 'அமைதி நேரம்',
  'Online alerts': 'ஆன்லைன் அறிவிப்பு', 'Sounds': 'ஒலிகள்', 'Notifications': 'அறிவிப்புகள்', 'Log out': 'வெளியேறு',
  'Delete my account': 'என் கணக்கை நீக்கு', 'Edit profile': 'சுயவிவரத்தைத் திருத்து', 'My QR': 'என் QR',
  'Language': 'மொழி', 'Quick replies': 'விரைவு பதில்கள்', 'Broadcast lists': 'ஒளிபரப்புப் பட்டியல்கள்',
  'Storage': 'சேமிப்பு', '2-step verification': '2-படி சரிபார்ப்பு', 'Chat tone': 'சாட் ஒலி', 'Cancel': 'ரத்து', 'Save': 'சேமி',
  'Send': 'அனுப்பு', 'Delete': 'நீக்கு', 'Back': 'பின்', 'On': 'ஆன்', 'Off': 'ஆஃப்', 'Default': 'இயல்பு',
  'Pinned': 'பின் செய்தது', 'New': 'புதிது', 'Edit': 'திருத்து', 'Add': 'சேர்', 'Turn on': 'ஆன் செய்', 'Turn off': 'ஆஃப் செய்',
};

const KEY = 'app_lang';
export const getLang = () => { try { return localStorage.getItem(KEY) === 'ta' ? 'ta' : 'en'; } catch (e) { return 'en'; } };
export const setLang = (l) => { try { localStorage.setItem(KEY, l === 'ta' ? 'ta' : 'en'); } catch (e) { /* ignore */ } };
export const t = (s) => (getLang() === 'ta' && TA[s]) || s;
