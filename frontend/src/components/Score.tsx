// SPEC §8.15b — Chores → 🏅 Score: every active member's OK'd points this week and this month, in member order (never
// ranked), and the House row with the sums. The data is GET /bounties (useBounties).
import { useBounties } from './Bounties';
import { useApp } from '../state';
import s from './Lists.module.css';

export function ScoreSection() {
  const { memberById } = useApp();
  const { data, error } = useBounties();
  const scores = data?.scores ?? [];
  const sum = (k: 'week' | 'month') => scores.reduce((n, x) => n + x[k], 0);
  return (
    <section className={s.section} aria-label="Score">
      {error && <div role="alert" className="alert-error">{error}</div>}
      {!data && !error && <p className="muted">Loading…</p>}
      {data && (
        <table className={s.table}>
          <thead><tr><th scope="col">Who</th><th scope="col">This week</th><th scope="col">This month</th></tr></thead>
          <tbody>
            {scores.map((x) => (
              <tr key={x.memberId}>
                <th scope="row" className={s.flexible}>{memberById(x.memberId)?.displayName ?? 'unknown member'}</th>
                <td className={s.rigid}>{x.week}</td>
                <td className={s.rigid}>{x.month}</td>
              </tr>
            ))}
            <tr><th scope="row">House</th><td className={s.rigid}><b>{sum('week')}</b></td><td className={s.rigid}><b>{sum('month')}</b></td></tr>
          </tbody>
        </table>
      )}
      <p className="muted" style={{ fontSize: '.85rem', marginTop: 8 }}>Points count once an admin says OK.</p>
    </section>
  );
}
