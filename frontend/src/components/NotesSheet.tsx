// SPEC §8.4a — the notes sheet: NotesField (a form's notes box with ⤢) and NotesSheet (a `full` Modal that reads the
// notes with markNotes highlights and ☐/☑ tap to tick, or edits them with • List / ☐ Box and the list going on at Enter).
// Saves nothing: Done hands the text back to the form, whose Save stays the only save. Used by EventForm and ItemForm.
import { useLayoutEffect, useRef, useState } from 'react';
import { Modal } from './Modal';
import { markHref, markNotes } from '../notes-marks';
import { continueList, tickLine, toggleBox, toggleBullet, BOX, TICKED, type Edit } from '../notes-edit';
import s from './NotesSheet.module.css';

interface FieldProps {
  label: string; title: string; value: string; max: number; rows?: number;
  /** false: the box is read only and the sheet opens in read mode only (§6.3). */
  canChange: boolean;
  onChange: (v: string) => void;
}

/** The form's notes box, with ⤢ for the sheet. Sits outside the form's disabled fieldset so ⤢ works read only too. */
export function NotesField({ label, title, value, max, rows = 2, canChange, onChange }: FieldProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="field" style={{ marginBottom: 12 }}>
      <div className={s.label}>
        <span>{label}</span>
        <button type="button" className="plain" aria-label="Open notes full screen" title="Open notes full screen" onClick={() => setOpen(true)}>⤢</button>
      </div>
      <textarea aria-label={label} rows={rows} value={value} maxLength={max} disabled={!canChange} onChange={(e) => onChange(e.target.value)} />
      {open && <NotesSheet title={title} value={value} max={max} canChange={canChange} onDone={(v) => { if (v !== value) onChange(v); setOpen(false); }} />}
    </div>
  );
}

interface SheetProps { title: string; value: string; max: number; canChange: boolean; onDone: (v: string) => void }

export function NotesSheet({ title, value, max, canChange, onDone }: SheetProps) {
  const [text, setText] = useState(value);
  const [editing, setEditing] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const sel = useRef<{ start: number; end: number } | null>(null);

  // Puts the selection back after a toolbar or Enter change re-renders the text.
  useLayoutEffect(() => {
    const el = area.current, at = sel.current;
    if (el && at) { el.setSelectionRange(at.start, at.end); sel.current = null; }
  }, [text]);

  const apply = (e: Edit | null) => {
    if (!e || e.text.length > max) return false; // §8.4a: a change past the limit does nothing
    sel.current = { start: e.start, end: e.end };
    setText(e.text);
    return true;
  };
  const tool = (fn: (t: string, a: number, b: number) => Edit) => () => {
    const el = area.current;
    if (el) { apply(fn(text, el.selectionStart, el.selectionEnd)); el.focus(); }
  };

  const marks = (t: string) => markNotes(t).map((seg, i) => {
    if (!seg.mark) return seg.text;
    const href = markHref(seg), cls = `${s.mark} ${s[seg.mark]}`;
    return href
      ? <a key={i} className={cls} href={href} target={seg.mark === 'link' ? '_blank' : undefined} rel="noreferrer">{seg.text}</a>
      : <mark key={i} className={cls}>{seg.text}</mark>;
  });

  /** One line of the read mode: a ☐ / ☑ line's box ticks on tap when the member can change the notes (Q363). */
  const line = (l: string, n: number) => {
    const ticked = l.startsWith(TICKED), box = ticked || l.startsWith(BOX);
    if (!box) return <div key={n} className={s.line}>{l ? marks(l) : '\u00a0'}</div>;
    const mark = l.slice(0, 1);
    return (
      <div key={n} className={ticked ? `${s.line} ${s.ticked}` : s.line}>
        {canChange
          ? <button type="button" className={`plain ${s.tick}`} aria-label={ticked ? 'Untick' : 'Tick'} onClick={() => setText(tickLine(text, n))}>{mark}</button>
          : <span className={s.tick}>{mark}</span>}
        {' '}<span className={s.rest}>{marks(l.slice(2))}</span>
      </div>
    );
  };

  return (
    <Modal full title={`📝 Notes: ${title}`} onClose={() => onDone(text)}
      footer={<>
        {canChange && (editing
          ? <button onClick={() => setEditing(false)}>👁 View</button>
          : <button onClick={() => setEditing(true)}>✏️ Edit</button>)}
        <button className="primary" onClick={() => onDone(text)}>Done</button>
      </>}>
      {editing ? (
        <div className={s.edit}>
          <div className="row" role="toolbar" aria-label="Notes tools">
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={tool(toggleBullet)}>• List</button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={tool(toggleBox)}>☐ Box</button>
            <span className="muted" style={{ marginLeft: 'auto', fontSize: '.8rem' }}>{text.length}/{max}</span>
          </div>
          <textarea ref={area} aria-label="Notes" className={s.area} value={text} maxLength={max} autoFocus
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
              const el = e.currentTarget;
              if (el.selectionStart === el.selectionEnd && apply(continueList(text, el.selectionStart))) e.preventDefault();
            }} />
        </div>
      ) : (
        <div className={s.read}>{text ? text.split('\n').map(line) : <p className="muted">No notes yet.</p>}</div>
      )}
    </Modal>
  );
}
