// SPEC §8.4 — the event form's flag boxes: 🔒 Private (§6.3, needs someone going) and Optional (§7.5).
export interface FlagsValue { optional: boolean; private: boolean; assignedTo: string[] }

export function EventFlags({ value, onChange }: { value: FlagsValue; onChange: (c: Partial<FlagsValue>) => void }) {
  const nobody = value.assignedTo.length === 0; // ⚑ Q383: an event for nobody is everyone's
  return (
    <>
      <label className="row" style={{ marginBottom: 12, minHeight: 44 }}>
        <input type="checkbox" checked={value.private && !nobody} disabled={nobody} onChange={(e) => onChange({ private: e.target.checked })} />
        🔒 Private — only the people going see it{nobody && <span className="muted"> (tick who's going)</span>}
      </label>
      <label className="row" style={{ marginBottom: 12, minHeight: 44 }}>
        <input type="checkbox" checked={value.optional} onChange={(e) => onChange({ optional: e.target.checked })} /> Optional — each person turns it on
      </label>
    </>
  );
}
