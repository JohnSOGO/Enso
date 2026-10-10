import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * SPEC §8.10 — the build stamp on the opening screen: `v{version} · {commit}`, written at build time.
 * Uncommitted changes show `-dirty`; no git shows `unknown build` — never a plausible guess.
 */
function buildStamp(): string {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  const git = (args: string) => execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  try {
    const dirty = git('status --porcelain --untracked-files=no') !== '';
    return `v${version} · ${git('rev-parse --short HEAD')}${dirty ? '-dirty' : ''}`;
  } catch {
    return `v${version} · unknown build`;
  }
}

/** Made once, so the opening screen and the tab bar (§8.1) can never show different stamps. */
const stamp = buildStamp();

export default defineConfig({
  root: 'frontend',
  plugins: [
    react(),
    { name: 'enso-build-stamp', transformIndexHtml: (html) => html.replace('%ENSO_BUILD%', stamp) },
  ],
  define: { __ENSO_BUILD__: JSON.stringify(stamp) },
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8787' },
  },
});
