// SPEC §7.1–7.2 — one calendar day cell: classes, stay tint, date line, weather, bar-lane gap, event marks.
import { useApp } from '../state';
import { dotSize, fitLines, LINE_GAP } from '../day-lines';
import type { DayData, Occurrence, Span } from './Calendar';
import s from './DayCell.module.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const isMultiDay = (o: Occurrence) => o.endDate > o.date;

/** '#RRGGBB' → rgba() with the given alpha. */
function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// Room the date line takes from a row: cell padding (3 + 2), the 22px number, the 2px gap after it.
const DATE_LINE = 29;

export function DayCell({ date, data, stay, lanes, barH, rowH, cellW, narrow, todayStr, onOpen }: {
  date: string; data: DayData | undefined; stay: Span | undefined; lanes: number; barH: number; rowH: number; cellW: number;
  narrow: boolean; todayStr: string; onOpen: (date: string, data: DayData | undefined) => void;
}) {
  const { me, memberById, clock } = useApp();
  const [y, m, d] = date.split('-').map(Number);
  const pub = me.showPublicHolidays ? data?.publicHolidays ?? [] : [];
  const market = me.showOptionsExpiration ? data?.marketDays ?? [] : [];
  const items = data?.items ?? [];
  const single = items.filter((o) => !isMultiDay(o)); // multi-day events are drawn as bars
  // §7.2 day icons beside the number: the holiday and 📈 only (an event's emoji leads its own line, §7.1).
  const icons = [...pub.slice(0, 1), ...market.slice(0, 1)];
  // §7.1 one line per single-day event: emoji, then a dot per participant; shrunk to fit, then +N.
  const room = rowH - DATE_LINE - (lanes > 0 ? lanes * (barH + 1) + 2 : 0);
  const fit = fitLines(room, single.length);
  const marks = (o: Occurrence) => o.assignedTo.length
    ? o.assignedTo.map((id) => memberById(id)?.color ?? o.color)
    : o.emoji ? [] : [o.color]; // Q273: nobody assigned → the emoji alone, else the event's own dot
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
          <span className={s.hEmoji} aria-hidden title={[...pub.map((h) => h.name), ...market.map((m) => m.name)].join(', ')}>{icons.map((x) => x.emoji).join('')}</span>
        )}
      </span>
      {data?.weather && <span className={s.wx} aria-hidden title={data.weather.words}>{data.weather.emoji}</span>}
      {lanes > 0 && <span aria-hidden style={{ height: lanes * (barH + 1), flex: 'none' }} />}
      <span className={s.lines} style={{ gap: LINE_GAP }}>
        {single.slice(0, fit.shown).map((o, k) => {
          const dots = marks(o);
          const size = dotSize(fit.lineH, dots.length, (narrow ? cellW - 4 : cellW / 3) - (o.emoji ? fit.lineH + 1 : 0));
          return (
            <span key={k} className={s.line} style={{ height: fit.lineH, fontSize: fit.lineH }}>
              {o.emoji && <span className={s.lEmoji}>{o.emoji}</span>}
              {dots.map((c, j) => <i key={j} style={{ width: size, height: size, background: c }} />)}
              {!narrow && <span className={s.title}>{o.startTime ? `${clock(o.startTime)} ` : ''}{o.title}</span>}
            </span>
          );
        })}
        {fit.more > 0 && <span className={s.more} style={{ height: fit.lineH, fontSize: fit.lineH }}>+{fit.more}</span>}
      </span>
    </button>
  );
}
