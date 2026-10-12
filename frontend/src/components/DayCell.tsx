// SPEC §7.1–7.2 — one calendar day cell: classes, stay tint, date line, weather, bar-lane gap, event marks.
import { useApp } from '../state';
import type { DayData, Occurrence, Span } from './Calendar';
import s from './DayCell.module.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const isMultiDay = (o: Occurrence) => o.endDate > o.date;

/** '#RRGGBB' → rgba() with the given alpha. */
function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function DayCell({ date, data, stay, lanes, barH, narrow, todayStr, onOpen }: {
  date: string; data: DayData | undefined; stay: Span | undefined; lanes: number; barH: number;
  narrow: boolean; todayStr: string; onOpen: (date: string, data: DayData | undefined) => void;
}) {
  const { me } = useApp();
  const [y, m, d] = date.split('-').map(Number);
  const pub = me.showPublicHolidays ? data?.publicHolidays ?? [] : [];
  const market = me.showOptionsExpiration ? data?.marketDays ?? [] : [];
  const items = data?.items ?? [];
  const single = items.filter((o) => !isMultiDay(o)); // multi-day events are drawn as bars
  // §7.2 day icons: beside the date number at every width — holiday, 📈, then the day's event emoji; at most two.
  const withEmoji = items.filter((o) => o.emoji);
  const lead = [...pub.slice(0, 1), ...market.slice(0, 1)];
  const iconed = withEmoji.slice(0, 2 - lead.length);
  const icons = [...lead, ...iconed.map((o) => ({ emoji: o.emoji! }))];
  const dotted = single.filter((o) => !iconed.includes(o)); // §7.1: an event shown by its emoji gets no dot
  const cls = [
    s.cell,
    (y * 12 + m) % 2 ? s.toneB : s.toneA,
    date === todayStr ? s.today : '',
    pub.length ? s.pub : '',
    date < todayStr ? s.past : '',
    narrow ? s.narrow : '',
  ].join(' ');
  const label = [
    new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }),
    items.length ? `${items.length} event${items.length > 1 ? 's' : ''}` : '',
    ...pub.map((h) => h.name), ...market.map((m) => m.name),
    data?.weather ? `${data.weather.words}, high ${data.weather.high}°, low ${data.weather.low}°` : '',
  ].filter(Boolean).join(', ');
  return (
    <button className={cls} aria-label={label} onClick={() => onOpen(date, data)}
      style={stay ? {
        // Layer the stay's tint over the holiday tint rather than replacing it.
        backgroundImage: [
          `linear-gradient(${tint(stay.o.color, 0.16)}, ${tint(stay.o.color, 0.16)})`,
          ...(pub.length ? ['linear-gradient(var(--holiday-public-cell), var(--holiday-public-cell))'] : []),
        ].join(', '),
      } : undefined}>
      <span className={s.num}>
        {d === 1 ? <><span className={s.monthTag}>{MONTHS[m - 1]}</span> </> : null}
        <span className={s.dot}>{d}</span>
        {icons.length > 0 && (
          <span className={s.hEmoji} aria-hidden title={[...pub.map((h) => h.name), ...market.map((m) => m.name), ...withEmoji.map((o) => o.title)].join(', ')}>{icons.map((x) => x.emoji).join('')}</span>
        )}
      </span>
      {data?.weather && <span className={s.wx} aria-hidden title={data.weather.words}>{data.weather.emoji}</span>}
      {lanes > 0 && <span aria-hidden style={{ height: lanes * (barH + 1), flex: 'none' }} />}
      {narrow ? (
        <span className={s.dots}>
          {dotted.slice(0, 4).map((o, k) => <i key={k} style={{ background: o.color }} />)}
          {dotted.length > 4 && <b>+</b>}
        </span>
      ) : (
        <span className={s.chips}>
          {single.slice(0, 3 - Math.min(lanes, 2)).map((o, k) => (
            <span key={k} className={s.ev} style={{ borderLeftColor: o.color }}>
              {o.startTime ? `${o.startTime} ` : ''}{o.emoji ? `${o.emoji} ` : ''}{o.title}
            </span>
          ))}
          {single.length > 3 - Math.min(lanes, 2) && <span className="badge neutral">+{single.length - (3 - Math.min(lanes, 2))}</span>}
        </span>
      )}
    </button>
  );
}
