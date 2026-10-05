// SPEC §8.14 — the show form (modal): title, Movie / Show, year, Rotten Tomatoes critics / audience, how to watch
// (✕ removes a line), Checked, 🔄 Check again (POST /shows/look-up; the answer goes into the form, saved only on
// Save), summary, link (↗), note; Watched / Want to see it again; Save / Cancel / Delete. Rules are the server's (§7F).
import { useState } from 'react';
import { Modal } from './Modal';
import { Grow } from './Grow';
import { del, errorText, patch, post } from '../api';
import {
  SHOW_NOTE_MAX, SHOW_TITLE_MAX, SHOW_URL_MAX, SUMMARY_MAX, YEAR_MAX, type Show, type ShowReading, type WatchOption,
} from '../../../src/shared/shows';
import { webLink } from '../../../src/shared/things';
import type { ShowKind, ShowStatus, WatchHow } from '../../../src/shared/vocab';
import s from './Shows.module.css';

/** §8.14 — each way to watch as the list and form show it. */
export const WATCH_GLYPH: Record<WatchHow, string> = { theater: '🎟️', stream: '📺', tv: '📡', rent: '💵', buy: '💵' };
/** "In theaters" for a theater (the row names no single theater), else the service, channel or store. */
export const rowWatchText = (w: WatchOption) => (w.how === 'theater' ? 'In theaters' : w.where);
const HOW_WORD: Record<WatchHow, string> = { theater: 'Theater', stream: 'Stream', tv: 'TV', rent: 'Rent', buy: 'Buy' };

/** "Oct 4" in the device's zone. */
export const dayText = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const pct = (n: number | null) => (n === null ? '' : String(n));
const formOf = (v: Show | ShowReading | null) => ({
  title: v?.title ?? '', kind: v?.kind ?? null as ShowKind | null, year: v?.year ?? '',
  rtCritics: pct(v?.rtCritics ?? null), rtAudience: pct(v?.rtAudience ?? null), watch: v?.watch ?? [] as WatchOption[],
  checkedAt: v?.checkedAt ?? null as string | null, summary: v?.summary ?? '', url: v?.url ?? '', note: v?.note ?? '',
});
type Form = ReturnType<typeof formOf>;

interface Props {
  show: Show | null;
  /** A new show's look-up, filling the form (§8.14). */
  reading?: ShowReading | null;
  /** §8.14 — what was typed in the box, for a show added by hand after a look-up failed: a link or a title. */
  typed?: string;
  onClose: () => void;
  onSaved: () => void;
}

