// SPEC §8.4a — may Ensō use a model on SogoAI right now? One GET /state to the PC model manager (SogoAI's one gate for
// model actions, 127.0.0.1:8793, local only, no key) → ready only when it answers, no model action is running (`busy`
// null) and the model is already loaded (`mem.lmStudio[].identifier`). Never takes a lease (a lease starts ComfyUI and
// sets its shared last model), never loads or unloads. Never throws. Node globals only (§2.5); no node:http.

export const MODEL_MANAGER_URL = 'http://127.0.0.1:8793';
/** ⚑ Q370 — how long the helper waits for the manager. */
export const MODEL_MANAGER_TIMEOUT_MS = 2_000;

export type ModelReady = { ok: true } | { ok: false; kind: 'off' | 'busy'; reason: string };

interface ManagerState { busy?: unknown; mem?: { lmStudio?: { identifier?: unknown }[] } }

/** No answer → `off`; a model action running, or the model not loaded → `busy`. */
export async function modelReady(model: string, opts: { fetch: typeof fetch }): Promise<ModelReady> {
  let state: ManagerState;
  try {
    const res = await opts.fetch(`${MODEL_MANAGER_URL}/state`, { signal: AbortSignal.timeout(MODEL_MANAGER_TIMEOUT_MS) });
    if (res.status < 200 || res.status >= 300) return { ok: false, kind: 'off', reason: `The model manager answered HTTP ${res.status}.` };
    state = (await res.json()) as ManagerState;
  } catch (e) {
    return { ok: false, kind: 'off', reason: `The model manager isn't answering (${e instanceof Error && e.message ? e.message : String(e)}).` };
  }
  if (state?.busy) return { ok: false, kind: 'busy', reason: 'The model manager is changing models.' };
  const loaded = Array.isArray(state?.mem?.lmStudio) && state.mem.lmStudio.some((m) => m?.identifier === model);
  return loaded ? { ok: true } : { ok: false, kind: 'busy', reason: `${model} isn't loaded in LM Studio.` };
}
