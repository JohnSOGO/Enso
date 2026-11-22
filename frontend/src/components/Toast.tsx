// SPEC §8 "Asking and telling" — toasts: a short line that something did not go through (an optimistic tap put back,
// S1UX 1.4) or went through. ToastHost is mounted once by main.tsx; useToast() → toast(text, { tone }).
// A role="status" region, never a <dialog>, so it never holds a reload (§8.10).
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import s from './Toast.module.css';

type Tone = 'bad' | 'good';
interface Item { id: number; text: string; tone: Tone }
type Toast = (text: string, opts?: { tone?: Tone }) => void;

const ToastCtx = createContext<Toast | null>(null);
/** How long a toast stays, in ms. */
const SHOW_MS = 4000;

export function ToastHost({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const toast = useCallback<Toast>((text, { tone = 'bad' } = {}) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-2), { id, text, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), SHOW_MS);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className={s.stack} role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`${s.toast} ${t.tone === 'bad' ? s.bad : s.good}`}>{t.tone === 'bad' ? '⚠' : '✓'} {t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** The toast function. Outside a ToastHost (a test rendering one component) it logs instead. */
export function useToast(): Toast {
  return useContext(ToastCtx) ?? ((text) => console.warn('toast', text));
}
