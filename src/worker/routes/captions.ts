// SPEC §7E.2c, §10 — the SogoAI captions helper's door: POST /captions/claim and POST /captions/report. No session:
// a file-local bearer check against CAPTIONS_TOKEN (unset or empty → 503, never open; wrong → 401). Every rule is
// src/shared/recipe-reading.ts; every write of the job columns is captions-jobs.ts; the re-read is recipe-reread.ts.
import { Hono, type Context, type Next } from 'hono';
import type { AppEnv } from '../env';
import type { RecipeRow } from '../../shared/recipes';
import {
  HOME_CAPTIONS_EDITED, HOME_CAPTIONS_NO_RECIPE, homeCaptionsError, homeRereadMayReplace, parseCaptionsReport,
} from '../../shared/recipe-reading';
import { first, nowIso } from '../db';
import { body, fail } from '../http';
import { claimNextCaptionsJob, endCaptionsJobStatement } from '../captions-jobs';
import { rereadRecipe } from '../recipe-reread';

const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

/** Constant time: the SHA-256 of each (equal lengths), every byte compared. */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function helperOnly(c: Context<AppEnv>, next: Next) {
  const token = c.env.CAPTIONS_TOKEN;
  if (!token) return fail(c, 503, 'captions_helper_off', "Captions from home aren't set up.");
  const given = /^Bearer (.+)$/.exec(c.req.header('authorization') ?? '')?.[1] ?? '';
  if (!(await sameSecret(given, token))) return fail(c, 401, 'unauthorized', 'The captions helper token is missing or wrong.');
  await next();
}

export const captions = new Hono<AppEnv>();

captions.post('/captions/claim', helperOnly, async (c) => {
  const job = await claimNextCaptionsJob(c.env.DB, nowIso());
  return job ? c.json(job) : c.body(null, 204);
});

type Outcome = 'reread' | 'captions_failed' | 'edited' | 'no_recipe' | 'reread_failed';

captions.post('/captions/report', helperOnly, async (c) => {
  const { recipeId, result } = await body(c);
  if (typeof recipeId !== 'string' || !recipeId) return fail(c, 400, 'invalid_input', 'recipeId must be a recipe id.');
  const report = parseCaptionsReport(result);
  if (typeof report === 'string') return fail(c, 400, 'invalid_input', report);
  const db = c.env.DB;
  const row = await first<RecipeRow>(db,
    "SELECT * FROM recipes WHERE id = ? AND deleted_at IS NULL AND captions_job = 'claimed'", recipeId);
  if (!row) return fail(c, 409, 'not_claimed', 'That recipe has no claimed captions job.');

  const end = async (outcome: Outcome, captionsError: string) => {
    await endCaptionsJobStatement(db, row.id, captionsError).run();
    return c.json({ outcome });
  };
  if (!report.ok) return end('captions_failed', homeCaptionsError(report.reason));
  if (!homeRereadMayReplace(row)) return end('edited', HOME_CAPTIONS_EDITED);
  const { YOUTUBE_API_KEY: yt, ANTHROPIC_API_KEY: ai } = c.env;
  if (!yt || !ai) return end('reread_failed', homeCaptionsError("Reading recipes from videos isn't set up yet."));

  const out = await rereadRecipe(db, { yt, ai }, row, { transcript: report.text }, null, nowIso());
  if (out.ok) return c.json({ outcome: 'reread' satisfies Outcome }); // its UPDATE ended the job
  if (out.kind === 'no_recipe') return end('no_recipe', HOME_CAPTIONS_NO_RECIPE);
  return end('reread_failed', homeCaptionsError(out.reason));
});
