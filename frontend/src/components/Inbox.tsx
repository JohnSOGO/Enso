// SPEC §8.8a — Lists → 📥 Inbox: what Send to Enso saved (§7H), mine only, newest first. One card each: when, the 🔗 link
// (opens in a new tab), the text, the photo (tap for full size); 📋 Copy (the link, else the text) and ✓ Clear (no ask,
// ⚑ Q324). Set up (InboxSetup) folded at the bottom, open while I have no key. Shows the server's kind; never derives it.
import { useEffect, useState } from 'react';
import { apiUrl, del, errorText, get } from '../api';
import { useApp } from '../state';
import { InboxSetup, copyText } from './InboxSetup';
import type { InboxItem } from '../../../src/shared/inbox';
import s from './Inbox.module.css';

/** The link as host + path, for a short line. */
const shortLink = (u: string) => { try { const x = new URL(u); return `${x.host}${x.pathname === '/' ? '' : x.pathname}`; } catch { return u; } };

export function Inbox({ onChanged }: { onChanged?: () => void }) {
  const { version, tz, clock } = useApp();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = () => get<{ items: InboxItem[] }>('/inbox').then((d) => { setItems(d.items); setError(null); }).catch((e) => setError(errorText(e)));
  useEffect(() => { load(); }, [version]);

  async function clear(i: InboxItem) {
    setItems((all) => all && all.filter((x) => x.id !== i.id));
    try { await del(`/inbox/${i.id}`); } catch (e) { setError(errorText(e)); }
    load(); onChanged?.();
  }

  const when = (iso: string) => {
    const at = new Date(iso);
    const recent = Date.now() - at.getTime() < 6 * 86_400_000;
    const day = at.toLocaleDateString(undefined, recent ? { weekday: 'short', timeZone: tz } : { month: 'short', day: 'numeric', timeZone: tz });
    const hm = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
    return `${day} ${clock(hm)}`;
  };

  return (
    <>
      {error && <div role="alert" className="alert-error">{error}</div>}
      {items === null && !error && <p className="muted">Loading…</p>}
      {items?.length === 0 && <p className="muted">Nothing here yet. Share a link, text or photo from your iPhone with Send to Enso.</p>}
      <ul className={s.list}>
        {items?.map((i) => {
          const copy = i.url ?? i.text;
          return (
            <li key={i.id} className={s.card}>
              <span className={`muted ${s.when}`}>{when(i.createdAt)}</span>
              {i.url && <a className={s.link} href={i.url} target="_blank" rel="noopener noreferrer">🔗 {shortLink(i.url)}</a>}
              {i.text && <p className={s.text}>{i.text}</p>}
              {i.hasPhoto && (
                <a href={apiUrl(`/inbox/${i.id}/photo`)} target="_blank" rel="noopener noreferrer">
                  <img className={s.photo} src={apiUrl(`/inbox/${i.id}/photo`)} alt="Shared photo" loading="lazy" />
                </a>
              )}
              <div className="row">
                {copy && <button onClick={() => { copyText(copy); setCopied(i.id); }}>{copied === i.id ? '✓ Copied' : '📋 Copy'}</button>}
                <button onClick={() => clear(i)}>✓ Clear</button>
              </div>
            </li>
          );
        })}
      </ul>
      <InboxSetup />
    </>
  );
}
