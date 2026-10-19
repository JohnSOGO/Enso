// SPEC §8.8a, §7H.4 — 📲 Set up Send to Enso, folded under the Inbox (open while I have no key): GET /share/key, Make my key /
// Make a new key (asks first when one exists), Turn off, the key shown once with 📋 Copy, and the Shortcut steps with
// this server's address. Holds only the key just made.
import { useEffect, useState } from 'react';
import { del, get, post } from '../api';
import { useAction } from './useAction';
import s from './Inbox.module.css';

/** Copy inside the tap (phones allow the clipboard only during a gesture). */
export const copyText = (t: string) => navigator.clipboard?.writeText(t).catch(() => undefined);

export function InboxSetup() {
  const [state, setState] = useState<{ on: boolean; createdAt: string | null } | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const { run, busy, errorEl } = useAction();
  const load = () => run(async () => setState(await get('/share/key')));
  useEffect(() => { load(); }, []);

  const make = () => {
    if (state?.on && !confirm('Make a new key? The Shortcut with the old key will stop working.')) return;
    run(async () => { const r = await post<{ key: string; createdAt: string }>('/share/key'); setKey(r.key); setState({ on: true, createdAt: r.createdAt }); });
  };
  const off = () => run(async () => { await del('/share/key'); setKey(null); setState({ on: false, createdAt: null }); });

  const address = `${location.origin}/api/v1/share`;
  const bearer = `Bearer ${key ?? '<your key>'}`;
  const copyBtn = (t: string) => <button type="button" onClick={() => copyText(t)}>📋 Copy</button>;

  if (state === null) return errorEl;
  return (
    <details className={s.setup} open={!state.on || key !== null}>
      <summary>📲 Set up Send to Enso</summary>
      {errorEl}
      <p className="muted">{state.on ? `Your key is on (made ${new Date(state.createdAt!).toLocaleDateString()}).` : 'No key yet.'}</p>
      <div className="row">
        <button className="primary" disabled={busy} onClick={make}>{state.on ? 'Make a new key' : 'Make my key'}</button>
        {state.on && <button disabled={busy} onClick={off}>Turn off</button>}
      </div>
      {key && (
        <div className="field">
          <span>Copy it now: it is not shown again.</span>
          <div className="row"><input className={s.key} readOnly value={key} aria-label="Your Send to Enso key" onFocus={(e) => e.target.select()} />{copyBtn(key)}</div>
        </div>
      )}
      <ol className={s.steps}>
        <li>Open <b>Shortcuts</b> → <b>＋</b>. Name it <b>Send to Enso</b>. Tap ⓘ → turn on <b>Show in Share Sheet</b>. Receive: <b>Images, URLs, Text</b> only (not Safari web pages).</li>
        <li>Add <b>Get Images from Input</b> (Shortcut Input).</li>
        <li>Add <b>If</b> → Images → <b>has any value</b>.</li>
        <li>Inside If: add <b>Get Contents of URL</b>. URL: <code>{address}</code> {copyBtn(address)}<br />
          Method <b>POST</b>. Headers: <code>Authorization</code> = <code>{bearer}</code> {key && copyBtn(bearer)}<br />
          Request Body <b>Form</b>: field <code>photo</code>, type <b>File</b> = Images.</li>
        <li>Under <b>Otherwise</b>: the same <b>Get Contents of URL</b> (long-press the first one → Duplicate, drag it here), but field <code>text</code>, type <b>Text</b> = Shortcut Input.</li>
        <li>After <b>End If</b>: <b>Get Dictionary Value</b> → key <code>message</code> in <b>If Result</b>. Then <b>Show Notification</b> → Dictionary Value.</li>
        <li>Try it: in Safari tap Share → <b>Send to Enso</b>. You should see “✅ Saved to your Enso Inbox”.</li>
      </ol>
    </details>
  );
}
