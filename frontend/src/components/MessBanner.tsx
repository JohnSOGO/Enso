// SPEC §8.15a — the mess banner: on every screen, under the Ringing bar, one row per mess I am still asked about
// (§7B.7), with its photo and That was me / Not me. Not red, no sound; answering removes the row.
import { useApp } from '../state';
import { AnswerButtons, MessPhoto, useMessAction, useMesses } from './Messes';
import s from './Messes.module.css';

export function MessBanner() {
  const { me, memberById } = useApp();
  const { data } = useMesses();
  const { busy, error, act } = useMessAction();
  const mine = data?.messes.filter((m) => m.asked.includes(me.id)) ?? [];
  if (mine.length === 0 && !error) return null;
  return (
    <section className={s.banner} aria-label="Whose mess?" aria-live="polite">
      {error && <div role="alert" className="alert-error">{error}</div>}
      {mine.map((m) => (
        <div key={m.id} className={s.ask}>
          <MessPhoto m={m} />
          <span className={s.question}>
            🧽 {memberById(m.reportedBy)?.displayName ?? 'Someone'} cleaned up a mess{m.choreTitle ? ` (${m.choreTitle})` : ''}{m.note ? `: ${m.note}` : ''}. Was it yours?
          </span>
          <AnswerButtons m={m} busy={busy === m.id} act={act} />
        </div>
      ))}
    </section>
  );
}
