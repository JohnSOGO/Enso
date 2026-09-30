// SPEC §7.1 — continuous calendar: Sunday-first week rows, no month resets, virtualized.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { get } from '../api';
import { useApp } from '../state';
import { addDays, diffDays, startOfWeek } from '../../../src/shared/time';
import s from './Calendar.module.css';

export interface Occurrence {
  eventId: string; date: string; endDate: string; startTime: string | null; endTime: string | null;
  title: string; allDay: boolean; color: string; createdBy: string; creatorName: string;
  assignedTo: string[]; hasReminder: boolean; recurring: boolean;
}
export interface DayData {
  items: (Occurrence & { continued: boolean })[];
  publicHolidays: string[];
  schoolHolidays: string[];
}

const WEEKS_BACK = 520; // ±10 years of scrollable weeks
const TOTAL_WEEKS = 1040;
const CHUNK_WEEKS = 8; // one /calendar request = 56 days
const OVERSCAN = 3;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function buildDays(json: any, from: string, to: string): Map<string, DayData> {
  const days = new Map<string, DayData>();
  const day = (d: string) => {
    let x = days.get(d);
    if (!x) { x = { items: [], publicHolidays: [], schoolHolidays: [] }; days.set(d, x); }
    return x;
  };
  for (const o of json.occurrences as Occurrence[]) {
    const span = diffDays(o.endDate, o.date);
    for (let i = 0; i <= span; i++) {
      const d = addDays(o.date, i);
      if (d >= from && d <= to) day(d).items.push({ ...o, continued: i > 0 });
    }
  }
  for (const h of json.publicHolidays) day(h.date).publicHolidays.push(h.name);
  for (const h of json.schoolHolidays) day(h.date).schoolHolidays.push(h.label);
  return days;
}

