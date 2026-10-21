// SPEC §7.9, §7.9b, §8.4 — an event's Address box and, when it holds an address, Open in Maps (⚑ Q193); under it the
// saved places (a picked place fills the Address and adds its arrival notes, placeOverForm). The fill bar's 📋 Paste
// fills it with the rest of the form. value/onChange only; holds no form state, never saves.
import { EVENT_ADDRESS_MAX } from '../../../src/shared/alert-limits';
import { placeOverForm } from '../../../src/shared/places';
import { PlacePicker } from './PlacePicker';

interface AddressValue { title: string; address: string; notes: string }

export function AddressField({ value, onChange }: { value: AddressValue; onChange: (change: Partial<AddressValue>) => void }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label className="field" style={{ marginBottom: 0 }}><span>Address (optional)</span>
        <input value={value.address} maxLength={EVENT_ADDRESS_MAX} onChange={(e) => onChange({ address: e.target.value })} />
      </label>
      {value.address.trim() && (
        <a href={`https://maps.apple.com/?q=${encodeURIComponent(value.address.trim())}`} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 4 }}>
          Open in Maps
        </a>
      )}
      <PlacePicker title={value.title} address={value.address} onPick={(p) => {
        const { form } = placeOverForm(value, p);
        onChange({ address: form.address, notes: form.notes });
      }} />
    </div>
  );
}
