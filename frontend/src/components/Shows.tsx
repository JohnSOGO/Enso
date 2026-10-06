// SPEC §8.14 — Lists → Movies & shows: the box (a title or a link) with 📷 and Find → POST /shows/look-up or
// /shows/look-up-photo, busy and refusals in place; a reading opens ShowForm filled (nothing saved here). Want rows,
// newest first, then Watched collapsed. Tapping a row opens its form.
import { useEffect, useState, type FormEvent } from 'react';
import { ShowForm, WATCH_GLYPH, dayText, rowWatchText } from './ShowForm';
import { errorText, get, post, upload } from '../api';
import { useApp } from '../state';
import { shrinkPicked, usePhotoPick } from './usePhotoPick';
import { SHOW_URL_MAX, bestWatch, type Show, type ShowReading } from '../../../src/shared/shows';
import ls from './Lists.module.css';
import s from './Shows.module.css';

type Editing = { show: Show | null; reading: ShowReading | null; typed?: string };
const NOT_FOUND = "Couldn't tell which movie or show that is.";

export function Shows({ onChanged }: { onChanged?: () => void }) {
  const { version, memberById } = useApp();
  const [data, setData] = useState<{ want: Show[]; watched: Show[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** §8.14 — after a failed or empty look-up of typed text: offer to add it by hand. */
  const [manual, setManual] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const pick = usePhotoPick(([file]) => picked(file));

  const load = () => get<{ want: Show[]; watched: Show[] }>('/shows').then((d) => { setData(d); setError(null); }).catch((e) => setError(errorText(e)));
  useEffect(() => { load(); }, [version]);

  /** A look-up: a reading with a title opens the form; none, or a failure, says so under the box. */
  async function lookUp(ask: () => Promise<ShowReading>, typed: string | null) {
    setBusy(true); setSaid(null); setManual(null);
    try {
      const r = await ask();
      if (r.title) setEditing({ show: null, reading: r }); else { setSaid(NOT_FOUND); setManual(typed); }
    } catch (e) {
      setSaid(errorText(e)); setManual(typed);
    } finally {
      setBusy(false);
    }
  }

  function find(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    lookUp(() => post<ShowReading>('/shows/look-up', /^https?:\/\//i.test(t) ? { url: t } : { title: t }), t);
  }

  function picked(file: File) {
    lookUp(async () => upload<ShowReading>('POST', '/shows/look-up-photo', await shrinkPicked(file)), null);
  }

  const saved = () => { if (editing && !editing.show) setText(''); load(); onChanged?.(); };

  const row = (v: Show, watched: boolean) => {
    const best = bestWatch(v.watch);
    const who = v.watchedBy ? memberById(v.watchedBy)?.displayName ?? 'unknown member' : 'unknown member';
    return (
      <li key={v.id} className={`${ls.row} ${watched ? ls.done : ''}`}>
        <button className={`${ls.item} ${ls.main}`} onClick={() => setEditing({ show: v, reading: null })}>
          <span className={`${ls.title} ${s.text}`}>{v.title}</span>
          <span className={`muted ${s.year}`}>{v.year ?? (v.kind === 'show' ? 'show' : '')}</span>
          <span className={s.score} aria-label={v.rtCritics === null ? 'no Rotten Tomatoes score' : `Rotten Tomatoes ${v.rtCritics}%`}>
            🍅 {v.rtCritics === null ? '—' : `${v.rtCritics}%`}
          </span>
          <span className={`muted ${s.how}`}>
            {watched ? `${v.watchedAt ? dayText(v.watchedAt) : '—'} · ${who}` : best ? `${WATCH_GLYPH[best.how]} ${rowWatchText(best)}` : '—'}
          </span>
        </button>
      </li>
    );
  };

  return (
    <>
      <form className="row" onSubmit={find}>
        <input value={text} maxLength={SHOW_URL_MAX} placeholder="A title, or paste a link…" aria-label="Movie or show"
          enterKeyHint="search" disabled={busy} onChange={(e) => { setText(e.target.value); setSaid(null); setManual(null); }} />
        {pick.input}
        <button type="button" className={s.snap} disabled={busy} aria-label="Find from a picture" title="Find from a picture"
          onClick={pick.open}>📷</button>
        <button type="submit" className="primary" disabled={busy || !text.trim()}>Find</button>
      </form>
      <p className={`muted ${s.said}`} aria-live="polite">{busy ? 'Looking it up…' : said ?? ''}</p>
      {manual && !busy && (
        <button type="button" className={s.manual} onClick={() => setEditing({ show: null, reading: null, typed: manual })}>Add it by hand</button>
      )}

      {error && <div role="alert" className="alert-error">{error}</div>}
      {data === null && !error && <p className="muted">Loading…</p>}
      {data && (
        <>
          {data.want.length === 0 && <p className="muted">Nothing on the list yet. Type a title above.</p>}
          <ul className={ls.list}>{data.want.map((v) => row(v, false))}</ul>
          {data.watched.length > 0 && (
            <details className={ls.checked}>
              <summary>Watched ({data.watched.length})</summary>
              <ul className={ls.list}>{data.watched.map((v) => row(v, true))}</ul>
            </details>
          )}
        </>
      )}
      {editing && <ShowForm show={editing.show} reading={editing.reading} typed={editing.typed} onClose={() => setEditing(null)} onSaved={saved} />}
    </>
  );
}
