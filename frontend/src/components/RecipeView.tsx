// SPEC §8.12 — one recipe (modal): the thumbnail and ▶ link to the video, servings and time, the source
// note with any "captions couldn't be read" marker, ingredients with pick boxes → Add to Shopping (one
// POST /lists/{SHOPPING_LIST_ID}/items per ingredient, in order; the summary inside ⚑ Q69), the steps, ✎.
import { useState } from 'react';
import { Modal } from './Modal';
import { errorText, post } from '../api';
import { SHOPPING_LIST_ID } from '../../../src/shared/lists';
import type { Recipe } from '../../../src/shared/recipes';
import s from './Recipes.module.css';

/** ⚑ Q64 — what the recipe was read from, plus why the captions couldn't be read when they couldn't. */
function sourceNote(r: Recipe): string {
  if (r.source.includes('typed')) return 'Typed by hand';
  const read = r.source.length ? `From the ${r.source.join(' and ')}` : "Nothing in the video's text to read";
  return r.captionsError ? `${read} · captions couldn't be read: ${r.captionsError}` : read;
}

/** "Added 4 · Milk already on the list" — the parts that apply. */
const summary = (added: string[], there: string[]) => [
  added.length ? `Added ${added.length}` : '',
  there.length ? `${there.join(', ')} already on the list` : '',
].filter(Boolean);

export function RecipeView({ recipe: r, onEdit, onClose }: { recipe: Recipe; onEdit: () => void; onClose: () => void }) {
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toggle = (i: number) => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));

  async function addToShopping() {
    const items = r.ingredients.filter((_, i) => picked.includes(i));
    const added: string[] = [], there: string[] = [];
    setBusy(true); setSaid(null); setError(null);
    try {
      for (let i = 0; i < items.length; i++) {
        try {
          const res = await post<{ result: string }>(`/lists/${SHOPPING_LIST_ID}/items`, { text: items[i] });
          (res.result === 'existing' ? there : added).push(items[i]);
        } catch (e) {
          setError([...summary(added, there), `Not added: ${items.slice(i).join(', ')} — ${errorText(e)}`].join(' · '));
          return;
        }
      }
      setSaid(summary(added, there).join(' · '));
      setPicked([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={r.title} onClose={onClose} error={error}
      footer={<><button onClick={onEdit} disabled={busy}>✎ Edit</button><button onClick={onClose}>Close</button></>}>
      {r.videoId && r.watchUrl && (
        <>
          {r.thumbnailUrl && (
            <a className={s.hero} href={r.watchUrl} target="_blank" rel="noopener noreferrer" aria-label="Watch the video on YouTube">
              <img src={r.thumbnailUrl} alt="" referrerPolicy="no-referrer" />
            </a>
          )}
          {!r.found && <p className={s.missing}>Recipe not in the video's text — watch it</p>}
          <a className={`go ${s.watch}`} style={{ padding: '0 12px' }} href={r.watchUrl} target="_blank" rel="noopener noreferrer">
            ▶ Watch on YouTube
          </a>
          {r.channel && <span className="muted"> · {r.channel}</span>}
        </>
      )}
      {(r.servings || r.time) && <p>{[r.servings && `Serves: ${r.servings}`, r.time && `Time: ${r.time}`].filter(Boolean).join(' · ')}</p>}
      <p className={`muted ${s.note}`}>{sourceNote(r)}</p>

      {r.ingredients.length > 0 && (
        <>
          <h3 className={s.section}>Ingredients</h3>
          <fieldset disabled={busy}>
            <ul className={s.picks}>
              {r.ingredients.map((text, i) => (
                <li key={i}><label><input type="checkbox" checked={picked.includes(i)} onChange={() => toggle(i)} /> {text}</label></li>
              ))}
            </ul>
            <div className="row wrap">
              <button className="chip" style={{ minHeight: 44, padding: '4px 12px' }}
                onClick={() => setPicked(r.ingredients.map((_, i) => i))}>Pick all</button>
              <button className="primary" disabled={!picked.length} onClick={addToShopping}>
                {busy ? 'Adding…' : `Add to Shopping (${picked.length})`}
              </button>
            </div>
          </fieldset>
          {said && <p className={s.said} role="status">{said}</p>}
        </>
      )}
      {r.steps.length > 0 && (
        <>
          <h3 className={s.section}>Steps</h3>
          <ol className={s.steps}>{r.steps.map((text, i) => <li key={i}>{text}</li>)}</ol>
        </>
      )}
    </Modal>
  );
}
