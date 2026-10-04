// SPEC §8.11 — the thing form (modal): photo, title, From / To, place, address, phone, cost, link, note,
// reminders and channels; every text field but phone grows to fit its text; Plan it / Done / Let it go / Put back by status; Save / Cancel / Delete. A photo reading
// fills only empty fields, each marked "from photo — check it". The photo (new, replaced or removed)
// goes to the server on Save, after the thing itself. Rules and validation are the server's (§7C).
import { useEffect, useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from 'react';
import { Modal } from './Modal';
import { ChannelChecks } from './AlertFields';
import { ThingPhoto, photoSrc } from './ThingPhoto';
import { ThingPlan } from './ThingPlan';
import { del, errorText, get, patch, post, upload } from '../api';
import { useApp } from '../state';
import type { Channel, ThingStatus } from '../../../src/shared/vocab';
import {
  ADDRESS_MAX, COST_MAX, NOTE_MAX, PHONE_MAX, PLACE_MAX, THING_REMIND_TIME, TITLE_MAX, URL_MAX, type PhotoReading, type Thing,
} from '../../../src/shared/things';

/** "Oct 10", or "Sat Oct 12" with the weekday — a local YYYY-MM-DD date as Things to do shows it. */
export const shortDate = (d: string, weekday = false) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { ...(weekday ? { weekday: 'short' } : {}), month: 'short', day: 'numeric', timeZone: 'UTC' });

type Field = 'title' | 'windowStart' | 'windowEnd' | 'place' | 'address' | 'phone' | 'cost' | 'url' | 'note';
/** Which form field each part of a photo reading may fill (§7C.4). */
const FROM_READING: [keyof PhotoReading, Field][] = [
  ['title', 'title'], ['startDate', 'windowStart'], ['endDate', 'windowEnd'], ['place', 'place'],
  ['address', 'address'], ['phone', 'phone'], ['cost', 'cost'], ['url', 'url'], ['note', 'note'],
];
const chip = { padding: '4px 10px', minHeight: 44 } as const;

/**
 * §8.11 — a textarea that grows to fit its text, never scrolling inside: re-measured when the text changes (typed,
 * or filled by a photo reading) and when its width does (the dialog opening, the phone turning).
 */
/** A textarea that grows to fit its text (§8.11). `oneLine`: Enter does nothing and pasted line breaks become spaces (Title, Link ⚑). */
function Grow({ value, oneLine, onChange, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; oneLine?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el || !el.clientWidth) return; // not laid out yet (the dialog is still closed)
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  };
  useLayoutEffect(fit, [value]);
  useEffect(() => {
    let width = 0;
    const ro = new ResizeObserver(([e]) => { if (e.contentRect.width !== width) { width = e.contentRect.width; fit(); } });
    ro.observe(ref.current!);
    return () => ro.disconnect();
  }, []);
  return <textarea ref={ref} rows={1} value={value} style={{ overflow: 'hidden', resize: 'none' }} {...rest}
    onKeyDown={oneLine ? (e) => { if (e.key === 'Enter') e.preventDefault(); } : rest.onKeyDown}
    onChange={(e) => { if (oneLine && /[\r\n]/.test(e.target.value)) e.target.value = e.target.value.replace(/\s*[\r\n]+\s*/g, ' '); onChange?.(e); }} />;
}

const formOf = (t: Thing | null) => ({
  title: t?.title ?? '', windowStart: t?.windowStart ?? '', windowEnd: t?.windowEnd ?? '',
  place: t?.place ?? '', address: t?.address ?? '', phone: t?.phone ?? '', cost: t?.cost ?? '', url: t?.url ?? '', note: t?.note ?? '',
  remindStart: t?.remindStart ?? false, remindOnSet: !!t?.remindOn, remindOn: t?.remindOn ?? '',
  push: t ? t.channels.includes('push') : true, house: t ? t.channels.includes('house') : false,
});
type Form = ReturnType<typeof formOf>;

