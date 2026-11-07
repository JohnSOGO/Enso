// SPEC §7.1 — the calendar header's month: today's month while today is on screen; otherwise the month that owns
// the most visible days, ties to the earlier one.
// Pure: no React, no DOM, no app state.
import { addDays } from '../../src/shared/time';

/** firstVisibleDate is the Sunday of the top visible row; visibleDayCount is 7 × the rows on screen. → 'YYYY-MM'. */
export function headerMonth(firstVisibleDate: string, visibleDayCount: number, today: string): string {
  const lastVisibleDate = addDays(firstVisibleDate, Math.max(1, visibleDayCount) - 1);
  if (firstVisibleDate <= today && today <= lastVisibleDate) return today.slice(0, 7);
  const counts = new Map<string, number>(); // insertion order = calendar order, so the first max wins a tie
  for (let i = 0; i < Math.max(1, visibleDayCount); i++) {
    const m = addDays(firstVisibleDate, i).slice(0, 7);
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  let best = '';
  let most = 0;
  for (const [m, n] of counts) if (n > most) { best = m; most = n; }
  return best;
}
