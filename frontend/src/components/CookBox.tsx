// SPEC §8.5, §7D.8 — the cooking-timer box: create one (Start) or edit one (Save). Holds only its draft.
import { useState } from 'react';
import { Modal } from './Modal';
import { AlertWhenDone, Pick } from './Machines';
import { errorText, patch, post } from '../api';
import { useApp } from '../state';
import { COOK_LABEL, COOK_MINUTES_MAX, COOK_NAME_MAX } from '../../../src/shared/cooking';
import { COOK_KIND, type CookKind } from '../../../src/shared/vocab';
import type { Cooking } from './Cooking';
import s from './CookBox.module.css';

export const COOK_GLYPH: Record<CookKind, string> = { air_fryer: '🍟', stove: '🍳', oven: '🔥', microwave: '⚡', other: '⏲️' }; // ⚑ Q239
const CHIPS = [1, 3, 5, 10, 15, 20, 30, 45, 60] as const;

/** `editing` null = ＋ Cooking timer. */
export function CookBox({ editing, onClose }: { editing: Cooking | null; onClose: () => void }) {
  const { me, refresh } = useApp();
  const [kind, setKind] = useState<CookKind>(editing?.kind ?? 'air_fryer');
  const [name, setName] = useState(editing?.name ?? '');
  const [alertTo, setAlertTo] = useState<string | null>(editing ? editing.alertId : me.id);
  // §8.5: a chip or the custom box, never both — a value that matches a chip opens on that chip.
  const [chip, setChip] = useState<number | null>(editing && (CHIPS as readonly number[]).includes(editing.minutes) ? editing.minutes : null);
  const [custom, setCustom] = useState(editing && chip === null ? String(editing.minutes) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = chip ?? Number(custom);
  const ok = Number.isInteger(n) && n >= 1 && n <= COOK_MINUTES_MAX;

  async function go() {
    setBusy(true); setError(null);
    const body = { kind, name: name.trim() || null, minutes: n, alertId: alertTo };
    try {
      await (editing ? patch(`/cooking/${editing.id}`, body) : post('/cooking', body));
      refresh(); onClose();
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <Modal title={editing ? `Edit ${editing.label}` : '🍳 Cooking timer'} onClose={onClose} error={error}
      footer={<>
        <button onClick={onClose} disabled={busy}>Cancel</button>
        <button className="primary" onClick={go} disabled={busy || !ok}>{editing ? 'Save' : 'Start'}</button>
      </>}>
      <fieldset disabled={busy}>
        <div className="field" role="group" aria-label="What?">
          <span className="muted" style={{ fontSize: '.8rem' }}>What?</span>
          <div className="row wrap" style={{ marginTop: 4 }}>
            {COOK_KIND.map((k) => <Pick key={k} on={kind === k} label={`${COOK_GLYPH[k]} ${COOK_LABEL[k]}`} onClick={() => setKind(k)} />)}
          </div>
        </div>
        <label className="field">
          <span className="muted" style={{ fontSize: '.8rem' }}>Name (optional)</span>
          <input value={name} maxLength={COOK_NAME_MAX} placeholder="Oven 2" style={{ fontSize: 16 }} onChange={(e) => setName(e.target.value)} />
        </label>
        <AlertWhenDone alertTo={alertTo} onPick={setAlertTo} />
        <div className="field" role="group" aria-label="How long?">
          <span className="muted" style={{ fontSize: '.8rem' }}>How long? (minutes)</span>
          <div className="row wrap" style={{ marginTop: 4 }}>
            {CHIPS.map((c) => <Pick key={c} on={chip === c} label={String(c)} onClick={() => { setChip(c); setCustom(''); }} />)}
            <input type="number" inputMode="numeric" min={1} max={COOK_MINUTES_MAX} value={custom} placeholder="custom" aria-label="Custom minutes"
              className={s.custom} onChange={(e) => { setCustom(e.target.value); setChip(null); }} />
          </div>
        </div>
      </fieldset>
    </Modal>
  );
}
