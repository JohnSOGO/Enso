// SogoLive v1.0.2 (2026-11-16: update logo floats, pulses and rotates slowly; colors match tao-theme.css) - live pages that update themselves (UI-RULES 1.12, 1.13). Canon: sogo-tao specs/UI-RULES.md.
// Master: github.com/JohnSOGO/sogo-tao specs/shared/live.js. Apps keep a copy; update the copy, never fork it.
// Taken from the LIVE block of live.sogodojo.com (SogolAI scripts/phone.html, 2026-11-07 to 11-10), which keeps its own
// copy until it switches to this file.
//
// What it does:
//  - A heartbeat dot in the header: blinks amber while waiting for the next fetch, flashes green while fetching, grey
//    when paused, solid red "No new data for N s" when good data is older than staleMs (15 s). A ↻ button fetches now.
//  - Self-healing: no good data for refetchMs (20 s) = fetch now; for reloadMs (60 s) = reload the page once (at most
//    every 5 min). Fetches again on return to the app, focus, pageshow (iOS back/forward cache) and when back online.
//  - Self-update: every 30 s (and on return) it re-reads the page; if it changed, it shows the loading screen with the
//    app's logo (floating, pulsing, slowly rotating), keeps the scroll position and reloads. Never while busy() says he is typing or audio plays.
//  - Loading screen (UI-RULES 1.12): SogoLive.loading(true) until the first fresh data; no spinner for loads under 1 s.
//  - Offline (UI-RULES 1.12, EXC = OFL): no signal hides the loading screen, shows an amber "Offline" banner over the
//    app's last data, and fetches again by itself when the signal is back.
//  - "N s ago" labels: SogoLive.agoSpan(iso, everySec) ticks each second, amber past 3x its interval, red past 1 h.
//
// Use (classic script, works beside ES modules):
//   <script src="/live.js" defer></script>
//   SogoLive.start({
//     host: document.getElementById("live"),     // where the dot and ↻ go (header)
//     poll: async (fresh) => { ...fetch, render...; return true },  // true = good data arrived
//     everyMs: 3000,                              // normal poll interval
//     logo: "/icons/icon-192.png",                // the app's logo for the loading screen (optional)
//     busy: () => myReplyBox.value.trim() !== "", // hold reloads while he is typing (optional)
//   });
// Colors come from the page's CSS variables (--bg --text --muted --warn --good --crit), with UI-RULES 1.9 fallbacks.
(function (root) {
  "use strict";
  if (root.SogoLive) return;

  // ---- Pure parts (tested in live.test.mjs) ----
  const fmt = s => s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.floor(s % 3600 / 60)} min`;
  const lvl = (s, every) => !every ? "" : s > 3600 ? "bad" : s > every * 3 ? "warn" : "";
  // The dot's state and its words.
  function dotState({ now, busy, busyAt, next, dataAt, staleMs, hidden }) {
    let st = busy || now - busyAt < 600 ? "busy" : !next ? "paused" : "wait";
    if (dataAt && now - dataAt > staleMs && !hidden) st = "stale";
    const text = st === "stale" ? `No new data for ${fmt(Math.round((now - dataAt) / 1000))}`
      : st === "busy" ? "Refreshing" : st === "paused" ? "Paused"
      : `Refresh in ${Math.max(0, Math.ceil((next - now) / 1000))} s`;
    return { st, text };
  }
  // What the stale guard should do now: "none", "fetch" or "reload".
  function guard({ now, dataAt, polling, lastReload, busy, refetchMs, reloadMs }) {
    if (!dataAt) return "none";
    const age = now - dataAt;
    if (age > reloadMs && !busy && now - (lastReload || 0) > 300000) return "reload";
    if (age > refetchMs && !polling) return "fetch";
    return "none";
  }
  const pure = { fmt, lvl, dotState, guard };
  if (typeof document === "undefined") { root.SogoLive = { _pure: pure }; return; }

  // ---- Page parts ----
  const P = "sogo-live";
  const CSS_TEXT = `
.${P}{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;font-size:12px;color:var(--muted,#9E9E9E);flex:none}
.${P}-cd{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--muted,#9E9E9E);flex:none}
.${P}-cd[data-st="wait"]{background:var(--warn,#FFC107);animation:${P}-dot 1s infinite}
.${P}-cd[data-st="busy"]{background:var(--good,#4CAF50)}
.${P}-cd[data-st="stale"]{background:var(--crit,#FF5252);animation:none}
@keyframes ${P}-dot{0%,89.9%{opacity:1}90%,100%{opacity:0}}
.${P}-rf{font:inherit;font-size:15px;line-height:1;width:30px;height:30px;padding:0;border-radius:8px;border:1px solid var(--border,#333333);background:var(--card,#1E1E1E);color:var(--text,#E0E0E0);cursor:pointer;flex:none}
.${P}-rf.spin{animation:${P}-spin .7s linear infinite}
@keyframes ${P}-spin{to{transform:rotate(360deg)}}
[data-live-lvl="warn"]{color:var(--warn,#FFC107);font-weight:600}
[data-live-lvl="warn"]::after{content:" · late"}
[data-live-lvl="bad"]{color:var(--crit,#FF5252);font-weight:700}
#${P}-load{position:fixed;inset:0;z-index:2147482000;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:color-mix(in srgb,var(--bg,#121212) 94%,transparent);color:var(--text,#E0E0E0);font-size:14px}
#${P}-load.on{display:flex}
#${P}-load .logo{width:88px;height:88px;border-radius:20px;animation:${P}-spin 6s linear infinite,${P}-pulse 1.6s ease-in-out infinite;filter:drop-shadow(0 8px 14px rgba(0,0,0,.5))}
@keyframes ${P}-pulse{0%,100%{scale:1;translate:0 0}50%{scale:1.1;translate:0 -6px}}
#${P}-load .logo.dot{background:var(--accent,#FF5252)}
#${P}-off{position:fixed;left:0;right:0;top:0;z-index:2147482001;padding:calc(6px + env(safe-area-inset-top)) 12px 6px;background:var(--warn,#FFC107);color:#121212;font-size:13px;font-weight:600;text-align:center;display:none}
#${P}-off.on{display:block}
@media (prefers-reduced-motion:reduce){.${P}-cd,.${P}-rf.spin,#${P}-load .logo{animation:none}}`;

  const L = { next: 0, dataAt: 0 };
  const cfg = { everyMs: 3000, staleMs: 15000, refetchMs: 20000, reloadMs: 60000, updateMs: 30000, selfUpdate: true,
    logo: "", busy: () => false, poll: null };
  let busy = false, busyAt = 0, polling = false, cd = null, btn = null, timer = 0, loadEl = null, loadTimer = 0;
  const KEY = P + "-scroll:" + location.pathname, RKEY = P + "-reload:" + location.pathname;

  function addStyle() {
    if (document.getElementById(P + "-css")) return;
    const s = document.createElement("style"); s.id = P + "-css"; s.textContent = CSS_TEXT; document.head.appendChild(s);
  }
  function tick() {
    const now = Date.now();
    if (cd) {
      const { st, text } = dotState({ now, busy, busyAt, next: L.next, dataAt: L.dataAt, staleMs: cfg.staleMs, hidden: document.hidden });
      if (cd.dataset.st !== st) cd.dataset.st = st;
      if (cd.title !== text) { cd.title = text; cd.setAttribute("aria-label", text); }
    }
    if (btn && !busy && btn.classList.contains("spin")) setTimeout(() => btn.classList.remove("spin"), 300);
    for (const el of document.querySelectorAll("[data-live-at]")) {
      const t = Date.parse(el.dataset.liveAt); if (!Number.isFinite(t)) continue;
      const s = Math.max(0, Math.round((now - t) / 1000)), txt = `${fmt(s)} ago`, l = lvl(s, Number(el.dataset.liveEvery) || 0);
      if (el.textContent !== txt) el.textContent = txt;
      if (el.dataset.liveLvl !== l) el.dataset.liveLvl = l;
    }
  }
  function schedule() { clearTimeout(timer); L.next = Date.now() + cfg.everyMs; timer = setTimeout(() => run(false), cfg.everyMs); }
  async function run(fresh) {
    if (!cfg.poll || polling) return;
    polling = true; busy = true; busyAt = Date.now(); tick();
    try { if (await cfg.poll(!!fresh)) { L.dataAt = Date.now(); loading(false); } } catch {} finally { polling = false; busy = false; tick(); schedule(); }
  }
  function keep() { try { sessionStorage.setItem(KEY, JSON.stringify({ y: scrollY, hash: location.hash, at: Date.now() })); } catch {} }
  function restore() {
    try { const v = JSON.parse(sessionStorage.getItem(KEY) || "null"); sessionStorage.removeItem(KEY);
      if (v && v.hash === location.hash && Date.now() - v.at < 120000) setTimeout(() => scrollTo(0, v.y), 50); } catch {}
  }
  function isBusy() { try { return !!cfg.busy(); } catch { return false; } }
  // The loading screen with the app's spinning logo. Shown only after 1 s, so quick loads never flicker.
  function loading(on, text = "Loading fresh data…") {
    clearTimeout(loadTimer);
    if (!loadEl) {
      loadEl = document.createElement("div"); loadEl.id = P + "-load"; loadEl.setAttribute("role", "status");
      const logo = cfg.logo ? Object.assign(document.createElement("img"), { src: cfg.logo, alt: "" }) : document.createElement("div");
      logo.className = cfg.logo ? "logo" : "logo dot";
      const t = document.createElement("span"); loadEl.append(logo, t); document.body.appendChild(loadEl);
    }
    loadEl.lastChild.textContent = text;
    if (!on) { loadEl.classList.remove("on"); return; }
    loadTimer = setTimeout(() => loadEl.classList.add("on"), 1000);
  }
  let offEl = null;
  function offline(on) {
    if (!offEl) { offEl = document.createElement("div"); offEl.id = P + "-off"; offEl.setAttribute("role", "status");
      offEl.textContent = "⚠ Offline: showing the last data"; document.body.appendChild(offEl); }
    offEl.classList.toggle("on", !!on);
    if (on) loading(false);
  }
  function reload() { keep(); try { sessionStorage.setItem(RKEY, String(Date.now())); } catch {} loading(true, "Updating…"); setTimeout(() => location.reload(), 300); }

  function start(opts = {}) {
    Object.assign(cfg, opts); addStyle();
    if (cfg.host) {
      cfg.host.classList.add(P);
      cfg.host.innerHTML = `<span class="${P}-cd" role="img"></span><button type="button" class="${P}-rf" title="Refresh now" aria-label="Refresh now">↻</button>`;
      cd = cfg.host.querySelector(`.${P}-cd`); btn = cfg.host.querySelector(`.${P}-rf`);
      btn.addEventListener("click", e => { e.stopPropagation(); btn.classList.add("spin"); run(true); });
    }
    setInterval(tick, 500);
    // Stale guard.
    setInterval(() => {
      if (document.hidden || navigator.onLine === false) return;
      let last = 0; try { last = +sessionStorage.getItem(RKEY) || 0; } catch {}
      const g = guard({ now: Date.now(), dataAt: L.dataAt, polling, lastReload: last, busy: isBusy(), refetchMs: cfg.refetchMs, reloadMs: cfg.reloadMs });
      if (g === "fetch") run(true); else if (g === "reload") reload();
    }, 5000);
    for (const ev of ["visibilitychange", "focus", "pageshow", "online"])
      (ev === "visibilitychange" ? document : window).addEventListener(ev, () => { if (!document.hidden) run(true); });
    // Self-update.
    if (cfg.selfUpdate) {
      let base = null, reloading = false;
      const check = async () => {
        if (reloading || document.hidden) return;
        try {
          const r = await fetch(location.pathname, { cache: "no-store", credentials: "same-origin" }); if (!r.ok) return;
          const t = await r.text(); if (base == null) { base = t; return; } if (t === base || isBusy()) return;
          reloading = true; try { (await navigator.serviceWorker?.getRegistration())?.update(); } catch {} reload();
        } catch {}
      };
      check(); setInterval(check, cfg.updateMs);
      document.addEventListener("visibilitychange", check); window.addEventListener("focus", check);
    }
    window.addEventListener("offline", () => offline(true));
    window.addEventListener("online", () => offline(false));
    restore();
    if (navigator.onLine === false) offline(true); else loading(true);
    run(true);
  }

  root.SogoLive = {
    start, loading, keep, restore,
    refresh: () => run(true),
    agoSpan: (at, every = 0) => {
      const s = Math.max(0, Math.round((Date.now() - Date.parse(at)) / 1000));
      return `<span data-live-at="${String(at).replace(/"/g, "")}" data-live-every="${every || 0}" data-live-lvl="${lvl(s, every)}">${fmt(s)} ago</span>`;
    },
    get dataAt() { return L.dataAt; },
    _pure: pure,
  };
})(typeof window !== "undefined" ? window : globalThis);
