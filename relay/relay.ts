// SPEC §9.2 — LAN relay: pulls house deliveries from the Worker, speaks them through
// Home Assistant (Echos + Voice PE), reports each result. Never exits on its own.
// Run: npm run relay   (config: relay/relay.config.json — copy the .example)
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyResult } from './classify';

interface Config {
  serverUrl: string;
  relayToken: string;
  haUrl: string;
  haTokenPath: string;
  echoTargets: string[];
  echoType: 'announce' | 'tts';
  satelliteEntity: string;
  pollSeconds: number;
}

const here = dirname(fileURLToPath(import.meta.url));
const cfg: Config = JSON.parse(readFileSync(join(here, 'relay.config.json'), 'utf8'));
const haToken = readFileSync(cfg.haTokenPath, 'utf8').trim(); // never logged
const logFile = join(here, 'relay.log');

function log(msg: string) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  try { appendFileSync(logFile, line + '\n'); } catch { /* logging must never stop the relay */ }
}

async function ha(path: string, payload: unknown, timeoutMs: number): Promise<string> {
  try {
    const res = await fetch(`${cfg.haUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${haToken}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: Buffer.from(JSON.stringify(payload), 'utf8'),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok ? 'ok' : `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`;
  } catch (e) {
    return `error: ${(e as Error).message}`;
  }
}

async function server(path: string, payload?: unknown): Promise<any> {
  const res = await fetch(`${cfg.serverUrl}/api/v1${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.relayToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status} ${JSON.stringify(body)}`);
  return body;
}

async function speak(d: { id: string; message: string }) {
  const [echo, voicePe] = await Promise.all([
    ha('/api/services/notify/alexa_media', { target: cfg.echoTargets, message: d.message, data: { type: cfg.echoType } }, 15_000),
    ha('/api/services/assist_satellite/announce', { entity_id: cfg.satelliteEntity, message: d.message }, 30_000), // ~8 s is normal
  ]);
  const status = classifyResult(echo === 'ok', voicePe === 'ok');
  await server('/relay/report', { id: d.id, status, detail: { echo, voice_pe: voicePe } });
  log(`${status} ${d.id} "${d.message}" echo=${echo} voice_pe=${voicePe}`);
}

async function loop() {
  log(`relay started → ${cfg.serverUrl}, HA ${cfg.haUrl}`);
  for (;;) {
    try {
      const batch: { id: string; message: string }[] = await server('/relay/claim');
      for (const d of batch) await speak(d);
    } catch (e) {
      log(`poll failed: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, cfg.pollSeconds * 1000));
  }
}

loop();
