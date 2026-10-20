// SPEC §8.15c — the ＋ IOU, Pay back / Let it go and Payback plan sheets. Amounts go to the server as typed; it parses
// them (parseAmount, §7B.9). The dim line says whether the row counts at once (countsAtOnce, the shared rule). Holds only its draft.
import { useState } from 'react';
import { Modal } from './Modal';
import { errorText, post } from '../api';
import { useApp } from '../state';
import { IOU_NOTE_MAX, centsText, countsAtOnce, type IouPair } from '../../../src/shared/ious';
import type { IouPlanEvery } from '../../../src/shared/vocab';

export type IouSheet = { kind: 'iou' } | { kind: 'paid' | 'let_go' | 'plan'; pair: IouPair };

const EVERY: { value: IouPlanEvery; label: string }[] = [{ value: 'week', label: 'Week' }, { value: '2weeks', label: '2 weeks' }, { value: 'month', label: 'Month' }];
const TITLE = { iou: '＋ IOU', paid: 'Pay back', let_go: 'Let it go', plan: 'Payback plan' } as const;

export function IouForm({ sheet, pairs, onClose }: { sheet: IouSheet; pairs: readonly IouPair[]; onClose: () => void }) {
  const { me, members, today, refresh } = useApp();
  const active = members.filter((m) => !m.disabledAt);
  const pair = sheet.kind === 'iou' ? null : sheet.pair;
  const others = active.filter((m) => m.id !== me.id);
  const [owedBy, setOwedBy] = useState(pair?.owedBy ?? me.id);
  const [owedTo, setOwedTo] = useState(pair?.owedTo ?? others[0]?.id ?? '');
  const [amount, setAmount] = useState(sheet.kind === 'paid' || sheet.kind === 'let_go' ? centsText(pair!.owedCents) : '');
  const [note, setNote] = useState('');
  const [split, setSplit] = useState(false);
  const [offTab, setOffTab] = useState(false);
  const [every, setEvery] = useState<IouPlanEvery>('week');
  const [start, setStart] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = (id: string) => (id === me.id ? 'you' : members.find((m) => m.id === id)?.displayName ?? 'unknown member');
  const d = { owedBy, owedTo };
  /** What the payer (the one owed) already owes the other way: a split can come off that tab (§7B.9). */
  const tab = pairs.find((p) => p.owedBy === owedTo && p.owedTo === owedBy)?.owedCents ?? 0;

  const send = () => {
    if (sheet.kind === 'iou') return post('/ious', { ...d, amount, note, split, offTab: offTab && tab > 0 });
    if (sheet.kind === 'plan') return post('/iou-plans', { ...d, amount, every, startDate: start });
    return post('/iou-payments', { ...d, amount, how: sheet.kind });
  };
  async function save() {
    setBusy(true); setError(null);
    try { await send(); refresh(); onClose(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  const waitsFor = sheet.kind === 'iou' ? owedBy : owedTo;
  const dim = sheet.kind === 'plan' ? (pair?.plan ? 'Replaces the plan now running.' : null)
    : countsAtOnce(sheet.kind === 'iou' ? 'iou' : 'payment', d, me.id) ? 'Counts at once.'
      : `Counts once ${name(waitsFor)} taps ${sheet.kind === 'iou' ? 'OK' : 'Got it'}.`;
  const who = (label: string, value: string, set: (v: string) => void) => (
    <label className="field"><span>{label}</span>
      <select value={value} onChange={(e) => set(e.target.value)}>
        {[...active.filter((m) => m.id === me.id), ...others].map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
      </select>
    </label>
  );

  return (
    <Modal title={TITLE[sheet.kind]} onClose={onClose} dirty={amount !== '' && sheet.kind !== 'paid' && sheet.kind !== 'let_go'} error={error}
      footer={<>
        <button className="primary" disabled={busy || !amount.trim() || owedBy === owedTo} onClick={save}>
          {sheet.kind === 'iou' ? 'Add' : sheet.kind === 'plan' ? 'Start' : 'Save'}
        </button>
        <button onClick={onClose} disabled={busy}>Cancel</button>
        {dim && <p className="muted" style={{ fontSize: '.85rem', flexBasis: '100%' }}>{dim}</p>}
      </>}>
      <fieldset disabled={busy}>
        {pair ? <p style={{ marginBottom: 10 }}>{name(pair.owedBy)} → {name(pair.owedTo)} · {centsText(pair.owedCents)} owed</p> : <>
          {who('Who owes', owedBy, setOwedBy)}
          {who('Who is owed', owedTo, setOwedTo)}
        </>}
        <label className="field"><span>{sheet.kind === 'plan' ? 'Amount each time ($)' : 'Amount ($)'}</span>
          <input inputMode="decimal" value={amount} placeholder="0.00" onChange={(e) => setAmount(e.target.value)} />
        </label>
        {sheet.kind === 'iou' && <>
          <label className="field"><span>Note</span>
            <input value={note} maxLength={IOU_NOTE_MAX} placeholder="Shelly's new phone" onChange={(e) => setNote(e.target.value)} />
          </label>
          <label className="row" style={{ minHeight: 44 }}><input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
            Split the bill: {name(owedTo)} paid, {name(owedBy)} owes half</label>
          {tab > 0 && <label className="row" style={{ minHeight: 44 }}><input type="checkbox" checked={offTab} onChange={(e) => setOffTab(e.target.checked)} />
            Take it off {name(owedTo)}'s tab ({centsText(tab)} owed to {name(owedBy)})</label>}
        </>}
        {sheet.kind === 'plan' && <>
          <label className="field"><span>Every</span>
            <select value={every} onChange={(e) => setEvery(e.target.value as IouPlanEvery)}>
              {EVERY.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
          </label>
          <label className="field"><span>Starting{every === 'month' ? ' (the 1st to the 28th)' : ''}</span>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
        </>}
      </fieldset>
    </Modal>
  );
}
