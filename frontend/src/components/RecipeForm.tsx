// SPEC §8.12 — the recipe form (modal): title, ingredients and steps one per line, servings, time; Save /
// Cancel / Delete (asks). Fixes a read recipe or types a new one (no video, ⚑ Q68). Validation and found
// are the server's (§7E.3); a video's own fields are not editable. An existing recipe can also be re-read from
// screenshots or pasted text here (RecipeTranscript, ⚑ Q173); the re-read recipe is handed back as saved. The
// picture (⚑ Q175) is picked like a thing's photo, nothing read, and PUT or DELETEd after the fields on Save.
import { useState } from 'react';
import { Modal } from './Modal';
import { Grow } from './Grow';
import { RecipeTranscript } from './RecipeTranscript';
import { PhotoField } from './PhotoField';
import { apiUrl, del, errorText, get, patch, post, upload } from '../api';
import { RECIPE_TITLE_MAX, SERVINGS_MAX, TIME_MAX, recipePhotoPath, type Recipe } from '../../../src/shared/recipes';
import s from './Recipes.module.css';

const formOf = (r: Recipe | null) => ({
  title: r?.title ?? '', ingredients: r?.ingredients.join('\n') ?? '', steps: r?.steps.join('\n') ?? '',
  servings: r?.servings ?? '', time: r?.time ?? '',
});
const linesOf = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean);

interface Props { recipe: Recipe | null; onSaved: (r: Recipe) => void; onDeleted: () => void; onClose: () => void }

export function RecipeForm({ recipe, onSaved, onDeleted, onClose }: Props) {
  const [init] = useState(() => formOf(recipe));
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The recipe as saved: a new one becomes saved when its POST succeeds, even if the picture then fails. */
  const [saved, setSaved] = useState(recipe);
  const [pending, setPending] = useState<Blob | null>(null);
  const [removed, setRemoved] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(init) || !!pending || removed;
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  const save = () => run(async () => {
    const b = {
      title: f.title, ingredients: linesOf(f.ingredients), steps: linesOf(f.steps),
      servings: f.servings.trim() || null, time: f.time.trim() || null,
    };
    const r = saved ? await patch<Recipe>(`/recipes/${saved.id}`, b) : await post<Recipe>('/recipes', b);
    setSaved(r);
    if (!pending && !removed) return onSaved(r);
    try {
      if (pending) await upload('PUT', `/recipes/${r.id}/photo`, pending);
      else await del(`/recipes/${r.id}/photo`);
    } catch (e) {
      throw new Error(`Saved, but the picture didn't save: ${errorText(e)} Tap Save to try the picture again.`);
    }
    onSaved(await get<Recipe>(`/recipes/${r.id}`)); // hasPhoto and updatedAt after the picture change
  });
  const remove = () => {
    if (recipe && confirm(`Delete “${recipe.title}”?`)) run(async () => { await del(`/recipes/${recipe.id}`); onDeleted(); });
  };

  return (
    <Modal title={recipe ? `Edit: ${recipe.title}` : 'New recipe'} onClose={onClose} dirty={dirty} error={error}
      footer={<>
        <button className="primary" disabled={busy || !f.title.trim()} onClick={save}>Save</button>
        <button onClick={onClose} disabled={busy}>Cancel</button>
        {recipe && <button className="danger" disabled={busy} onClick={remove}>Delete</button>}
      </>}>
      <PhotoField savedSrc={recipe?.hasPhoto && !removed ? apiUrl(recipePhotoPath(recipe)) : null} pending={pending}
        alt="The recipe's picture" onPick={(p) => { setPending(p); setRemoved(false); }}
        onRemove={() => { setPending(null); setRemoved(!!recipe?.hasPhoto); }} />
      <fieldset disabled={busy}>
        {recipe?.videoTitle && <p className="muted" style={{ marginBottom: 10 }}>From the video: {recipe.videoTitle}</p>}
        <label className="field"><span>Title</span>
          <Grow oneLine value={f.title} maxLength={RECIPE_TITLE_MAX} onChange={(e) => set('title', e.target.value)} autoFocus={!recipe} />
        </label>
        <label className="field"><span>Ingredients — one per line</span>
          <Grow value={f.ingredients} onChange={(e) => set('ingredients', e.target.value)} />
        </label>
        <label className="field"><span>Steps — one per line</span>
          <Grow value={f.steps} onChange={(e) => set('steps', e.target.value)} />
        </label>
        <div className="row">
          <label className="field" style={{ flex: 1 }}><span>Servings</span>
            <input value={f.servings} maxLength={SERVINGS_MAX} onChange={(e) => set('servings', e.target.value)} />
          </label>
          <label className="field" style={{ flex: 1 }}><span>Time</span>
            <input value={f.time} maxLength={TIME_MAX} onChange={(e) => set('time', e.target.value)} />
          </label>
        </div>
      </fieldset>
      {recipe && (
        <>
          <h3 className={s.section}>Fill in from screenshots</h3>
          <RecipeTranscript recipe={recipe} onChange={onSaved} />
        </>
      )}
    </Modal>
  );
}
