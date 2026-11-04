import React from 'react';

// Original cartoon avatars, drawn as SVG (no images to download). The picked one is turned into a PNG and
// uploaded as the normal profile picture, so friends, groups and notifications show it like any other photo.

const eye = (x, y, r = 7) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#2b2233"/><circle cx="${x + r * 0.35}" cy="${y - r * 0.35}" r="${r * 0.32}" fill="#fff"/>`;
const eyes = (y = 104, gap = 26, r = 7) => eye(100 - gap, y, r) + eye(100 + gap, y, r);
const cheeks = (y = 122, gap = 40, c = '#ff8fa3') => `<ellipse cx="${100 - gap}" cy="${y}" rx="9" ry="6" fill="${c}" opacity=".55"/><ellipse cx="${100 + gap}" cy="${y}" rx="9" ry="6" fill="${c}" opacity=".55"/>`;
const smile = (y = 124, w = 12) => `<path d="M${100 - w} ${y} Q100 ${y + 14} ${100 + w} ${y}" fill="none" stroke="#2b2233" stroke-width="4" stroke-linecap="round"/>`;
const nose = (y = 114, c = '#e86a8a') => `<ellipse cx="100" cy="${y}" rx="7" ry="5" fill="${c}"/>`;

export const AVATARS = [
  { key: 'cat', label: 'Cat', bg: '#FFE0B5', art: () => `
    <polygon points="52,84 58,34 98,62" fill="#F0A04B"/><polygon points="148,84 142,34 102,62" fill="#F0A04B"/>
    <polygon points="62,74 64,48 86,64" fill="#FFB5C5"/><polygon points="138,74 136,48 114,64" fill="#FFB5C5"/>
    <ellipse cx="100" cy="116" rx="60" ry="52" fill="#F0A04B"/>
    <path d="M100 66 v14 M84 70 v10 M116 70 v10" stroke="#C97A2B" stroke-width="5" stroke-linecap="round"/>
    ${eyes(108)}${nose(122)}${smile(130, 11)}${cheeks(126, 42)}
    <path d="M38 118 h22 M38 130 l22 -4 M162 118 h-22 M162 130 l-22 -4" stroke="#fff" stroke-width="3" stroke-linecap="round"/>` },
  { key: 'bear', label: 'Bear', bg: '#E6D5B8', art: () => `
    <circle cx="56" cy="62" r="22" fill="#8B5E3C"/><circle cx="144" cy="62" r="22" fill="#8B5E3C"/>
    <circle cx="56" cy="62" r="11" fill="#E8B98A"/><circle cx="144" cy="62" r="11" fill="#E8B98A"/>
    <circle cx="100" cy="106" r="60" fill="#A06D45"/>
    <ellipse cx="100" cy="126" rx="28" ry="22" fill="#F1D3AE"/>
    ${eyes(100, 28)}<ellipse cx="100" cy="116" rx="9" ry="7" fill="#3a2a22"/>
    <path d="M100 123 v6 M90 133 Q100 141 110 133" fill="none" stroke="#3a2a22" stroke-width="4" stroke-linecap="round"/>${cheeks(120, 46, '#ff8f7a')}` },
  { key: 'bunny', label: 'Bunny', bg: '#FFD3E0', art: () => `
    <ellipse cx="74" cy="48" rx="16" ry="42" fill="#fff"/><ellipse cx="126" cy="48" rx="16" ry="42" fill="#fff"/>
    <ellipse cx="74" cy="50" rx="8" ry="30" fill="#FFB0C7"/><ellipse cx="126" cy="50" rx="8" ry="30" fill="#FFB0C7"/>
    <circle cx="100" cy="116" r="54" fill="#fff"/>
    ${eyes(110, 24)}${nose(124, '#ff8fb0')}
    <path d="M100 129 v5 M90 136 Q100 143 110 136" fill="none" stroke="#2b2233" stroke-width="4" stroke-linecap="round"/>
    <rect x="95" y="138" width="10" height="9" rx="2" fill="#fff" stroke="#e5dce8" stroke-width="2"/>${cheeks(126, 40)}` },
  { key: 'fox', label: 'Fox', bg: '#CFE7EF', art: () => `
    <polygon points="46,92 54,32 98,66" fill="#E8742A"/><polygon points="154,92 146,32 102,66" fill="#E8742A"/>
    <polygon points="54,32 62,52 76,44" fill="#3a2a22"/><polygon points="146,32 138,52 124,44" fill="#3a2a22"/>
    <path d="M40 104 Q100 56 160 104 Q150 168 100 168 Q50 168 40 104Z" fill="#F08A3C"/>
    <path d="M40 112 Q70 120 100 160 Q130 120 160 112 Q150 168 100 168 Q50 168 40 112Z" fill="#fff"/>
    ${eyes(104, 28)}<ellipse cx="100" cy="150" rx="8" ry="6" fill="#2b2233"/>${cheeks(126, 52, '#ff9a8a')}` },
  { key: 'panda', label: 'Panda', bg: '#CDE9D0', art: () => `
    <circle cx="56" cy="60" r="21" fill="#2b2233"/><circle cx="144" cy="60" r="21" fill="#2b2233"/>
    <circle cx="100" cy="108" r="60" fill="#fff"/>
    <ellipse cx="72" cy="102" rx="14" ry="19" fill="#2b2233" transform="rotate(-18 72 102)"/><ellipse cx="128" cy="102" rx="14" ry="19" fill="#2b2233" transform="rotate(18 128 102)"/>
    <circle cx="74" cy="100" r="6" fill="#fff"/><circle cx="126" cy="100" r="6" fill="#fff"/><circle cx="75" cy="101" r="3" fill="#2b2233"/><circle cx="125" cy="101" r="3" fill="#2b2233"/>
    <ellipse cx="100" cy="124" rx="9" ry="6" fill="#2b2233"/>${smile(131, 10)}${cheeks(128, 46)}` },
  { key: 'frog', label: 'Frog', bg: '#FFF2B3', art: () => `
    <circle cx="68" cy="68" r="24" fill="#5CC46A"/><circle cx="132" cy="68" r="24" fill="#5CC46A"/>
    <circle cx="68" cy="68" r="15" fill="#fff"/><circle cx="132" cy="68" r="15" fill="#fff"/><circle cx="70" cy="70" r="8" fill="#2b2233"/><circle cx="130" cy="70" r="8" fill="#2b2233"/>
    <ellipse cx="100" cy="118" rx="68" ry="50" fill="#5CC46A"/>
    <path d="M62 124 Q100 160 138 124" fill="none" stroke="#2b2233" stroke-width="5" stroke-linecap="round"/>
    <circle cx="90" cy="104" r="3" fill="#3a9a49"/><circle cx="110" cy="104" r="3" fill="#3a9a49"/>${cheeks(130, 50)}` },
  { key: 'penguin', label: 'Penguin', bg: '#C3D9EE', art: () => `
    <ellipse cx="100" cy="112" rx="58" ry="66" fill="#2f3e63"/>
    <ellipse cx="100" cy="126" rx="38" ry="46" fill="#fff"/>
    <ellipse cx="46" cy="124" rx="12" ry="26" fill="#2f3e63" transform="rotate(14 46 124)"/><ellipse cx="154" cy="124" rx="12" ry="26" fill="#2f3e63" transform="rotate(-14 154 124)"/>
    ${eyes(92, 24, 6)}
    <polygon points="86,106 114,106 100,122" fill="#FFA726"/>${cheeks(106, 42)}
    <ellipse cx="82" cy="176" rx="16" ry="7" fill="#FFA726"/><ellipse cx="118" cy="176" rx="16" ry="7" fill="#FFA726"/>` },
  { key: 'owl', label: 'Owl', bg: '#E4D4FA', art: () => `
    <polygon points="50,76 56,30 92,58" fill="#8a5a3a"/><polygon points="150,76 144,30 108,58" fill="#8a5a3a"/>
    <ellipse cx="100" cy="116" rx="62" ry="64" fill="#A87450"/>
    <ellipse cx="100" cy="140" rx="36" ry="34" fill="#E9C9A0"/>
    <circle cx="74" cy="98" r="24" fill="#fff"/><circle cx="126" cy="98" r="24" fill="#fff"/>
    <circle cx="74" cy="98" r="24" fill="none" stroke="#6d4228" stroke-width="5"/><circle cx="126" cy="98" r="24" fill="none" stroke="#6d4228" stroke-width="5"/>
    <circle cx="76" cy="100" r="11" fill="#2b2233"/><circle cx="124" cy="100" r="11" fill="#2b2233"/><circle cx="79" cy="96" r="4" fill="#fff"/><circle cx="127" cy="96" r="4" fill="#fff"/>
    <polygon points="90,118 110,118 100,136" fill="#FFB300"/>` },
  { key: 'dog', label: 'Puppy', bg: '#FFE6C7', art: () => `
    <ellipse cx="48" cy="100" rx="20" ry="40" fill="#7a4f2e" transform="rotate(14 48 100)"/><ellipse cx="152" cy="100" rx="20" ry="40" fill="#7a4f2e" transform="rotate(-14 152 100)"/>
    <circle cx="100" cy="108" r="56" fill="#D9A566"/>
    <ellipse cx="100" cy="132" rx="30" ry="24" fill="#fff"/>
    ${eyes(100, 26)}<ellipse cx="100" cy="122" rx="10" ry="7" fill="#2b2233"/>
    <path d="M100 129 v6 M88 136 Q100 144 112 136" fill="none" stroke="#2b2233" stroke-width="4" stroke-linecap="round"/>
    <path d="M94 142 Q100 160 106 142Z" fill="#ff7e9d"/>${cheeks(116, 50)}` },
  { key: 'piggy', label: 'Piggy', bg: '#FFD0E1', art: () => `
    <polygon points="56,82 52,40 90,60" fill="#F7A0BE"/><polygon points="144,82 148,40 110,60" fill="#F7A0BE"/>
    <circle cx="100" cy="112" r="58" fill="#FFB3CC"/>
    ${eyes(98, 28)}<ellipse cx="100" cy="124" rx="24" ry="18" fill="#F58BAE"/>
    <ellipse cx="91" cy="124" rx="4.5" ry="7" fill="#c2527a"/><ellipse cx="109" cy="124" rx="4.5" ry="7" fill="#c2527a"/>${smile(146, 10)}${cheeks(112, 48, '#ff6f9c')}` },
  { key: 'robot', label: 'Robo', bg: '#CBE5FF', art: () => `
    <line x1="100" y1="34" x2="100" y2="58" stroke="#6b7a90" stroke-width="5"/><circle cx="100" cy="30" r="9" fill="#ff6b81"/>
    <rect x="34" y="92" width="14" height="36" rx="6" fill="#8d9bb0"/><rect x="152" y="92" width="14" height="36" rx="6" fill="#8d9bb0"/>
    <rect x="46" y="56" width="108" height="92" rx="26" fill="#B9C6D8"/>
    <rect x="58" y="72" width="84" height="48" rx="16" fill="#243246"/>
    <circle cx="82" cy="96" r="9" fill="#5ff0ff"/><circle cx="118" cy="96" r="9" fill="#5ff0ff"/><circle cx="85" cy="93" r="3" fill="#fff"/><circle cx="121" cy="93" r="3" fill="#fff"/>
    <path d="M78 134 h44" stroke="#243246" stroke-width="5" stroke-linecap="round" stroke-dasharray="6 5"/>` },
  { key: 'ghost', label: 'Ghost', bg: '#3b3560', art: () => `
    <path d="M48 160 V96 Q48 40 100 40 Q152 40 152 96 V160 L134 146 L117 162 L100 146 L83 162 L66 146 Z" fill="#fff"/>
    ${eyes(100, 24, 8)}<ellipse cx="100" cy="124" rx="9" ry="11" fill="#2b2233"/>${cheeks(118, 42)}
    <path d="M160 52 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4Z" fill="#ffd966"/>` },
  { key: 'boy', label: 'Boy', bg: '#D7ECFF', art: () => `
    <path d="M48 190 Q48 144 100 144 Q152 144 152 190Z" fill="#4a7fd1"/>
    <rect x="90" y="128" width="20" height="22" rx="8" fill="#D9A27A"/>
    <ellipse cx="100" cy="104" rx="42" ry="46" fill="#E8B58F"/>
    <path d="M56 98 Q52 50 100 48 Q148 50 144 98 Q132 72 100 74 Q68 72 56 98Z" fill="#2b2233"/>
    ${eyes(106, 20, 6)}${smile(126, 12)}${cheeks(120, 32, '#f08a7a')}` },
  { key: 'girl', label: 'Girl', bg: '#FFE0EC', art: () => `
    <path d="M44 190 Q44 146 100 146 Q156 146 156 190Z" fill="#e0508a"/>
    <path d="M52 120 Q38 52 100 44 Q162 52 148 120 Q150 150 138 160 L62 160 Q50 150 52 120Z" fill="#5a3326"/>
    <ellipse cx="100" cy="108" rx="40" ry="44" fill="#F1C4A0"/>
    <path d="M60 94 Q70 62 100 62 Q130 62 140 94 Q118 82 100 84 Q82 82 60 94Z" fill="#5a3326"/>
    ${eyes(110, 19, 6)}${smile(128, 11)}${cheeks(122, 30)}
    <circle cx="136" cy="70" r="8" fill="#ffd93d"/><circle cx="136" cy="70" r="3.5" fill="#fff"/>` },
  { key: 'cap', label: 'Cool', bg: '#D6F5E0', art: () => `
    <path d="M48 190 Q48 144 100 144 Q152 144 152 190Z" fill="#f0a030"/>
    <rect x="90" y="128" width="20" height="22" rx="8" fill="#B77B55"/>
    <ellipse cx="100" cy="108" rx="42" ry="46" fill="#C98E66"/>
    <path d="M54 92 Q56 44 100 44 Q144 44 146 92Z" fill="#e24b4b"/><path d="M100 90 H170 Q170 100 150 100 H100Z" fill="#c43a3a"/>
    ${eyes(110, 20, 6)}${smile(128, 12)}${cheeks(122, 32, '#e07a5a')}` },
  { key: 'nerd', label: 'Smart', bg: '#F1E4FF', art: () => `
    <path d="M44 190 Q44 146 100 146 Q156 146 156 190Z" fill="#7b5bd6"/>
    <circle cx="100" cy="64" r="16" fill="#3b2a4a"/>
    <path d="M54 112 Q46 48 100 46 Q154 48 146 112 Q140 88 100 84 Q60 88 54 112Z" fill="#3b2a4a"/>
    <ellipse cx="100" cy="108" rx="40" ry="44" fill="#F5CBA7"/>
    <path d="M62 94 Q72 66 100 66 Q128 66 138 94 Q116 82 100 84 Q84 82 62 94Z" fill="#3b2a4a"/>
    <circle cx="80" cy="108" r="14" fill="#fff" fill-opacity=".6" stroke="#2b2233" stroke-width="4"/><circle cx="120" cy="108" r="14" fill="#fff" fill-opacity=".6" stroke="#2b2233" stroke-width="4"/><path d="M94 108 h12" stroke="#2b2233" stroke-width="4"/>
    ${eye(80, 108, 5)}${eye(120, 108, 5)}${smile(130, 11)}${cheeks(124, 38)}` },
];

export const avatarSvg = (key, size = 512) => {
  const a = AVATARS.find((x) => x.key === key) || AVATARS[0];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 200 200"><rect width="200" height="200" fill="${a.bg}"/>${a.art()}</svg>`;
};

// small preview used in the picker grid
export function AvatarArt({ k, size = 72, round = true }) {
  return <span aria-hidden="true" style={{ display: 'inline-block', width: size, height: size, borderRadius: round ? '50%' : 20, overflow: 'hidden', lineHeight: 0 }}
    dangerouslySetInnerHTML={{ __html: avatarSvg(k, size) }} />;
}

// SVG -> PNG file, ready for FormData
export const avatarFile = (key) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(new Blob([avatarSvg(key, 512)], { type: 'image/svg+xml' }));
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    c.getContext('2d').drawImage(img, 0, 0, 512, 512);
    URL.revokeObjectURL(url);
    c.toBlob((b) => (b ? resolve(new File([b], `avatar_${key}.png`, { type: 'image/png' })) : reject(new Error('Could not make the picture'))), 'image/png');
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not make the picture')); };
  img.src = url;
});
