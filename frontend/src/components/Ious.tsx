// SPEC §8.15c — the 💵 IOUs section of the 🧹 Chores tab: one card per direction I may see (GET /ious), its waiting
// rows (OK / Got it / Decline; the hooks and buttons shared with IouBanner), declined rows (Ask again), plan, queue and payments, and the sheets (IouForm). The server decides what is owed, the queue and
// behind (§7B.9); who may OK or delete is the shared rule. Amounts are only shown with centsText.
import { useCallback, useEffect, useState } from 'react';
import { IouForm, type IouSheet } from './IouForm';
import { del, errorText, get, post } from '../api';
import { useApp } from '../state';
import { askAgainError, centsText, declineError, deleteError, letGoError, okError, waitsOn, type IouItem, type IouKind, type IouPair, type IouPayment } from '../../../src/shared/ious';
import { isAdmin } from '../../../src/shared/roles';
import s from './Messes.module.css';

const EVERY_TEXT = { week: 'every week', '2weeks': 'every 2 weeks', month: 'every month' } as const;
const HOW_TEXT = { paid: 'Paid', let_go: 'Let go', tab: 'Off the tab' } as const;

/** GET /ious, again on each refresh (§8.15c and the banner, §8.15a). */
export function useIous() {
  const { version } = useApp();
  const [pairs, setPairs] = useState<IouPair[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    get<{ pairs: IouPair[] }>('/ious').then((d) => { setPairs(d.pairs); setError(null); }).catch((e) => setError(errorText(e)));
  }, [version]);
  return { pairs, error };
}

export type IouAct = (send: () => Promise<unknown>, ask?: string) => Promise<void>;

/** Runs one IOU write (asking first when `ask` is given), then refreshes the app; a refusal comes back as text. */
export function useIouAction() {
  const { refresh } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act: IouAct = useCallback(async (send, ask) => {
    if (ask && !confirm(ask)) return;
    setBusy(true); setError(null);
    try { await send(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); refresh(); }
  }, [refresh]);
  return { busy, error, act };
}

const path = (kind: IouKind) => (kind === 'iou' ? '/ious' : '/iou-payments');
/** A row as the shared rules read it. */
export const okable = (p: IouPair, x: IouItem | IouPayment) => ({ owed_by: p.owedBy, owed_to: p.owedTo, created_by: x.createdBy, ok_at: x.okAt, declined_at: x.declinedAt });

/** OK / Got it and Decline, for the one a waiting row waits on (okError, declineError); the card's and the banner's. */
export function IouAnswerButtons({ p, kind, x, busy, act, makerName }: { p: IouPair; kind: IouKind; x: IouItem | IouPayment; busy: boolean; act: IouAct; makerName: string }) {
  const { me } = useApp();
  const r = okable(p, x);
  return <>
    {!okError(kind, r, me.id) && <button className="primary" disabled={busy} onClick={() => act(() => post(`${path(kind)}/${x.id}/ok`))}>{kind === 'iou' ? 'OK' : 'Got it'}</button>}
    {!declineError(kind, r, me.id) && <button disabled={busy}
      onClick={() => act(() => post(`${path(kind)}/${x.id}/decline`), `Decline this? ${makerName} will be told.`)}>Decline</button>}
  </>;
}

