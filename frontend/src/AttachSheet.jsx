import React from 'react';
import { createPortal } from 'react-dom';
import { useBackClose } from './backClose';
import { themeVars } from './theme';

// The "+" menu as a bottom sheet of coloured tiles, grouped, instead of one long text list.
// items: [{ group, label, icon, hue, onClick, on? }]
export default function AttachSheet({ T, items, onClose }) {
  useBackClose(true, onClose);
  const groups = [];
  items.forEach((it) => {
    let g = groups.find((x) => x.name === it.group);
    if (!g) { g = { name: it.group, items: [] }; groups.push(g); }
    g.items.push(it);
  });
  return createPortal(
    <div className="as-root" style={themeVars ? themeVars(T) : undefined} role="dialog" aria-label="Attach">
      <div className="as-scrim" onClick={onClose} />
      <div className="as-panel">
        <div className="as-grab" />
        <div className="as-scroll hide-scroll">
          {groups.map((g) => (
            <section key={g.name}>
              <h3 className="as-h">{g.name}</h3>
              <div className="as-grid">
                {g.items.map((it) => (
                  <button type="button" key={it.label} className={`as-tile${it.on ? ' on' : ''}`} onClick={it.onClick}>
                    <span className="as-ic" style={{ '--h': it.hue }}>{it.icon}</span>
                    <span className="as-l">{it.label}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
