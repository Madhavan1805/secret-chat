import React, { useState, useCallback } from 'react';
import { useBackClose } from './backClose';

/**
 * const [modal, ask] = useModal(T);
 *   await ask({ type: 'alert',   title: 'Hello' })                       -> true
 *   await ask({ type: 'confirm', title: 'Delete?', danger: true })       -> true | false
 *   await ask({ type: 'prompt',  title: 'PIN', inputType: 'password', maxLength: 4 }) -> string | null
 *   await ask({ type: 'choice',  title: 'Timer', choices: [{label, value}] })        -> value | null
 * Render {modal} anywhere in your JSX.
 */
export function useModal(T) {
  const [state, setState] = useState(null);
  const [value, setValue] = useState('');

  const ask = useCallback(
    (opts) => new Promise((resolve) => {
      setValue(opts.initial || '');
      setState({ type: 'alert', ...opts, resolve });
    }),
    [],
  );

  const finish = (v) => {
    const s = state;
    setState(null);
    if (s) s.resolve(v);
  };

  const cancelValue = state && (state.type === 'confirm' ? false : null);
  useBackClose(!!state, () => finish(cancelValue));        // back button = Cancel
  const accent = T?.accent || '#fcd34d';

  const modal = state ? (
    <div
      onClick={() => finish(cancelValue)}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9800, backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="text-center"
        style={{ background: T?.raised || T?.bg || '#261C33', color: T?.text || '#fff', border: `1px solid ${T?.line || accent}`, borderRadius: 28, padding: 22, boxShadow: '0 24px 60px rgba(0,0,0,.55)', fontFamily: 'var(--font-body, inherit)', width: '100%', maxWidth: 340, maxHeight: '80vh', overflowY: 'auto' }}
      >
        <h6 className="mb-3" style={{ color: T?.text, fontFamily: 'var(--font-display, inherit)', fontWeight: 700, fontSize: 18 }}>{state.title}</h6>
        {state.message && <p className="small" style={{ color: T?.sub }}>{state.message}</p>}

        {state.type === 'prompt' && (
          <input
            autoFocus
            type={state.inputType || 'text'}
            inputMode={state.inputMode !== undefined ? state.inputMode : (state.inputType === 'password' || state.inputType === 'number' ? 'numeric' : undefined)}
            maxLength={state.maxLength}
            value={value}
            placeholder={state.placeholder || ''}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') finish(value); }}
            className="form-control text-center mb-3 fs-5"
            style={{ background: T?.input || 'rgba(255,255,255,0.1)', color: T?.text || '#fff', border: `1px solid ${accent}`, letterSpacing: state.inputType === 'password' && state.maxLength ? 8 : 0 }}
          />
        )}

        {state.type === 'choice' && (
          <div className="d-flex flex-column gap-2 mb-3">
            {state.choices.map((c) => (
              <button
                key={String(c.value)}
                className="btn btn-sm"
                style={{ color: c.danger ? '#f87171' : (T?.text || '#fff'), border: `1px solid ${c.value === state.current ? accent : (T?.line || 'rgba(255,255,255,0.25)')}`, background: c.value === state.current ? (T?.card || 'rgba(255,255,255,0.12)') : 'transparent' }}
                onClick={() => finish(c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        <div className="d-flex gap-2 justify-content-center">
          {state.type !== 'alert' && (
            <button className="btn px-3" style={{ color: T?.text, border: `1px solid ${T?.line}`, borderRadius: 22 }} onClick={() => finish(cancelValue)}>Cancel</button>
          )}
          {state.type !== 'choice' && (
            <button
              className={`btn px-4 fw-bold ${state.danger ? 'btn-danger' : ''}`}
              style={state.danger ? { borderRadius: 22 } : { background: T?.mine || accent, color: T?.mineText || '#fff', borderRadius: 22, border: 0 }}
              onClick={() => finish(state.type === 'prompt' ? value : true)}
            >
              {state.okText || 'OK'}
            </button>
          )}
        </div>
      </div>
    </div>
  ) : null;

  return [modal, ask];
}
