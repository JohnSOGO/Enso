// SPEC §8.12, §7E.5 — my emoji on a recipe, in the recipe view: the household's emojis as chips (usedEmojis,
// ⚑ Q72), a one-emoji input with Set, and Clear when I have one → PUT / DELETE /recipes/{id}/emoji. The rule
// is the server's (emojiError); its refusal shows in place. Hands the updated recipe back to its parent.
import { useState, type FormEvent } from 'react';
import { del, errorText, put } from '../api';
import { useApp } from '../state';
import { myEmoji, usedEmojis, type Recipe } from '../../../src/shared/recipes';
import s from './Recipes.module.css';

export function RecipeEmoji({ recipe, recipes, onChange }: { recipe: Recipe; recipes: Recipe[]; onChange: (r: Recipe) => void }) {
  const { me } = useApp();
  const mine = myEmoji(recipe, me.id);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chips = usedEmojis(recipes);

  async function save(emoji: string | null) {
    setBusy(true); setError(null);
    try {
      const path = `/recipes/${recipe.id}/emoji`;
      onChange(emoji === null ? await del<Recipe>(path) : await put<Recipe>(path, { emoji }));
      setText('');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const set = (e: FormEvent) => { e.preventDefault(); if (text.trim()) save(text.trim()); };

  return (
    <fieldset className={s.mine} disabled={busy}>
      <legend className={s.mineLabel}>Your emoji</legend>
      {chips.length > 0 && (
        <div className="row wrap">
          {chips.map((e) => (
            <button key={e} type="button" className={`chip ${s.pick}`} aria-pressed={e === mine} aria-label={`Use ${e}`}
              onClick={() => { if (e !== mine) save(e); }}>{e}</button>
          ))}
        </div>
      )}
      <form className={s.emojiSet} onSubmit={set}>
        <input aria-label="An emoji of your own" placeholder={mine ?? '🌶'} value={text} autoComplete="off"
          onChange={(e) => setText(e.target.value)} />
        <button disabled={!text.trim()}>Set</button>
        {mine && <button type="button" onClick={() => save(null)}>Clear</button>}
      </form>
      {error && <div role="alert" className="alert-error">{error}</div>}
    </fieldset>
  );
}
