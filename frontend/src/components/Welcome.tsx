// SPEC §8.9, Q19/Q21 — the one-time welcome card, right after joining; remembered per member per device.
import { useState } from 'react';
import type { Me } from '../state';
import { Modal } from './Modal';

const seenKey = (memberId: string) => `enso.welcomed.${memberId}`;

function seen(memberId: string): boolean {
  try { return localStorage.getItem(seenKey(memberId)) !== null; } catch { return false; }
}

export function Welcome({ me }: { me: Me }) {
  const [open, setOpen] = useState(() => !seen(me.id));
  if (!open) return null;

  const gotIt = () => {
    try { localStorage.setItem(seenKey(me.id), '1'); } catch { /* storage blocked: dismissed for this session only */ }
    setOpen(false);
  };

  return (
    <Modal title={`Welcome, ${me.displayName} 👋`} onClose={gotIt} footer={<button className="primary" onClick={gotIt}>Got it</button>}>
      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <li><span aria-hidden>📅</span> <b>Calendar</b> — what's happening</li>
        <li><span aria-hidden>⏰</span> <b>Alarms</b> — alarms, timers and chores</li>
        <li><span aria-hidden>🛒</span> <b>Lists → Today</b> — your chores for today</li>
      </ul>
    </Modal>
  );
}
