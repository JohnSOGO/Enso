// SPEC §9.1 — the service worker: push notifications ONLY. It has no fetch listener, ever, so it
// never caches or serves the app (§8.10 always-fresh). Plain static JS, served Cache-Control: no-cache.

const LABEL = { done: 'Done', snooze: 'Snooze 10m', ack: 'Ack' }; // the Ringing bar's words (§8.2)

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  // ALWAYS show something: iOS revokes permission for a push that shows nothing.
  let p = {};
  try { p = event.data ? event.data.json() : {}; } catch { p = { body: event.data ? event.data.text() : '' }; }
  const actions = Array.isArray(p.actions) ? p.actions.map((a) => ({ action: a, title: LABEL[a] || a })) : [];
  event.waitUntil(self.registration.showNotification(p.title || 'Ensō', {
    body: p.body || 'Something needs you — open Ensō.',
    tag: p.tag || p.fireId || 'enso-test', // §9.1: fire → fireId, announcement → delivery id, test → enso-test
    icon: '/icon-192.png',
    data: { fireId: p.fireId || null, url: typeof p.url === 'string' ? p.url : null }, // url: a sign-in request's approve page (§6.6)
    actions,
    requireInteraction: true,
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil(event.action && data.fireId ? act(data.fireId, event.action) : data.url ? openAt(data.url) : openApp());
});

async function act(fireId, action) {
  let problem = null;
  try {
    const res = await fetch(`/api/v1/fires/${encodeURIComponent(fireId)}/actions`, {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      problem = (j && j.message) || `HTTP ${res.status}`;
    }
  } catch {
    problem = 'could not reach the server';
  }
  // A failed tap is never quiet: say so on the phone, under the same tag.
  if (problem) {
    await self.registration.showNotification('Ensō', {
      body: `${LABEL[action] || action} did not go through (${problem}). Open Ensō to try again.`,
      tag: fireId, icon: '/icon-192.png', data: { fireId: null }, requireInteraction: true,
    });
  }
}

// §6.6 — a sign-in request opens its approve page: an open app window goes there, else a new one opens.
async function openAt(url) {
  const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (open.length) {
    try {
      await open[0].focus();
      if (await open[0].navigate(url)) return;
    } catch { /* not controlled by this worker — it cannot be navigated */ }
  }
  return self.clients.openWindow(url);
}

async function openApp() {
  const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (open.length) return open[0].focus();
  return self.clients.openWindow('/');
}
