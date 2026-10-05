// SPEC §8.12 — the 🍳 Recipes tab: paste any recipe link → POST /recipes/from-link (its kind detected, §7E.6; saved at once, then its
// view opens ⚑ Q61; a link already read opens the existing recipe ⚑ Q63), ＋ Type a recipe, and the rows,
// newest first (thumbnail, my emoji, dish, "watch it" when nothing was found ⚑ Q62), or By emoji (byMyEmoji,
// §7E.5; the choice kept on this phone ⚑ Q74). Rules are the server's and shared/recipes.ts's (§7E).
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { RecipeView } from './RecipeView';
import { RecipeForm } from './RecipeForm';
import { ApiError, errorText, get, post } from '../api';
import { useApp } from '../state';
import { byMyEmoji, myEmoji } from '../../../src/shared/recipe-emoji';
import { recipeLinkOf } from '../../../src/shared/recipe-link';
import type { Recipe } from '../../../src/shared/recipes';
import ls from './Lists.module.css';
import s from './Recipes.module.css';

const SORTS = [['newest', 'Newest'], ['emoji', 'By emoji']] as const;
type Sort = (typeof SORTS)[number][0];
const SORT_KEY = 'enso.recipeSort';

function initialSort(): Sort {
  try { return localStorage.getItem(SORT_KEY) === 'emoji' ? 'emoji' : 'newest'; } catch { return 'newest'; }
}

type Open = { kind: 'view'; recipe: Recipe } | { kind: 'form'; recipe: Recipe | null } | null;

export function Recipes() {
  const { version, me } = useApp();
  const [sort, setSort] = useState<Sort>(initialSort);
  const [list, setList] = useState<Recipe[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [open, setOpen] = useState<Open>(null);

  const load = useCallback(() => get<Recipe[]>('/recipes')
    .then((r) => { setList(r); setError(null); return r; })
    .catch((e) => { setError(errorText(e)); return null; }), []);
  useEffect(() => { load(); }, [load, version]);
  useEffect(() => { try { localStorage.setItem(SORT_KEY, sort); } catch { /* storage may be blocked */ } }, [sort]);

  async function read(e: FormEvent) {
    e.preventDefault();
    setReading(true); setReadError(null);
    try {
      const r = await post<Recipe>('/recipes/from-link', { url: link });
      setLink(''); setOpen({ kind: 'view', recipe: r }); load();
    } catch (err) {
      const k = recipeLinkOf(link);
      const existing = k && err instanceof ApiError && err.code === 'duplicate'
        ? (await load())?.find((x) => (k.kind === 'video' ? x.videoId === k.videoId : x.link === k.link)) : undefined;
      if (existing) { setLink(''); setOpen({ kind: 'view', recipe: existing }); }
      else setReadError(errorText(err));
    } finally {
      setReading(false);
    }
  }

  const saved = (r: Recipe) => { setOpen({ kind: 'view', recipe: r }); load(); };
  /** My emoji changed in the view: the view and its row show the server's recipe at once. */
  const changed = (r: Recipe) => {
    setOpen({ kind: 'view', recipe: r });
    setList((l) => l && l.map((x) => (x.id === r.id ? r : x)));
  };
  const rows = list && (sort === 'emoji' ? byMyEmoji(list, me.id) : list);

  return (
    <div className={s.screen}>
      {/* noValidate: a link pasted without https:// ("youtu.be/…") is fine (§7E.1, §7E.6); the server decides. */}
      <form className={s.paste} onSubmit={read} noValidate>
        <input type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label="Recipe link"
          placeholder="Paste a recipe link…" value={link} disabled={reading} onChange={(e) => setLink(e.target.value)} />
        <button className="primary" disabled={reading || !link.trim()}>{reading ? 'Reading…' : 'Read it'}</button>
      </form>
      {reading && <p className="muted" role="status">Reading the link… this can take a little while.</p>}
      {readError && <div role="alert" className="alert-error">{readError}</div>}
      <button className={s.add} onClick={() => setOpen({ kind: 'form', recipe: null })}>＋ Type a recipe</button>
      {error && <div role="alert" className="alert-error">{error}</div>}
      {list === null && !error && <p className="muted">Loading…</p>}
      {list?.length === 0 && <p className="muted">No recipes yet.</p>}
      {!!list?.length && (
        <div className={`row wrap ${s.sort}`} role="group" aria-label="Order">
          {SORTS.map(([id, label]) => (
            <button key={id} className={`chip ${s.pick}`} aria-pressed={sort === id} onClick={() => setSort(id)}>{label}</button>
          ))}
        </div>
      )}
      {rows && (
        <ul className={ls.list}>
          {rows.map((r) => (
            <li key={r.id}>
              <button className={`${ls.item} ${ls.main}`} onClick={() => setOpen({ kind: 'view', recipe: r })}>
                {r.thumbnailUrl
                  ? <img className={s.thumb} src={r.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  : <span className={s.thumb} aria-hidden />}
                <span className={`${ls.title} ${s.text}`}>{myEmoji(r, me.id) && `${myEmoji(r, me.id)} `}{r.title}</span>
                {!r.found && (r.videoId || r.link) && <span className="badge warn">{r.videoId ? 'watch it' : 'open it'}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open?.kind === 'view' && (
        <RecipeView recipe={open.recipe} recipes={list ?? []} onChange={changed} onClose={() => setOpen(null)} onEdit={() => setOpen({ kind: 'form', recipe: open.recipe })} />
      )}
      {open?.kind === 'form' && (
        <RecipeForm recipe={open.recipe} onSaved={saved} onDeleted={() => { setOpen(null); load(); }}
          onClose={() => setOpen(open.recipe ? { kind: 'view', recipe: open.recipe } : null)} />
      )}
    </div>
  );
}
