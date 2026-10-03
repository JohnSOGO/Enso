// The Settings sections' action hook (SPEC §8.6).
import { useState } from 'react';
import { errorText } from '../api';

/** Runs an async action and renders its failure in place — never silently. */
export function useAction() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); return true; } catch (e) { setError(errorText(e)); return false; } finally { setBusy(false); }
  };
  const errorEl = error ? <div role="alert" className="alert-error">{error}</div> : null;
  return { run, busy, errorEl };
}