export function ShowForm({ show, reading = null, typed, onClose, onSaved }: Props) {
  const [init] = useState(() => formOf(show));
  const [f, setF] = useState<Form>(() => {
    const form = formOf(show ?? reading);
    if (typed) form[/^https?:\/\//i.test(typed) ? 'url' : 'title'] = typed;
    return form;
  });
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  const number = (v: string, field: string) => {
    if (!v.trim()) return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 100) throw new Error(`${field} must be a whole number from 0 to 100.`);
    return n;
  };

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); onSaved(); onClose(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  const persist = (status?: ShowStatus) => run(async () => {
    const b = {
      title: f.title, kind: f.kind, year: f.year.trim() || null, rtCritics: number(f.rtCritics, 'Critics %'),
      rtAudience: number(f.rtAudience, 'Audience %'), watch: f.watch, checkedAt: f.checkedAt, summary: f.summary.trim() || null,
      url: f.url.trim() || null, note: f.note.trim() || null, ...(status ? { status } : {}),
    };
    if (show) await patch(`/shows/${show.id}`, b); else await post('/shows', b);
  });

  /** §8.14 — replaces the ratings, how to watch and Checked; fills Summary only when empty. Nothing is saved. */
  async function checkAgain() {
    setChecking(true); setSaid(null); setError(null);
    try {
      const r = await post<ShowReading>('/shows/look-up', { title: f.title, year: f.year.trim() || null, kind: f.kind });
      if (!r.title) { setSaid("Couldn't tell which movie or show that is."); return; }
      setF((x) => ({
        ...x, rtCritics: pct(r.rtCritics), rtAudience: pct(r.rtAudience), watch: r.watch, checkedAt: r.checkedAt,
        summary: x.summary.trim() ? x.summary : r.summary ?? '',
      }));
      setSaid('Checked just now — Save to keep it.');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setChecking(false);
    }
  }

  const kindChip = (k: ShowKind, label: string) => (
    <label className="chip" style={{ padding: '4px 10px', minHeight: 44 }}>
      <input type="checkbox" checked={f.kind === k} onChange={(e) => set('kind', e.target.checked ? k : null)} /> {label}
    </label>
  );
  const link = webLink(f.url);

  return (
    <Modal title={show ? `Edit: ${show.title}` : 'New movie or show'} onClose={onClose} dirty={dirty} error={error}
      footer={<>
        <button className="primary" disabled={busy || checking || !f.title.trim()} onClick={() => persist()}>Save</button>
        <button onClick={onClose} disabled={busy}>Cancel</button>
      </>}>
      <fieldset disabled={busy}>
        {!show && reading && <p className="muted" style={{ marginBottom: 10 }}>Found by looking it up — check it before saving.</p>}
        <label className="field"><span>Title</span>
          <Grow oneLine value={f.title} maxLength={SHOW_TITLE_MAX} onChange={(e) => set('title', e.target.value)} autoFocus={!show && !reading} />
        </label>
        <div className="row wrap" role="group" aria-label="Movie or show">
          {kindChip('movie', 'Movie')}
          {kindChip('show', 'Show')}
          <label className="field" style={{ flex: 1, minWidth: '6rem', marginBottom: 0 }}><span>Year</span>
            <input value={f.year} maxLength={YEAR_MAX} inputMode="numeric" onChange={(e) => set('year', e.target.value)} />
          </label>
        </div>
        <div className="field" role="group" aria-label="Rotten Tomatoes">
          <span className="muted" style={{ fontSize: '.8rem' }}>Rotten Tomatoes</span>
          <div className="row">
            <label className="field" style={{ flex: 1, marginBottom: 0 }}><span>🍅 Critics %</span>
              <input type="number" min={0} max={100} inputMode="numeric" value={f.rtCritics} onChange={(e) => set('rtCritics', e.target.value)} />
            </label>
            <label className="field" style={{ flex: 1, marginBottom: 0 }}><span>🍿 Audience %</span>
              <input type="number" min={0} max={100} inputMode="numeric" value={f.rtAudience} onChange={(e) => set('rtAudience', e.target.value)} />
            </label>
          </div>
        </div>
        <div className="field" role="group" aria-label="How to watch">
          <span className="muted" style={{ fontSize: '.8rem' }}>How to watch</span>
          {f.watch.length === 0 ? <p className="muted">Nowhere found yet.</p> : (
            <ul className={s.ways}>
              {f.watch.map((w, i) => (
                <li key={`${w.how}|${w.where}`} className={s.way}>
                  <span aria-hidden>{WATCH_GLYPH[w.how]}</span>
                  <span className={s.wayText}>{HOW_WORD[w.how]} · {w.where}{w.note && <span className="muted"> — {w.note}</span>}</span>
                  <button type="button" className={`plain ${s.remove}`} aria-label={`Remove ${w.where}`} title={`Remove ${w.where}`}
                    onClick={() => set('watch', f.watch.filter((_, j) => j !== i))}>✕</button>
                </li>
              ))}
            </ul>
          )}
          <p className="muted" style={{ fontSize: '.8rem' }}>{f.checkedAt ? `Checked ${dayText(f.checkedAt)}` : 'Not looked up'}</p>
          {f.title.trim() && (
            <button type="button" style={{ width: '100%', minHeight: 44, marginTop: 6 }} disabled={checking} onClick={checkAgain}>
              {checking ? 'Looking it up…' : '🔄 Check again'}
            </button>
          )}
          {said && <p className="muted" role="status" style={{ marginTop: 4 }}>{said}</p>}
        </div>
        <label className="field"><span>Summary</span>
          <Grow value={f.summary} maxLength={SUMMARY_MAX} onChange={(e) => set('summary', e.target.value)} />
        </label>
        <label className="field"><span>Link</span>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <Grow oneLine inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="https://…" value={f.url}
                maxLength={SHOW_URL_MAX} onChange={(e) => set('url', e.target.value)} />
            </div>
            {link && <a className="go" href={link} target="_blank" rel="noopener noreferrer" aria-label="Open link" title="Open link">↗</a>}
          </div>
        </label>
        <label className="field"><span>Note</span>
          <Grow value={f.note} maxLength={SHOW_NOTE_MAX} onChange={(e) => set('note', e.target.value)} />
        </label>
      </fieldset>
      {show && (
        <div className="row wrap" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          {show.status === 'want'
            ? <button disabled={busy || !f.title.trim()} onClick={() => persist('watched')}>Watched</button>
            : <button disabled={busy || !f.title.trim()} onClick={() => persist('want')}>Want to see it again</button>}
          <button className="danger" disabled={busy} onClick={() => { if (confirm(`Delete “${show.title}”?`)) run(() => del(`/shows/${show.id}`)); }}>Delete</button>
        </div>
      )}
    </Modal>
  );
}
