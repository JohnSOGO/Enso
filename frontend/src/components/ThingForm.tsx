// SPEC §8.11 — the thing form (modal): photo, title, From / To, place, address, phone, cost, link, note,
// reminders and channels; ↗ / 🗺️ / 📞 beside Link / Address / Phone open them; every text field but phone grows to fit its text; Plan it / Done / Let it go / Put back by status; Save / Cancel / Delete. A photo or link
// reading (ThingPhoto / ThingLinkFill) fills only empty fields, each marked "from photo" / "from link — check it". The photo (new, replaced or removed)
// goes to the server on Save, after the thing itself. Rules and validation are the server's (§7C).
import { useRef, useState, type ReactNode } from 'react';
import { Modal } from './Modal';
import { Grow } from './Grow';
import { ChannelChecks } from './AlertFields';
import { ThingPhoto, photoSrc } from './ThingPhoto';
import { ThingPlan } from './ThingPlan';
import { ThingLinkFill } from './ThingLinkFill';
import { del, errorText, get, patch, post, upload } from '../api';
import { useApp } from '../state';
import type { Channel, ThingStatus } from '../../../src/shared/vocab';
import {
  ADDRESS_MAX, COST_MAX, NOTE_MAX, PHONE_MAX, PLACE_MAX, THING_REMIND_TIME, TITLE_MAX, URL_MAX, webLink, type PhotoReading, type Thing,
} from '../../../src/shared/things';

/** "Oct 10", or "Sat Oct 12" with the weekday — a local YYYY-MM-DD date as Things to do shows it. */
export const shortDate = (d: string, weekday = false) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { ...(weekday ? { weekday: 'short' } : {}), month: 'short', day: 'numeric', timeZone: 'UTC' });

type Field = 'title' | 'windowStart' | 'windowEnd' | 'place' | 'address' | 'phone' | 'cost' | 'url' | 'note';
/** Which form field each part of a photo or link reading may fill (§7C.4, §7C.4b). */
const FROM_READING: [keyof PhotoReading, Field][] = [
  ['title', 'title'], ['startDate', 'windowStart'], ['endDate', 'windowEnd'], ['place', 'place'],
  ['address', 'address'], ['phone', 'phone'], ['cost', 'cost'], ['url', 'url'], ['note', 'note'],
];
const chip = { padding: '4px 10px', minHeight: 44 } as const;

const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
/** §8.11 — the address in the maps app: Apple Maps on iPhone/iPad, Google Maps elsewhere ⚑. */
const mapsHref = (a: string) => a.trim()
  ? (IOS ? 'https://maps.apple.com/?q=' : 'https://www.google.com/maps/search/?api=1&query=') + encodeURIComponent(a.trim().replace(/\s+/g, ' '))
  : null;
/** §8.11 — `tel:` with digits and a leading + only; none under 3 digits. */
const telHref = (p: string) => {
  const digits = p.replace(/\D/g, '');
  return digits.length >= 3 ? `tel:${p.trim().startsWith('+') ? '+' : ''}${digits}` : null;
};

/** §8.11 — a field with its open button (↗ / 🗺️ / 📞) to the right ⚑, shown only when `href` is usable. */
function WithGo({ href, icon, label, children }: { href: string | null; icon: string; label: string; children: ReactNode }) {
  return (
    <div className="row" style={{ alignItems: 'flex-start' }}>
      <div style={{ flex: 1 }}>{children}</div>
      {href && <a className="go" href={href} target={href.startsWith('tel:') ? undefined : '_blank'} rel="noopener noreferrer"
        aria-label={label} title={label}>{icon}</a>}
    </div>
  );
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
  /** Fields a reading filled, and from what; editing one by hand clears its mark. */
  const [filledFrom, setFilledFrom] = useState<Partial<Record<Field, 'photo' | 'link'>>>({});
  const [pending, setPending] = useState<Blob | null>(null);
  const [removed, setRemoved] = useState(false);
  const [planning, setPlanning] = useState<Thing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(init) || !!pending || removed;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setFilledFrom((p) => { const { [k as Field]: _, ...rest } = p; return rest; }); // edited by hand: no longer "from photo/link"
  };

  function fill(r: PhotoReading, source: 'photo' | 'link') {
    const cur = latest.current;
    const filled = FROM_READING.filter(([from, to]) => r[from] && !cur[to].trim());
    if (filled.length) {
      setF((x) => ({ ...x, ...Object.fromEntries(filled.map(([from, to]) => [to, r[from]])) }));
      setFilledFrom((p) => ({ ...p, ...Object.fromEntries(filled.map(([, to]) => [to, source])) }));
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

  const mark = (k: Field) => filledFrom[k] && <em className="muted"> · from {filledFrom[k]} — check it</em>;
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
          <ThingPhoto savedSrc={savedSrc} pending={pending} onReading={(r) => fill(r, 'photo')}
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
            <WithGo href={mapsHref(f.address)} icon="🗺️" label="Open in maps">
              <Grow value={f.address} maxLength={ADDRESS_MAX} autoComplete="off" onChange={(e) => set('address', e.target.value)} />
            </WithGo>
          </label>
          <label className="field"><span>Phone{mark('phone')}</span>
            <WithGo href={telHref(f.phone)} icon="📞" label="Call">
              <input type="tel" value={f.phone} maxLength={PHONE_MAX} autoComplete="off" onChange={(e) => set('phone', e.target.value)} />
            </WithGo>
          </label>
          <label className="field"><span>Cost{mark('cost')}</span>
            <Grow value={f.cost} maxLength={COST_MAX} onChange={(e) => set('cost', e.target.value)} />
          </label>
          <label className="field"><span>Link{mark('url')}</span>
            <WithGo href={webLink(f.url)} icon="↗" label="Open link">
              <Grow oneLine inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="https://…" value={f.url}
                maxLength={URL_MAX} onChange={(e) => set('url', e.target.value)} />
            </WithGo>
          </label>
          <ThingLinkFill url={f.url} onReading={(r) => fill(r, 'link')} />
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