export function ThingForm({ thing, onClose }: { thing: Thing | null; onClose: () => void }) {
  const { refresh } = useApp();
  const [init, setInit] = useState(() => formOf(thing));
  const [f, setF] = useState<Form>(init);
  const latest = useRef(f);
  latest.current = f;
  /** The thing as saved — a new one becomes saved when its POST succeeds, even if the photo then fails. */
  const [saved, setSaved] = useState(thing);
  const [fromPhoto, setFromPhoto] = useState<Field[]>([]);
  const [pending, setPending] = useState<Blob | null>(null);
  const [removed, setRemoved] = useState(false);
  const [planning, setPlanning] = useState<Thing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(init) || !!pending || removed;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setFromPhoto((p) => p.filter((x) => x !== k)); // edited by hand: no longer "from photo"
  };

  function fill(r: PhotoReading) {
    const cur = latest.current;
    const filled = FROM_READING.filter(([from, to]) => r[from] && !cur[to].trim());
    if (filled.length) {
      setF((x) => ({ ...x, ...Object.fromEntries(filled.map(([from, to]) => [to, r[from]])) }));
      setFromPhoto((p) => [...p, ...filled.map(([, to]) => to)]);
    }
    return filled.length;
  }

  function body() {
    const channels: Channel[] = [...(f.push ? ['push' as const] : []), ...(f.house ? ['house' as const] : [])];
    const remindStart = f.remindStart && !!f.windowStart;
    if (f.remindOnSet && !f.remindOn) throw new Error('Pick the date for the reminder.');
    if ((remindStart || f.remindOnSet) && !channels.length) throw new Error('Pick at least one way to be reminded (Phone or House).');
    const text = (v: string) => v.trim() || null;
    return {
      title: f.title, windowStart: f.windowStart || null, windowEnd: f.windowEnd || null,
      place: text(f.place), address: text(f.address), phone: text(f.phone), cost: text(f.cost), url: text(f.url), note: text(f.note),
      remindStart, remindOn: f.remindOnSet ? f.remindOn : null, channels,
    };
  }

  /** Saves the fields (and a status change), then the photo. */
  async function persist(status?: ThingStatus): Promise<Thing> {
    const b = { ...body(), ...(status ? { status } : {}) };
    const t = saved ? await patch<Thing>(`/things/${saved.id}`, b) : await post<Thing>('/things', b);
    setSaved(t);
    setInit(f);
    if (!pending && !removed) return t;
    try {
      if (pending) await upload('PUT', `/things/${t.id}/photo`, pending);
      else await del(`/things/${t.id}/photo`);
      setPending(null); setRemoved(false);
    } catch (e) {
      throw new Error(`Saved, but the photo didn't save: ${errorText(e)} Tap Save to try the photo again.`);
    }
    const fresh = await get<Thing>(`/things/${t.id}`); // hasPhoto and updatedAt after the photo change
    setSaved(fresh);
    return fresh;
  }

  async function run(fn: () => Promise<unknown>, close = true) {
    setBusy(true); setError(null);
    try { await fn(); if (close) onClose(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); refresh(); }
  }
  const planIt = () => run(async () => setPlanning(dirty || !saved ? await persist() : saved), false);

  const mark = (k: Field) => fromPhoto.includes(k) && <em className="muted"> · from photo — check it</em>;
  const status = saved?.status;
  const savedSrc = saved?.hasPhoto && !removed ? photoSrc(saved) : null;

  return (
    <>
      <Modal title={thing ? `Edit: ${thing.title}` : 'New thing to do'} onClose={onClose} dirty={dirty} error={error}
        footer={<>
          <button className="primary" disabled={busy || !f.title.trim()} onClick={() => run(() => persist())}>Save</button>
          <button onClick={onClose} disabled={busy}>Cancel</button>
        </>}>
        <fieldset disabled={busy}>
          {status === 'planned' && saved?.plannedDate && (
            <p className="muted" style={{ marginBottom: 10 }}>📅 Planned for {shortDate(saved.plannedDate, true)} — it's on the calendar.</p>
          )}
          <ThingPhoto savedSrc={savedSrc} pending={pending} onReading={fill}
            onPick={(p) => { setPending(p); setRemoved(false); }}
            onRemove={() => { setPending(null); setRemoved(!!saved?.hasPhoto); }} />
          <label className="field"><span>Title{mark('title')}</span>
            <Grow oneLine value={f.title} maxLength={TITLE_MAX} onChange={(e) => set('title', e.target.value)} autoFocus={!thing} />
          </label>
          <div className="row">
            <label className="field" style={{ flex: 1 }}><span>From (optional){mark('windowStart')}</span>
              <input type="date" value={f.windowStart} onChange={(e) => set('windowStart', e.target.value)} />
            </label>
            <label className="field" style={{ flex: 1 }}><span>To (optional){mark('windowEnd')}</span>
              <input type="date" value={f.windowEnd} min={f.windowStart || undefined} onChange={(e) => set('windowEnd', e.target.value)} />
            </label>
          </div>
          <label className="field"><span>Place{mark('place')}</span>
            <Grow value={f.place} maxLength={PLACE_MAX} onChange={(e) => set('place', e.target.value)} />
          </label>
          <label className="field"><span>Address{mark('address')}</span>
            <Grow value={f.address} maxLength={ADDRESS_MAX} autoComplete="off" onChange={(e) => set('address', e.target.value)} />
          </label>
          <label className="field"><span>Phone{mark('phone')}</span>
            <input type="tel" value={f.phone} maxLength={PHONE_MAX} autoComplete="off" onChange={(e) => set('phone', e.target.value)} />
          </label>
          <label className="field"><span>Cost{mark('cost')}</span>
            <Grow value={f.cost} maxLength={COST_MAX} onChange={(e) => set('cost', e.target.value)} />
          </label>
          <label className="field"><span>Link{mark('url')}</span>
            <Grow oneLine inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="https://…" value={f.url}
              maxLength={URL_MAX} onChange={(e) => set('url', e.target.value)} />
          </label>
          <label className="field"><span>Note{mark('note')}</span>
            <Grow value={f.note} maxLength={NOTE_MAX} onChange={(e) => set('note', e.target.value)} />
          </label>

          <div className="field" role="group" aria-label="Reminders">
            <span className="muted" style={{ fontSize: '.8rem' }}>Reminders (ring at {THING_REMIND_TIME})</span>
            <div className="row wrap" style={{ marginTop: 4 }}>
              <label className="chip" style={chip}>
                <input type="checkbox" checked={f.remindStart && !!f.windowStart} disabled={!f.windowStart}
                  onChange={(e) => set('remindStart', e.target.checked)} /> When it starts
              </label>
            </div>
            <div className="row" style={{ marginTop: 6 }}>
              <label className="chip" style={chip}>
                <input type="checkbox" checked={f.remindOnSet} onChange={(e) => set('remindOnSet', e.target.checked)} /> On
              </label>
              <input type="date" aria-label="Reminder date" value={f.remindOn} disabled={!f.remindOnSet}
                onChange={(e) => set('remindOn', e.target.value)} />
            </div>
          </div>
          <ChannelChecks push={f.push} house={f.house} onChange={(c) => setF({ ...f, ...c })} />
        </fieldset>
        {saved && (
          <div className="row wrap" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            {status === 'idea' && <button disabled={busy || !f.title.trim()} onClick={planIt}>Plan it</button>}
            {(status === 'idea' || status === 'planned') && <>
              <button disabled={busy || !f.title.trim()} onClick={() => run(() => persist('done'))}>Done</button>
              <button disabled={busy || !f.title.trim()} onClick={() => run(() => persist('dropped'))}>Let it go</button>
            </>}
            {(status === 'done' || status === 'dropped') && (
              <button disabled={busy || !f.title.trim()} onClick={() => run(() => persist('idea'))}>Put back</button>
            )}
            <button className="danger" disabled={busy} onClick={() => { if (confirm(`Delete “${saved.title}”?`)) run(() => del(`/things/${saved.id}`)); }}>Delete</button>
          </div>
        )}
      </Modal>
      {planning && <ThingPlan thing={planning} onClose={() => setPlanning(null)} onPlanned={() => { setPlanning(null); refresh(); onClose(); }} />}
    </>
  );
}
