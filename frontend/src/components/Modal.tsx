// MOJOSOGO-PREFERENCES "Modals": native <dialog> + showModal, centred (a bottom sheet on a phone, §8), scrolls internally,
// titled, dirty form asks before closing, focus returns to the opener, failures render inside.
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PointAtButton } from './PointAtButton';
import { useAsk } from './Ask';
import s from './Modal.module.css';

interface Props {
  title: string;
  onClose: () => void;
  dirty?: boolean;
  /** Asked instead of "Discard your changes?" when `dirty` is set. */
  confirmCloseText?: string;
  error?: string | null;
  footer?: ReactNode;
  /** The whole screen inside the iPhone's safe areas (§8.4a notes sheet). */
  full?: boolean;
  children: ReactNode;
}

export function Modal({ title, onClose, dirty = false, confirmCloseText = 'Discard your changes?', error, footer, full = false, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const errRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const ask = useAsk();

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const dialog = ref.current, body = bodyRef.current;
    dialog?.showModal();
    // SPEC §8 iPhone rules (Q318): open at the top. iOS focuses the first field, which can sit below a big picture.
    if (dialog && body) {
      body.scrollTop = 0;
      const f = document.activeElement;
      if (f instanceof HTMLElement && body.contains(f) && f.getBoundingClientRect().bottom > body.getBoundingClientRect().bottom) {
        dialog.focus({ preventScroll: true });
        body.scrollTop = 0;
      }
    }
    return () => opener?.focus?.();
  }, []);

  // §8 bottom sheet: on a phone the sheet rides above the on-screen keyboard (it covers the layout viewport's bottom).
  useEffect(() => {
    const vv = window.visualViewport, dialog = ref.current;
    if (!vv || !dialog || !matchMedia('(pointer: coarse)').matches) return;
    const lift = () => dialog.style.setProperty('--kb', `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`);
    vv.addEventListener('resize', lift); vv.addEventListener('scroll', lift); lift();
    return () => { vv.removeEventListener('resize', lift); vv.removeEventListener('scroll', lift); };
  }, []);

  useEffect(() => {
    if (error) errRef.current?.scrollIntoView({ block: 'nearest' });
  }, [error]);

  const requestClose = async () => {
    if (dirtyRef.current && !(await ask(confirmCloseText))) return;
    onClose();
  };

  // SPEC §8 iPhone rules: rendered at the document root, never inside a screen's scroll container.
  return createPortal(
    <dialog
      ref={ref}
      tabIndex={-1}
      className={full ? `${s.dialog} ${s.full}` : s.dialog}
      aria-label={title}
      onCancel={(e) => { e.preventDefault(); requestClose(); }}
      onClick={(e) => { if (e.target === ref.current) requestClose(); }}
    >
      <div className={s.panel}>
        <header className={s.head}>
          <h2 className={s.title}>{title}</h2>
          <PointAtButton />
          <button className="plain" aria-label="Close" title="Close" onClick={requestClose}>✕</button>
        </header>
        <div ref={bodyRef} className={s.body}>
          {error && <div ref={errRef} role="alert" className="alert-error">{error}</div>}
          {children}
        </div>
        {footer && <footer className={s.foot}>{footer}</footer>}
      </div>
    </dialog>,
    document.body,
  );
}
