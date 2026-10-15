// SPEC §10.1 — the deploy gate's verdict: deploy only when the remote D1 has no migration left to apply.
// Pure and Node-free (imports nothing) so the workerd test can import it; scripts/predeploy.ts runs wrangler.

export type DeployGate = { ok: true } | { ok: false; message: string };

const CLEAR = 'No migrations to apply';

/** Fail closed: only wrangler's own "No migrations to apply" lets the deploy go; anything else refuses. */
export function deployGate(wranglerListOutput: string): DeployGate {
  if (wranglerListOutput.includes(CLEAR)) return { ok: true };
  const pending = [...new Set(wranglerListOutput.match(/\b\d{4}_[\w-]+\.sql\b/g) ?? [])];
  return {
    ok: false,
    message: [
      pending.length
        ? `Deploy refused: the live database still needs ${pending.join(', ')}.`
        : 'Deploy refused: could not confirm the live database has every migration (wrangler said nothing clear).',
      'Run `npm run db:migrate:remote` first, then `npm run deploy` again.',
      'A dropping migration that must go after the deploy: `npm run build`, then `npx wrangler deploy`.',
    ].join('\n'),
  };
}
