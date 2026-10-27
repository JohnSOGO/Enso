// SPEC §8.3, §7.14 — why a fishing window got its 🎣: the reasons in plain words, the day's 🐟 events, and the spot's
// public site at the bottom. The words are src/shared/fishing.ts fishingReasons.
import { Modal } from './Modal';
import { fishingReasons, type FishEvent, type FishingWindow } from '../../../src/shared/fishing';
import { clockText, utcToLocal } from '../../../src/shared/time';
import s from './Lists.module.css';

interface Props { w: FishingWindow; events: FishEvent[]; tz: string; h24: boolean; onClose: () => void }

export function FishingWhy({ w, events, tz, h24, onClose }: Props) {
  const { headline, lines } = fishingReasons(w, tz, h24);
  const hm = (iso: string) => clockText(utcToLocal(iso, tz).time, h24);
  return (
    <Modal title={headline} onClose={onClose}
      footer={<a className="go" style={{ padding: '0 12px' }} href={w.spot.link} target="_blank" rel="noopener noreferrer">Visit {w.spot.name} ↗</a>}>
      <p className={s.holiday}>{hm(w.from)}–{hm(w.to)} at {w.spot.name}</p>
      <ul className={s.list} style={{ listStyle: 'none', padding: 0 }}>
        {lines.map((l) => <li key={l.text} style={{ display: 'flex', gap: 8, marginBottom: 8 }}><span>{l.emoji}</span><span>{l.text}</span></li>)}
        {events.map((e) => <li key={e.title} style={{ display: 'flex', gap: 8, marginBottom: 8 }}><span>{e.emoji}</span><span>Also that day: {e.title}</span></li>)}
      </ul>
    </Modal>
  );
}
