// SPEC §9.1 — Settings → Me → Phone alerts: this phone's state, honestly, and Turn on / Turn off / Send a test.
import { useCallback, useEffect, useState } from 'react';
import { errorText, get, post } from '../api';
import { useApp } from '../state';
import { facts, turnOff, turnOn, type PushFacts } from '../push-client';
import { useAction } from './useAction';

const TAP = { minHeight: 44 };
const note = { fontSize: '.85rem', marginTop: 6 };

export function PhoneAlerts() {
  const { status, version, refresh } = useApp();
  const [key, setKey] = useState<string | null | undefined>(undefined);
  const [here, setHere] = useState<PushFacts | null>(null);
  const [sentText, setSentText] = useState<string | null>(null);
  const { run, busy, errorEl } = useAction();
  // A failed check is shown, never read as "not set up" or "off".
  const [loadError, setLoadError] = useState<string | null>(null);
  const reread = useCallback(() => {
    facts().then(setHere).catch((e) => setLoadError(`Could not read this phone’s alert settings: ${errorText(e)}`));
  }, []);
  useEffect(() => {
    get<{ key: string | null }>('/push/vapid-key').then((r) => setKey(r.key))
      .catch((e) => setLoadError(`Could not ask the server whether phone alerts are set up: ${errorText(e)}`));
  }, []);
  useEffect(reread, [reread, version]);

  const subs = status?.mySubscriptions ?? [];
  const mine = here?.endpoint ? subs.find((s) => s.endpoint === here.endpoint) : undefined;
  const others = subs.length - (mine ? 1 : 0);
  const after = () => { reread(); refresh(); };

  let state: 'checking' | 'unset' | 'ios-home' | 'unsupported' | 'blocked' | 'on' | 'off';
  if (key === undefined || (here === null && key !== null)) state = 'checking';
  else if (key === null) state = 'unset';
  else if (here!.isIOS && !here!.standalone) state = 'ios-home';
  else if (!here!.supported) state = 'unsupported';
  else if (here!.permission === 'denied') state = 'blocked';
  else state = mine ? 'on' : 'off';

  return (
    <div className="field">
      <span className="muted" style={{ fontSize: '.8rem' }}>Phone alerts</span>
      {errorEl}
      {loadError && <div role="alert" className="alert-error">{loadError}</div>}
      <div className="row wrap" style={{ marginTop: 4 }}>
        {state === 'checking' && <span className="badge neutral">Checking this phone…</span>}
        {state === 'unset' && <span className="badge bad">Not set up</span>}
        {state === 'ios-home' && <span className="badge bad">iPhone: add Ensō to the Home Screen first</span>}
        {state === 'unsupported' && <span className="badge bad">Not supported in this browser</span>}
        {state === 'blocked' && <span className="badge bad">Blocked</span>}
        {state === 'off' && <>
          <span className="badge bad">Off</span>
          <button className="primary" style={TAP} disabled={busy}
            onClick={() => run(async () => { await turnOn(key!); setSentText(null); after(); })}>Turn on</button>
        </>}
        {state === 'on' && <>
          <span className="badge good">On for this phone</span>
          <button style={TAP} disabled={busy} onClick={() => run(async () => {
            setSentText(null);
            const r = await post<{ sent: number }>('/push/test');
            setSentText(`Sent to ${r.sent} device${r.sent === 1 ? '' : 's'}.`);
            refresh();
          })}>Send a test</button>
          <button style={TAP} disabled={busy} onClick={() => run(async () => { await turnOff(mine!.id); setSentText(null); after(); })}>Turn off</button>
        </>}
      </div>
      {sentText && <p className="muted" role="status" style={note}>{sentText}</p>}
      {state === 'unset' && <p className="muted" style={note}>This server has no push keys, so phones cannot be sent alerts. Alerts still show in the Ringing bar.</p>}
      {state === 'ios-home' && <p className="muted" style={note}>iPhone allows alerts only in the Home Screen app: tap Share → Add to Home Screen, open Ensō from there, and turn alerts on in Settings → Me.</p>}
      {state === 'blocked' && <p className="muted" style={note}>
        {here!.isIOS ? 'Notifications for Ensō are turned off. Change it in iPhone Settings → Notifications → Ensō, then come back here.'
          : 'This browser blocks notifications for Ensō. Allow them in the browser’s site settings for this address, then come back here.'}
      </p>}
      {others > 0 && <p className="muted" style={note}>{state === 'on' ? 'Also on' : 'On'} for {others} other device{others === 1 ? '' : 's'} of yours.</p>}
    </div>
  );
}