export function Calendar({ onOpenDay }: { onOpenDay: (date: string, data: DayData | undefined) => void }) {
  const { today, version, me } = useApp();
  const todayStr = today();
  const origin = useMemo(() => addDays(startOfWeek(todayStr), -WEEKS_BACK * 7), [todayStr]);
  const scroller = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 390, h: 600 });
  // Start at today's row so the first data fetch is for the weeks actually on screen.
  const [scrollTop, setScrollTop] = useState((WEEKS_BACK - 1) * 64);
  const [chunks, setChunks] = useState(new Map<number, { version: number; days: Map<string, DayData> }>());
  const [loadError, setLoadError] = useState<string | null>(null);
  const inflight = useRef(new Set<string>());

  const narrow = size.w < 480;
  const rowH = narrow ? 64 : 104;
  const prevRowH = useRef(rowH);

  useLayoutEffect(() => {
    const el = scroller.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const scrollToToday = useCallback((smooth: boolean) => {
    // Today's week is the second visible row.
    scroller.current?.scrollTo({ top: (WEEKS_BACK - 1) * rowH, behavior: smooth ? 'smooth' : 'auto' });
  }, [rowH]);

  useLayoutEffect(() => { scrollToToday(false); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the same top week when the row height changes across the breakpoint.
  useLayoutEffect(() => {
    if (prevRowH.current !== rowH && scroller.current) {
      const week = scroller.current.scrollTop / prevRowH.current;
      scroller.current.scrollTop = week * rowH;
      prevRowH.current = rowH;
    }
  }, [rowH]);

  const first = Math.max(0, Math.floor(scrollTop / rowH) - OVERSCAN);
  const last = Math.min(TOTAL_WEEKS - 1, Math.floor((scrollTop + size.h) / rowH) + OVERSCAN);
  const topWeek = Math.min(TOTAL_WEEKS - 1, Math.max(0, Math.floor((scrollTop + 1) / rowH)));
  const headerDate = addDays(origin, topWeek * 7 + 4); // the week's Thursday names its month

  // Load the chunks covering the visible weeks; refetch stale ones after any refresh.
  useEffect(() => {
    for (let c = Math.floor(first / CHUNK_WEEKS); c <= Math.floor(last / CHUNK_WEEKS); c++) {
      const have = chunks.get(c);
      const key = `${c}:${version}`;
      if ((have && have.version === version) || inflight.current.has(key)) continue;
      inflight.current.add(key);
      const from = addDays(origin, c * CHUNK_WEEKS * 7);
      const to = addDays(from, CHUNK_WEEKS * 7 - 1);
      get(`/calendar?from=${from}&to=${to}`)
        .then((json) => {
          setLoadError(null);
          setChunks((prev) => new Map(prev).set(c, { version, days: buildDays(json, from, to) }));
        })
        .catch((e) => setLoadError(e.message))
        .finally(() => inflight.current.delete(key));
    }
  }, [first, last, version, origin, chunks]);

  const dayData = (date: string, weekIdx: number) => chunks.get(Math.floor(weekIdx / CHUNK_WEEKS))?.days.get(date);

  const rows = [];
  for (let w = first; w <= last; w++) {
    const weekStart = addDays(origin, w * 7);
    const cells = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(weekStart, i);
      const [y, m, d] = date.split('-').map(Number);
      const data = dayData(date, w);
      const pub = me.showPublicHolidays ? data?.publicHolidays ?? [] : [];
      const school = me.showSchoolHolidays ? data?.schoolHolidays ?? [] : [];
      const items = data?.items ?? [];
      const cls = [
        s.cell,
        (y * 12 + m) % 2 ? s.toneB : s.toneA,
        date === todayStr ? s.today : '',
        pub.length ? s.pub : school.length ? s.school : '',
        date < todayStr ? s.past : '',
      ].join(' ');
      const label = [
        new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }),
        items.length ? `${items.length} event${items.length > 1 ? 's' : ''}` : '',
        ...pub, ...school,
      ].filter(Boolean).join(', ');
      cells.push(
        <button key={date} className={cls} aria-label={label} onClick={() => onOpenDay(date, data)}>
          <span className={s.num}>
            {d === 1 ? <><span className={s.monthTag}>{MONTHS[m - 1]}</span> </> : null}
            <span className={s.dot}>{d}</span>
          </span>
          {narrow ? (
            <span className={s.dots}>
              {items.slice(0, 4).map((o, k) => <i key={k} style={{ background: o.color }} />)}
              {items.length > 4 && <b>+</b>}
            </span>
          ) : (
            <span className={s.chips}>
              {items.slice(0, 3).map((o, k) => (
                <span key={k} className={`${s.ev} ${o.continued ? s.cont : ''}`} style={{ borderLeftColor: o.color }}>
                  {o.continued ? '↳ ' : o.startTime ? `${o.startTime} ` : ''}{o.title}
                </span>
              ))}
              {items.length > 3 && <span className="badge neutral">+{items.length - 3}</span>}
            </span>
          )}
        </button>,
      );
    }
    rows.push(<div key={w} className={s.week} style={{ top: w * rowH, height: rowH }}>{cells}</div>);
  }

  const [hy, hm] = headerDate.split('-').map(Number);
  return (
    <section className={s.root} aria-label="Calendar">
      <div className={s.head}>
        <h1 className={s.month}>{new Date(Date.UTC(hy, hm - 1, 15)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h1>
        <button onClick={() => scrollToToday(true)}>Today</button>
      </div>
      <div className={s.legend}>
        {!!me.showPublicHolidays && <span><i className={s.legendPub} /> Public holiday</span>}
        {!!me.showSchoolHolidays && <span><i className={s.legendSchool} /> School holiday</span>}
        {loadError && <span className="badge bad" role="alert">Calendar failed to load: {loadError}</span>}
      </div>
      <div className={s.dow} aria-hidden>{DOW.map((d, i) => <span key={i}>{d}</span>)}</div>
      <div ref={scroller} className={s.scroller} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
        <div className={s.canvas} style={{ height: TOTAL_WEEKS * rowH }}>{rows}</div>
      </div>
    </section>
  );
}
