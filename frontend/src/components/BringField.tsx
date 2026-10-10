// SPEC §7.10, §8.4 — an event's Things to bring: one line each with ✕, then the add box (Enter or ＋ Add, cleaned by
// cleanBring so a repeat is never added). value/onChange only; keeps just the add box's draft, never saves.
import { useState } from 'react';
import { EVENT_BRING_ITEM_MAX, EVENT_BRING_MAX } from '../../../src/shared/alert-limits';
import { cleanBring } from '../../../src/shared/bring';

export function BringField({ value, onChange }: { value: string[]; onChange: (bring: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => { onChange(cleanBring([...value, draft]) ?? value); setDraft(''); };
  return (
    <div className="field" role="group" aria-label="Things to bring">
      <span>Things to bring (optional)</span>
      {value.map((line, i) => (
        <div key={line} className="row" style={{ marginTop: 4 }}>
          <span style={{ flex: 1 }}>• {line}</span>
          <button type="button" aria-label={`Remove ${line}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      {value.length < EVENT_BRING_MAX ? (
        <div className="row" style={{ marginTop: 4 }}>
          <input style={{ flex: 1 }} value={draft} maxLength={EVENT_BRING_ITEM_MAX} placeholder="Add something to bring"
            onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
          <button type="button" disabled={!draft.trim()} onClick={add}>＋ Add</button>
        </div>
      ) : <p className="muted" style={{ marginTop: 4 }}>That's the most a list holds ({EVENT_BRING_MAX}).</p>}
    </div>
  );
}
