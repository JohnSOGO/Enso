// SPEC §8.12 — the recipe form (modal): title, ingredients and steps one per line, servings, time; Save /
// Cancel / Delete (asks). Fixes a read recipe or types a new one (no video, ⚑ Q68). Validation and found
// are the server's (§7E.3); a video's own fields are not editable.
import { useState } from 'react';
import { Modal } from './Modal';
import { Grow } from './Grow';
import { del, errorText, patch, post } from '../api';
import { RECIPE_TITLE_MAX, SERVINGS_MAX, TIME_MAX, type Recipe } from '../../../src/shared/recipes';

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
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
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
    onSaved(recipe ? await patch<Recipe>(`/recipes/${recipe.id}`, b) : await post<Recipe>('/recipes', b));
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
    </Modal>
  );
}
