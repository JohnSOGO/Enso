// SPEC §10.1 — `predeploy`: npm runs this before `deploy`. Asks wrangler what the remote D1 still needs and
// applies deployGate's verdict (scripts/pending-migrations.ts). Decides nothing itself.
import { spawnSync } from 'node:child_process';
import { deployGate } from './pending-migrations';

// shell: Windows needs it for wrangler's .cmd shim; without it the spawn fails and the gate refuses every deploy.
const r = spawnSync('wrangler d1 migrations list enso --remote', { shell: true, encoding: 'utf8', env: { ...process.env, CI: '1' } });
const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
const gate = deployGate(r.status === 0 ? out : ''); // wrangler failed → nothing confirmed → refuse
if (!gate.ok) {
  console.error(out.trim());
  console.error(`\n${gate.message}`);
  process.exit(1);
}
console.log('Live database has every migration; deploying.');
