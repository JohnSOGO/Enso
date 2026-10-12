// SPEC §8.6 — Settings → 🙂 Me: display name and color → PATCH /me; the 🎯 Point at it switch for this device, founder only (§8.16).
import { useState } from 'react';
import { patch } from '../api';
import { useApp, useIsFounder } from '../state';
import { MEMBER_PALETTE } from '../../../src/shared/vocab';
import { useAction } from './useAction';
import { setPointAtOn, usePointAtOn } from './PointAtButton';

export function SettingsMe() {
  const { me, refresh } = useApp();
  const [name, setName] = useState(me.displayName);
  const { run, busy, errorEl } = useAction();
  const pointAt = usePointAtOn();
  const founder = useIsFounder();
  const save = (body: object) => run(async () => { await patch('/me', body); refresh(); });

  return (
    <>
      {errorEl}
      <label className="field"><span>Display name</span>
        <div className="row"><input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          <button disabled={busy || name === me.displayName || !name.trim()} onClick={() => save({ displayName: name })}>Save</button></div>
      </label>
      <div className="field"><span className="muted" style={{ fontSize: '.8rem' }}>My color</span>
        <div className="row wrap" style={{ marginTop: 4 }}>
          {MEMBER_PALETTE.map((c) => (
            <button key={c} aria-label={`Color ${c}`} title={c} disabled={busy} onClick={() => save({ color: c })}
              style={{ background: c, width: 34, height: 34, minHeight: 0, padding: 0, borderRadius: 99, outline: me.color === c ? '3px solid var(--text)' : 'none' }} />
          ))}
        </div>
      </div>
      {founder && <label className="row" style={{ marginTop: 12 }}>
        <input type="checkbox" checked={pointAt} onChange={(e) => setPointAtOn(e.target.checked)} />
        <span>🎯 Point at it (this device): tap ◎ bottom left, then tap anything to copy where it is for Claude; tap ◎ again to stop</span>
      </label>}
    </>
  );
}
