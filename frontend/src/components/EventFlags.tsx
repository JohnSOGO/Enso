// SPEC §8.4, §7.5 — the event form's flag boxes: Optional (each person turns it on).
export interface FlagsValue { optional: boolean }

export function EventFlags({ value, onChange }: { value: FlagsValue; onChange: (c: Partial<FlagsValue>) => void }) {
  return (
    <label className="row" style={{ marginBottom: 12, minHeight: 44 }}>
      <input type="checkbox" checked={value.optional} onChange={(e) => onChange({ optional: e.target.checked })} /> Optional — each person turns it on
    </label>
  );
}
