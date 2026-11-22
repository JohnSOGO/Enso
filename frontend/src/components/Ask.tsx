// SPEC §8 "Asking and telling" — the in-app confirm: one dark sheet in place of every browser confirm().
// AskHost is mounted once by main.tsx and holds the one open question; useAsk() → ask(text) → Promise<boolean>.
// It renders its own <dialog> (never Modal, which asks through it), so it stays a dialog[open] and holds reloads (§8.10).
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import s from './Ask.module.css';

/** UI-only tone of a question: a risky step (delete, revoke, discard) is a warning. */
type Tone = 'confirm' | 'warning';
interface AskOpts { tone?: Tone; ok?: string; no?: string }
interface Question extends AskOpts { text: string; answer: (yes: boolean) => void }
type Ask = (text: string, opts?: AskOpts) => Promise<boolean>;

const AskCtx = createContext<Ask | null>(null);

/** Words that make a question a warning without the caller saying so. */
const RISKY = /\b(delete|revoke|discard|clear|close|remove)\b/i;

export function AskHost({ children }: { children: ReactNode }) {
  const [q, setQ] = useState<Question | null>(null);
  const ask = useCallback<Ask>((text, opts = {}) => new Promise<boolean>((resolve) => {
    setQ({ text, ...opts, answer: (yes) => { setQ(null); resolve(yes); } });
  }), []);
  return (
    <AskCtx.Provider value={ask}>
      {children}
      {q && <AskSheet q={q} />}
    </AskCtx.Provider>
  );
}

/** The ask function. Outside an AskHost (a test rendering one component) it falls back to "no". */
export function useAsk(): Ask {
  return useContext(AskCtx) ?? (async () => false);
}

function AskSheet({ q }: { q: Question }) {
  const ref = useRef<HTMLDialogElement>(null);
  const tone: Tone = q.tone ?? (RISKY.test(q.text) ? 'warning' : 'confirm');
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => opener?.focus?.();
  }, []);
  return createPortal(
    <dialog ref={ref} className={s.sheet} aria-label={q.text}
      onCancel={(e) => { e.preventDefault(); q.answer(false); }}
      onClick={(e) => { if (e.target === ref.current) q.answer(false); }}>
      <span className={`${s.badge} ${tone === 'warning' ? s.warning : ''}`}>{tone === 'warning' ? 'WARNING' : 'CONFIRM'}</span>
      <p className={s.text}>{q.text}</p>
      <div className={s.buttons}>
        <button onClick={() => q.answer(false)}>{q.no ?? 'No'}</button>
        <button autoFocus className={tone === 'warning' ? 'danger' : 'primary'} onClick={() => q.answer(true)}>{q.ok ?? 'Yes'}</button>
      </div>
    </dialog>,
    document.body,
  );
}
