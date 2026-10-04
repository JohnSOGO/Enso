// SPEC §9.2a, §8.6 — Settings → Me → 🔊 Speak my alerts on: Home Assistant's speakers, each with a box this
// member ticks. Shows `mine` and `defaults` exactly as the server sends them; never decides the defaults.
import { useEffect, useState } from 'react';
import { ApiError, errorText, get, patch } from '../api';
import type { Speaker } from '../../../src/shared/speakers';
import { useAction } from './useAction';
import s from './Lists.module.css';

interface SpeakerList { speakers: Speaker[]; mine: string[] | null; defaults: string[] }
const note = { fontSize: '.85rem', marginTop: 6 };

export function HouseSpeakers() {
  const [list, setList] = useState<SpeakerList | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const { run, busy, errorEl } = useAction();
  useEffect(() => {
    setLoadError(null);
    get<SpeakerList>('/house/speakers').then(setList).catch((e) => setLoadError(
      e instanceof ApiError && e.status === 503 ? "House isn't set up." : `Couldn't reach the house: ${errorText(e)}`));
  }, [tries]);

  const save = (mine: string[] | null) => run(async () => {
    const me = await patch<{ houseSpeakers: string[] | null }>('/me', { houseSpeakers: mine });
    setList((l) => l && { ...l, mine: me.houseSpeakers });
  });
  const toggle = (id: string, on: boolean) => {
    const mine = list?.mine ?? [];
    save(on ? [...mine, id] : mine.filter((x) => x !== id));
  };

  const mine = list?.mine ?? null;
  // A chosen speaker HA no longer lists still shows, ticked, so it can be unticked.
  const gone = (mine ?? []).filter((id) => !list?.speakers.some((sp) => sp.id === id));
  const line = (id: string, name: string, dim: string) => (
    <tr key={id}>
      <td>
        <label className="row" style={{ minHeight: 44 }} title={name}>
          <input type="checkbox" checked={!!mine?.includes(id)} disabled={busy} onChange={(ev) => toggle(id, ev.target.checked)} />
          <span className={s.flexible} style={{ maxWidth: 'none' }}>{name} <span className="muted" style={{ fontWeight: 400 }}>· {dim}</span></span>
        </label>
      </td>
    </tr>
  );

  return (
    <div className="field">
      <span className="muted" style={{ fontSize: '.8rem' }}>🔊 Speak my alerts on</span>
      {loadError && <div role="alert" className="alert-error">
        {loadError} <button style={{ minHeight: 44 }} onClick={() => setTries((n) => n + 1)}>Try again</button>
      </div>}
      {errorEl}
      {list && <>
        <table className={s.table}>
          <tbody>
            {list.speakers.map((sp) => line(sp.id, sp.name, sp.kind === 'echo' ? 'Alexa' : 'Voice PE'))}
            {gone.map((id) => line(id, id, 'not in the house any more'))}
          </tbody>
        </table>
        {mine === null && <p className="muted" style={note}>Not chosen: alerts for you are spoken on the default speakers ({list.defaults.join(', ')}).</p>}
        {mine?.length === 0 && <p className="muted" style={note}>No speaker: alerts only for you are not spoken.</p>}
        {mine !== null && <button style={{ minHeight: 44 }} disabled={busy} onClick={() => save(null)}>Use the defaults</button>}
      </>}
    </div>
  );
}
