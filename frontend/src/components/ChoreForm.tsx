// SPEC §8.5 — the chore form (modal): title, done means, days, at/by, time, people in turn
// order, steps, channels, repeat alert. The server validates (§7B.4); its 400 shows in the dialog.
import { useMemo, useState } from 'react';
import { Modal } from './Modal';
import { ChannelChecks, DayChips, RenotifySelect } from './AlertFields';
import type { Chore } from './Chores';
import { del, errorText, patch, post } from '../api';
import { useApp } from '../state';
import { CHORE_TIMING, type ChoreTiming } from '../../../src/shared/vocab';
import { DONE_MEANS_MAX, PEOPLE_MAX, STEPS_MAX, TITLE_MAX, WAIT_MAX } from '../../../src/shared/chores';

interface StepDraft { title: string; wait: string; memberId: string | null }

const TIMING_LABEL: Record<ChoreTiming, [string, string]> = {
  at: ['At', 'a time — it rings'],
  by: ['By', 'a time — quiet'],
};
const chip = { padding: '4px 10px', minHeight: 44 } as const;

export function ChoreForm({ chore, onClose }: { chore: Chore | null; onClose: () => void }) {
  const { me, members, refresh } = useApp();
  const init = useMemo(() => ({
    title: chore?.title ?? '', doneMeans: chore?.doneMeans ?? '', days: chore?.days ?? [],
    timing: chore?.timing ?? CHORE_TIMING[0], time: chore?.time ?? '08:00', nudge: chore?.nudge ?? false,
    people: chore?.people ?? [],
    steps: chore
      ? chore.steps.map((st): StepDraft => ({ title: st.title, wait: st.waitMin ? String(st.waitMin) : '', memberId: st.memberId }))
      : [{ title: '', wait: '', memberId: null } as StepDraft],
    push: chore ? chore.channels.includes('push') : true, house: chore ? chore.channels.includes('house') : false,
    renotify: chore?.renotifyMin ? String(chore.renotifyMin) : 'off',
  }), [chore]);
  const [f, setF] = useState(init);
  // A new chore's one step is named after the chore until that step is edited (§8.5).
  const [follow, setFollow] = useState(!chore);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const canEdit = !chore || me.role === 'owner' || chore.createdBy === me.id;
  const shown = (ids: (string | null)[]) => members.filter((m) => !m.disabledAt || ids.includes(m.id));

  const setTitle = (title: string) =>
    setF({ ...f, title, steps: follow ? f.steps.map((st, i) => (i === 0 ? { ...st, title } : st)) : f.steps });
  const setStep = (i: number, patchStep: Partial<StepDraft>) => {
    if (i === 0 && patchStep.title !== undefined) setFollow(false);
    setF({ ...f, steps: f.steps.map((st, j) => (j === i ? { ...st, ...patchStep } : st)) });
  };
  const addStep = () => { setFollow(false); setF({ ...f, steps: [...f.steps, { title: '', wait: '', memberId: null }] }); };
  const removeStep = (i: number) => setF({ ...f, steps: f.steps.filter((_, j) => j !== i) });
  const togglePerson = (id: string) =>
    setF({ ...f, people: f.people.includes(id) ? f.people.filter((x) => x !== id) : [...f.people, id] });

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); refresh(); onClose(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  const save = () => run(async () => {
    const nudge = f.timing === 'by' && f.nudge;
    const channels = [...(f.push ? ['push'] : []), ...(f.house ? ['house'] : [])];
    if (!f.days.length) throw new Error('Pick at least one day of the week.');
    if (!f.people.length) throw new Error('Pick at least one person.');
    if (f.steps.some((st) => !st.title.trim())) throw new Error('Give every step a title.');
    if ((f.timing === 'at' || nudge) && !channels.length) throw new Error('Pick at least one way to alert (Phone or House).');
    const last = f.steps.length - 1;
    const body = {
      title: f.title, doneMeans: f.doneMeans.trim() || null, days: f.days, timing: f.timing, time: f.time, nudge,
      people: f.people, channels, renotifyMin: f.renotify === 'off' ? null : Number(f.renotify),
      steps: f.steps.map((st, i) => ({ title: st.title, waitMin: i < last && st.wait ? Number(st.wait) : null, memberId: st.memberId })),
    };
    if (chore) await patch(`/chores/${chore.id}`, body); else await post('/chores', body);
  });

  return (
    <Modal title={chore ? `Edit chore: ${chore.title}` : 'New chore'} onClose={onClose} dirty={dirty} error={error}
      footer={<>
        {canEdit && <button className="primary" disabled={busy || !f.title.trim()} onClick={save}>Save</button>}
        <button onClick={onClose} disabled={busy}>Cancel</button>
      </>}>
      <fieldset disabled={!canEdit || busy}>
        {!canEdit && <p className="muted" style={{ marginBottom: 10 }}>Only the creator or an admin can change this chore.</p>}
        <label className="field"><span>Title</span>
          <input value={f.title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} autoFocus={!chore} />
        </label>
        <label className="field"><span>Done means…</span>
          <input value={f.doneMeans} maxLength={DONE_MEANS_MAX} placeholder="e.g. Bins at the curb, lids shut"
            onChange={(e) => setF({ ...f, doneMeans: e.target.value })} />
        </label>
        <DayChips days={f.days} onChange={(days) => setF({ ...f, days })} />

        <div className="field" role="radiogroup" aria-label="When">
          <span className="muted" style={{ fontSize: '.8rem' }}>When</span>
          <div className="row wrap" style={{ marginTop: 4 }}>
            {CHORE_TIMING.map((t) => (
              <label key={t} className="chip" style={chip}>
                <input type="radio" name="timing" checked={f.timing === t} onChange={() => setF({ ...f, timing: t })} />
                <b>{TIMING_LABEL[t][0]}</b> {TIMING_LABEL[t][1]}
              </label>
            ))}
          </div>
          {f.timing === 'by' && (
            <label className="chip" style={{ ...chip, marginTop: 6 }}>
              <input type="checkbox" checked={f.nudge} onChange={(e) => setF({ ...f, nudge: e.target.checked })} /> Nudge at that time
            </label>
          )}
        </div>
        <label className="field"><span>Time</span>
          <input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
        </label>

        <div className="field" role="group" aria-label="People, in turn order">
          <span className="muted" style={{ fontSize: '.8rem' }}>People (tap in turn order)</span>
          <div className="row wrap" style={{ marginTop: 4 }}>
            {shown(f.people).map((m) => {
              const n = f.people.indexOf(m.id);
              return (
                <button key={m.id} type="button" className="chip" aria-pressed={n >= 0}
                  aria-label={n >= 0 ? `${m.displayName}, turn ${n + 1}` : m.displayName}
                  disabled={n < 0 && f.people.length >= PEOPLE_MAX}
                  style={{ ...chip, borderColor: m.color, background: n >= 0 ? 'var(--accent)' : undefined, color: n >= 0 ? '#fff' : undefined }}
                  onClick={() => togglePerson(m.id)}>
                  {n >= 0 && <b aria-hidden>{n + 1}</b>} {m.displayName}
                </button>
              );
            })}
          </div>
          {f.people.length >= 2 && <p className="muted" style={{ fontSize: '.85rem', marginTop: 6 }}>Takes turns, changing every Sunday.</p>}
        </div>

        <div className="field" role="group" aria-label="Steps">
          <span className="muted" style={{ fontSize: '.8rem' }}>Steps</span>
          {f.steps.map((st, i) => (
            <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 8, marginTop: 6 }}>
              <div className="row">
                <input value={st.title} maxLength={TITLE_MAX} aria-label={`Step ${i + 1} title`} placeholder={`Step ${i + 1}`}
                  onChange={(e) => setStep(i, { title: e.target.value })} />
                {f.steps.length > 1 && (
                  <button type="button" className="plain" style={{ minWidth: 44, minHeight: 44, flex: 'none' }}
                    aria-label={`Remove step ${i + 1}${st.title ? `: ${st.title}` : ''}`} title={`Remove step ${i + 1}`}
                    onClick={() => removeStep(i)}>✕</button>
                )}
              </div>
              {i < f.steps.length - 1 && (
                <label className="row" style={{ marginTop: 6, fontSize: '.85rem' }}>
                  <span className="muted" style={{ flex: 'none' }}>then ring the next step after</span>
                  <input type="number" inputMode="numeric" min={1} max={WAIT_MAX} value={st.wait} style={{ width: '5rem', flex: 'none' }}
                    aria-label={`Minutes from step ${i + 1} to the next step`} onChange={(e) => setStep(i, { wait: e.target.value })} />
                  <span className="muted" style={{ flex: 'none' }}>min</span>
                </label>
              )}
              <label className="row" style={{ marginTop: 6, fontSize: '.85rem' }}>
                <span className="muted" style={{ flex: 'none' }}>Who</span>
                <select value={st.memberId ?? ''} aria-label={`Who does step ${i + 1}`}
                  onChange={(e) => setStep(i, { memberId: e.target.value || null })}>
                  <option value="">Whose turn</option>
                  {shown([st.memberId]).map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
                </select>
              </label>
            </div>
          ))}
          <button type="button" style={{ marginTop: 6 }} disabled={f.steps.length >= STEPS_MAX} onClick={addStep}>＋ Add step</button>
        </div>

        <ChannelChecks push={f.push} house={f.house} onChange={(c) => setF({ ...f, ...c })} />
        <RenotifySelect label="Repeat the alert until done" value={f.renotify} onChange={(renotify) => setF({ ...f, renotify })} />
      </fieldset>
      {chore && canEdit && (
        <div className="row wrap" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <button className="danger" disabled={busy} onClick={() => { if (confirm(`Delete chore "${chore.title}" and what done looks like for it?`)) run(() => del(`/chores/${chore.id}`)); }}>Delete chore</button>
        </div>
      )}
    </Modal>
  );
}
