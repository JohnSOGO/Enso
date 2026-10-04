// SPEC §8.11, §8.12 — a textarea that grows to fit its text, never scrolling inside: re-measured when the
// text changes (typed, or filled by a photo reading) and when its width does (the dialog opening, the phone turning).
import { useEffect, useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

/** A textarea that grows to fit its text (§8.11). `oneLine`: Enter does nothing and pasted line breaks become spaces (Title, Link ⚑). */
export function Grow({ value, oneLine, onChange, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; oneLine?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el || !el.clientWidth) return; // not laid out yet (the dialog is still closed)
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  };
  useLayoutEffect(fit, [value]);
  useEffect(() => {
    let width = 0;
    const ro = new ResizeObserver(([e]) => { if (e.contentRect.width !== width) { width = e.contentRect.width; fit(); } });
    ro.observe(ref.current!);
    return () => ro.disconnect();
  }, []);
  return <textarea ref={ref} rows={1} value={value} style={{ overflow: 'hidden', resize: 'none' }} {...rest}
    onKeyDown={oneLine ? (e) => { if (e.key === 'Enter') e.preventDefault(); } : rest.onKeyDown}
    onChange={(e) => { if (oneLine && /[\r\n]/.test(e.target.value)) e.target.value = e.target.value.replace(/\s*[\r\n]+\s*/g, ' '); onChange?.(e); }} />;
}
