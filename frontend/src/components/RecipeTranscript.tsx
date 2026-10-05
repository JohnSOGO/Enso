// SPEC §8.12, §7E.2b — the transcript, given by hand: in the view on a video or link recipe (§7E.6) that is "watch it"
// or whose captions couldn't be read, and in the edit form on any recipe (⚑ Q173): 📷 screenshots of YouTube's transcript panel (1–SCREENSHOTS_MAX, shrunk to JPEG on
// the phone like a thing's photo, read and never stored), or — collapsed below — its text pasted into a box that
// grows. Read it → POST /recipes/{id}/transcript; the refusal shows in place; the re-read recipe goes back to
// the parent.
import { useEffect, useRef, useState } from 'react';
import { Grow } from './Grow';
import { errorText, post } from '../api';
import type { Recipe } from '../../../src/shared/recipes';
import { SCREENSHOTS_MAX, type Screenshot } from '../../../src/shared/recipe-reading';
import s from './Recipes.module.css';

interface Shot { blob: Blob; url: string }

/** A shrunk JPEG → the body's { type, data } (base64, no data: prefix). */
const toScreenshot = (blob: Blob) => new Promise<Screenshot>((ok, fail) => {
  const r = new FileReader();
  r.onload = () => ok({ type: 'image/jpeg', data: String(r.result).replace(/^data:[^,]*,/, '') });
  r.onerror = () => fail(new Error("Couldn't read that picture."));
  r.readAsDataURL(blob);
});

export function RecipeTranscript({ recipe: r, onChange }: { recipe: Recipe; onChange: (r: Recipe) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const live = useRef(true);
  const [shots, setShots] = useState<Shot[]>([]);
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState('');
  const [step, setStep] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const urls = useRef<string[]>([]);
  urls.current = shots.map((x) => x.url);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  async function picked(files: File[]) {
    if (!files.length) return;
    const room = SCREENSHOTS_MAX - shots.length;
    setError(null); setSaid(files.length > room ? `Only ${SCREENSHOTS_MAX} screenshots are read at a time; the rest were left out.` : null);
    setStep('Getting the screenshots ready…');
    const added: Shot[] = [];
    try {
      const { shrinkPhoto } = await import('../shrink-photo');
      for (const f of files.slice(0, room)) { const blob = await shrinkPhoto(f); added.push({ blob, url: URL.createObjectURL(blob) }); }
    } catch (e) {
      if (live.current) setError(errorText(e));
    }
    if (!live.current) { added.forEach((x) => URL.revokeObjectURL(x.url)); return; }
    setShots((was) => [...was, ...added]);
    setStep(null);
  }

  function remove(i: number) {
    URL.revokeObjectURL(shots[i].url);
    setShots((was) => was.filter((_, k) => k !== i));
  }

  async function read() {
    setError(null); setSaid(null); setStep('Reading…');
    try {
      const screenshots = await Promise.all(shots.map((x) => toScreenshot(x.blob)));
      const updated = await post<Recipe>(`/recipes/${r.id}/transcript`, { screenshots, ...(text.trim() ? { text } : {}) });
      if (!live.current) return;
      shots.forEach((x) => URL.revokeObjectURL(x.url));
      setShots([]); setText(''); setPasting(false);
      onChange(updated);
    } catch (e) {
      if (live.current) setError(errorText(e));
    } finally {
      if (live.current) setStep(null);
    }
  }

  const busy = !!step;
  return (
    <div className={s.transcript}>
      <input ref={input} type="file" accept="image/*" multiple className="visually-hidden" tabIndex={-1} aria-hidden
        onChange={(e) => { picked([...(e.target.files ?? [])]); e.target.value = ''; }} />
      <button type="button" disabled={busy || shots.length >= SCREENSHOTS_MAX} onClick={() => input.current?.click()}>
        {shots.length ? '📷 Add another screenshot' : r.videoId ? '📷 Add transcript screenshots' : '📷 Add screenshots'}
      </button>
      <p className={`muted ${s.hint}`}>
        {r.videoId ? 'On YouTube: ⋯ → Show transcript, then screenshot it.'
          : r.link ? "Screenshot the post's caption or the recipe, then add it here." : 'Screenshot or photograph the recipe, then add it here.'}
      </p>
      {shots.length > 0 && (
        <ul className={s.shots}>
          {shots.map((x, i) => (
            <li key={x.url}>
              <img src={x.url} alt={`Transcript screenshot ${i + 1}`} />
              <button type="button" className="plain" disabled={busy} aria-label={`Remove screenshot ${i + 1}`} onClick={() => remove(i)}>✕</button>
            </li>
          ))}
        </ul>
      )}
      {pasting ? (
        <label className={`field ${s.pasted}`}>
          <span>Or paste the transcript's text</span>
          <Grow value={text} disabled={busy} onChange={(e) => setText(e.target.value)} />
        </label>
      ) : (
        <button type="button" className={`plain ${s.orPaste}`} disabled={busy} onClick={() => setPasting(true)}>or paste the text</button>
      )}
      {(shots.length > 0 || text.trim()) && (
        <>
          {r.found && <p className={s.hint}>This replaces the ingredients and steps shown.</p>}
          <button type="button" className="primary" disabled={busy} onClick={read}>{step === 'Reading…' ? 'Reading…' : 'Read it'}</button>
        </>
      )}
      {step && <p className="muted" role="status">{step}</p>}
      {said && <p className="muted" role="status">{said}</p>}
      {error && <div role="alert" className="alert-error">{error}</div>}
    </div>
  );
}
