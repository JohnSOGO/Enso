// MOJOSOGO-PREFERENCES "Modals": native <dialog> + showModal, explicitly centred, scrolls internally,
// titled, dirty form asks before closing, focus returns to the opener, failures render inside.
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import s from './Modal.module.css';

interface Props {
  title: string;
  onClose: () => void;
  dirty?: boolean;
  /** Asked instead of "Discard your changes?" when `dirty` is set. */
  confirmCloseText?: string;
  error?: string | null;
  footer?: ReactNode;
  children: ReactNode;
}

export function Modal({ title, onClose, dirty = false, confirmCloseText = 'Discard your changes?', error, footer, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const errRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => opener?.focus?.();
  }, []);

  useEffect(() => {
    if (error) errRef.current?.scrollIntoView({ block: 'nearest' });
  }, [error]);

  const requestClose = () => {
    if (dirtyRef.current && !confirm(confirmCloseText)) return;
    onClose();
  };

  // SPEC §8 iPhone rules: rendered at the document root, never inside a screen's scroll container.
  return createPortal(
    <dialog
      ref={ref}
      className={s.dialog}
      aria-label={title}
      onCancel={(e) => { e.preventDefault(); requestClose(); }}
      onClick={(e) => { if (e.target === ref.current) requestClose(); }}
    >
      <div className={s.panel}>
        <header className={s.head}>
          <h2 className={s.title}>{title}</h2>
          <button className="plain" aria-label="Close" title="Close" onClick={requestClose}>✕</button>
        </header>
        <div className={s.body}>
          {error && <div ref={errRef} role="alert" className="alert-error">{error}</div>}
          {children}
        </div>
        {footer && <footer className={s.foot}>{footer}</footer>}
      </div>
    </dialog>,
    document.body,
  );
}
