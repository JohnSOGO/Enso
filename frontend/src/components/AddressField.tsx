// SPEC §7.9, §8.4 — an event's Address box and, when it holds an address, Open in Maps (⚑ Q193). The fill bar's
// 📋 Paste fills it with the rest of the form. value/onChange only; holds no form state, never saves.
import { EVENT_ADDRESS_MAX } from '../../../src/shared/alert-limits';

export function AddressField({ value, onChange }: { value: string; onChange: (address: string) => void }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label className="field" style={{ marginBottom: 0 }}><span>Address (optional)</span>
        <input value={value} maxLength={EVENT_ADDRESS_MAX} onChange={(e) => onChange(e.target.value)} />
      </label>
      {value.trim() && (
        <a href={`https://maps.apple.com/?q=${encodeURIComponent(value.trim())}`} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 4 }}>
          Open in Maps
        </a>
      )}
    </div>
  );
}