export function IousSection() {
  const { me, memberById, tz } = useApp();
  const { pairs, error: loadError } = useIous();
  const { busy, error: actError, act } = useIouAction();
  const error = actError ?? loadError;
  const [open, setOpen] = useState<string | null>(null);
  const [sheet, setSheet] = useState<IouSheet | null>(null);

  const viewer = { id: me.id, admin: isAdmin(me) };
  const name = (id: string) => (id === me.id ? 'you' : memberById(id)?.displayName ?? 'unknown member');
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: tz });
  const day = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const keyOf = (p: IouPair) => `${p.owedBy}|${p.owedTo}`;

  /** A waiting row's buttons: OK / Got it and Decline for the one it waits on, ✕ for whoever may delete it; a declined
   *  row's: Ask again for the one who made it, ✕. */
  const waitingRow = (p: IouPair, kind: IouKind, x: IouItem | IouPayment) => {
    const r = okable(p, x);
    const what = (kind === 'iou' ? `${centsText(x.cents)}${x.note ? ` · ${x.note}` : ''} · added by ${name(x.createdBy)}`
      : `${HOW_TEXT[(x as IouPayment).how]} ${centsText(x.cents)}${x.note ? ` · ${x.note}` : ''} · by ${name(x.createdBy)}`)
      + (x.declinedAt ? ` · declined by ${name(x.declinedBy!)} ${date(x.declinedAt)}` : '');
    return (
      <li key={x.id} className={s.body}>
        <div>{what}</div>
        <div className={s.actions}>
          {x.declinedAt ? !askAgainError(r, me.id) && <button disabled={busy} onClick={() => act(() => post(`${path(kind)}/${x.id}/again`))}>Ask again</button>
            : okError(kind, r, me.id) ? <span className="muted">Waiting for {name(waitsOn(kind, p))}</span>
            : <IouAnswerButtons p={p} kind={kind} x={x} busy={busy} act={act} makerName={cap(name(x.createdBy))} />}
          {!deleteError(kind, r, viewer) && <button className="plain" aria-label={`Delete ${what}`} disabled={busy}
            onClick={() => act(() => del(`${path(kind)}/${x.id}`), 'Delete this?')}>✕</button>}
        </div>
      </li>
    );
  };
  const adminX = (kind: IouKind, id: string, what: string) => viewer.admin && (
    <button className="plain" aria-label={`Delete ${what}`} disabled={busy} onClick={() => act(() => del(`${path(kind)}/${id}`), 'Delete this? Amounts are records.')}>✕</button>
  );

  const card = (p: IouPair) => {
    const k = keyOf(p), d = { owedBy: p.owedBy, owedTo: p.owedTo };
    return (
      <li key={k}>
        <button className={`plain ${s.balance}`} aria-expanded={open === k} onClick={() => setOpen(open === k ? null : k)}>
          {cap(name(p.owedBy))} {p.owedBy === me.id ? 'owe' : 'owes'} {name(p.owedTo)} <b>{centsText(p.owedCents)}</b> <span aria-hidden>{open === k ? '▾' : '▸'}</span>
        </button>
        {open === k && <div className={s.body} style={{ paddingLeft: 8 }}>
          {(p.waiting.ious.length > 0 || p.waiting.payments.length > 0) && <><h3 className={s.sub}>Waiting for OK</h3>
            <ul className={s.list}>{p.waiting.ious.map((x) => waitingRow(p, 'iou', x))}{p.waiting.payments.map((x) => waitingRow(p, 'payment', x))}</ul></>}
          {(p.declined.ious.length > 0 || p.declined.payments.length > 0) && <><h3 className={s.sub}>Declined</h3>
            <ul className={s.list}>{p.declined.ious.map((x) => waitingRow(p, 'iou', x))}{p.declined.payments.map((x) => waitingRow(p, 'payment', x))}</ul></>}
          {p.plan && <div className={s.actions}>
            <span>Plan: {centsText(p.plan.centsEach)} {EVERY_TEXT[p.plan.every]} from {day(p.plan.startDate)}{p.plan.nextDue ? ` · next ${day(p.plan.nextDue)}` : ''}{p.plan.behindCents > 0 ? ` · behind ${centsText(p.plan.behindCents)}` : ''}</span>
            <button disabled={busy} onClick={() => act(() => del(`/iou-plans/${p.plan!.id}`), 'End this payback plan?')}>End plan</button>
          </div>}
          {p.items.length > 0 && <><h3 className={s.sub}>Queue (oldest first)</h3>
            <ul className={s.list}>{p.items.map((x) => <li key={x.id} className={s.actions}>
              <span>{centsText(x.cents)}{x.note ? ` · ${x.note}` : ''} · {date(x.createdAt)}{x.paidCents >= x.cents ? ' · paid ✓' : x.paidCents > 0 ? ` · ${centsText(x.paidCents)} paid` : ''}</span>
              {adminX('iou', x.id, `${centsText(x.cents)} IOU`)}
            </li>)}</ul></>}
          {p.payments.length > 0 && <><h3 className={s.sub}>Paid back</h3>
            <ul className={s.list}>{p.payments.map((x) => <li key={x.id} className={s.actions}>
              <span>{centsText(x.cents)} · {date(x.createdAt)} · {HOW_TEXT[x.how].toLowerCase()}{x.note ? ` · ${x.note}` : ''}</span>
              {adminX('payment', x.id, `${centsText(x.cents)} payment`)}
            </li>)}</ul></>}
          <div className={s.actions}>
            {p.owedCents > 0 && <button className="primary" disabled={busy} onClick={() => setSheet({ kind: 'paid', pair: p })}>Pay back</button>}
            {p.owedCents > 0 && !letGoError(d, viewer) && <button disabled={busy} onClick={() => setSheet({ kind: 'let_go', pair: p })}>Let it go</button>}
            {p.owedCents > 0 && <button disabled={busy} onClick={() => setSheet({ kind: 'plan', pair: p })}>Payback plan</button>}
          </div>
        </div>}
      </li>
    );
  };

  return (
    <>
      <div className="row" style={{ marginBottom: 6 }}>
        <h2 style={{ flex: 1, marginBottom: 0 }}>IOUs</h2>
        <button onClick={() => setSheet({ kind: 'iou' })}>＋ IOU</button>
      </div>
      <p className="muted" style={{ fontSize: '.85rem', marginBottom: 10 }}>Who owes whom in the family. Ensō keeps the record; money is paid outside it.</p>
      {error && <div role="alert" className="alert-error">{error}</div>}
      {pairs === null && !error && <p className="muted">Loading…</p>}
      {pairs?.length === 0 && <p className="muted">Nobody owes anybody.</p>}
      {!!pairs?.length && <ul className={s.list}>{pairs.map(card)}</ul>}
      {sheet && <IouForm sheet={sheet} pairs={pairs ?? []} onClose={() => setSheet(null)} />}
    </>
  );
}
