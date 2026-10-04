// SPEC §8.1 — frame: Ringing bar, status badges, the current tab, ＋ button, bottom tab bar.
import { useCallback, useEffect, useState } from 'react';
import { get } from './api';
import { AppProvider, useApp, type Me } from './state';
import { Calendar, type DayData, type Occurrence } from './components/Calendar';
import { DaySheet } from './components/DaySheet';
import { EventForm } from './components/EventForm';
import { TimerForm, type Timer } from './components/Timers';
import { Alarms, AlarmForm, type Alarm } from './components/Alarms';
import { type Chore } from './components/Chores';
import { ChoreForm } from './components/ChoreForm';
import { HouseholdLists } from './components/HouseholdLists';
import { Settings } from './components/Settings';
import { RingingBar } from './components/RingingBar';
import { SignIn } from './components/SignIn';
import { JoinPage } from './components/JoinPage';
import { Welcome } from './components/Welcome';
import { JOIN_PATH } from '../../src/shared/invite-link';
import { Modal } from './components/Modal';
import s from './App.module.css';

/** The bottom tab bar (§8.1): the one list of tabs — id, icon, label. */
const NAV = [['calendar', '📅', 'Calendar'], ['alarms', '⏰', 'Alarms'], ['lists', '🛒', 'Lists'], ['settings', '⚙', 'Settings']] as const;
type Tab = (typeof NAV)[number][0];
const TABS: readonly Tab[] = NAV.map(([id]) => id);
type Overlay =
  | { kind: 'day'; date: string; data: DayData | undefined }
  | { kind: 'event'; date: string; eventId?: string }
  | { kind: 'timer'; timer: Timer | null }
  | { kind: 'alarm'; alarm: Alarm | null }
  | { kind: 'chore'; chore: Chore | null }
  | { kind: 'explain'; title: string; text: string }
  | null;

function Shell({ onLogout, justJoined }: { onLogout: () => void; justJoined: boolean }) {
  const { me, status, today } = useApp();
  const [tab, setTab] = useState<Tab>(() => {
    try { const t = localStorage.getItem('enso.tab') as Tab; return TABS.includes(t) ? t : 'calendar'; } catch { return 'calendar'; }
  });
  const [overlay, setOverlay] = useState<Overlay>(null);
  useEffect(() => { try { localStorage.setItem('enso.tab', tab); } catch { /* storage may be blocked */ } }, [tab]);

  const houseOffline = status !== null && !status.relayOnline;
  const phoneOff = status !== null && status.mySubscriptions.length === 0;

  return (
    <div className={s.app}>
      <RingingBar />
      {(houseOffline || phoneOff) && (
        <div className={s.badges}>
          {houseOffline && (
            <button className="badge bad" onClick={() => setOverlay({ kind: 'explain', title: 'House offline',
              text: 'The relay on the home PC has not checked in for over 2 minutes, so alerts set to “House” will not be spoken until it runs again. Start it with “npm run relay” on the home PC. Alerts still show in the Ringing bar.' })}>
              🔇 House offline
            </button>
          )}
          {phoneOff && (
            <button className="badge bad" onClick={() => setOverlay({ kind: 'explain', title: 'Phone alerts off',
              text: 'This account has no phone subscribed for push alerts, so “Phone” alerts cannot reach you. Turn them on in Settings → Me → Phone alerts (on iPhone: from the Ensō app on the Home Screen). See Settings → Status for each delivery.' })}>
              📵 Phone alerts off
            </button>
          )}
        </div>
      )}
      <main className={s.main}>
        {tab === 'calendar' && <Calendar onOpenDay={(date, data) => setOverlay({ kind: 'day', date, data })} />}
        {tab === 'alarms' && <Alarms onEditAlarm={(alarm) => setOverlay({ kind: 'alarm', alarm })} onEditTimer={(timer) => setOverlay({ kind: 'timer', timer })}
          onEditChore={(chore) => setOverlay({ kind: 'chore', chore })} />}
        {tab === 'lists' && <HouseholdLists />}
        {tab === 'settings' && <Settings onLogout={onLogout} />}
      </main>
      {tab === 'calendar' && (
        <button className={s.fab} aria-label="Add event" title="Add event" onClick={() => setOverlay({ kind: 'event', date: today() })}>＋</button>
      )}
      <nav className={s.tabs} aria-label="Sections">
        {NAV.map(([id, icon, label]) => (
          <button key={id} className={tab === id ? s.active : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
            <span aria-hidden className={s.icon}>{icon}</span>{label}
          </button>
        ))}
      </nav>

      {overlay?.kind === 'day' && (
        <DaySheet date={overlay.date} data={overlay.data} onClose={() => setOverlay(null)}
          onOpenEvent={(o: Occurrence) => setOverlay({ kind: 'event', date: o.date, eventId: o.eventId })}
          onAdd={() => setOverlay({ kind: 'event', date: overlay.date })} />
      )}
      {overlay?.kind === 'event' && <EventForm date={overlay.date} eventId={overlay.eventId} onClose={() => setOverlay(null)} />}
      {overlay?.kind === 'timer' && <TimerForm timer={overlay.timer} onClose={() => setOverlay(null)} />}
      {overlay?.kind === 'alarm' && <AlarmForm alarm={overlay.alarm} onClose={() => setOverlay(null)} />}
      {overlay?.kind === 'chore' && <ChoreForm chore={overlay.chore} onClose={() => setOverlay(null)} />}
      {overlay?.kind === 'explain' && (
        <Modal title={overlay.title} onClose={() => setOverlay(null)} footer={<button onClick={() => setOverlay(null)}>OK</button>}>
          <p>{overlay.text}</p>
        </Modal>
      )}
      {justJoined && <Welcome me={me} />}
    </div>
  );
}

/** The opening screen stays at least this long from page start (§8.10). */
const SPLASH_MIN_MS = 800;

export function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  useEffect(() => { get<Me>('/me').then(setMe).catch(() => setMe(null)); }, []);
  const onMe = useCallback((m: Me | null) => setMe(m), []);
  // §6.2a — the join page lives at /join#CODE; leaving it (joined, chose Sign in, or already signed in — Q20) means '/'.
  const [joining, setJoining] = useState(() => location.pathname === JOIN_PATH);
  const [justJoined, setJustJoined] = useState(false);
  const leaveJoin = useCallback(() => { history.replaceState(null, '', '/'); setJoining(false); }, []);
  useEffect(() => { if (me && joining) leaveJoin(); }, [me, joining, leaveJoin]);
  const signedIn = (m: Me, how?: { joined: boolean }) => { setJustJoined(!!how?.joined); setMe(m); };

  // SPEC §8.10: the opening screen (index.html) covers loading; it leaves once we know who this is,
  // after at least 0.8 s from page start so it never flickers.
  useEffect(() => {
    if (me === undefined) return;
    const splash = document.getElementById('splash');
    if (!splash) return;
    const t = setTimeout(() => {
      splash.classList.add('gone');
      setTimeout(() => splash.remove(), 300);
    }, Math.max(0, SPLASH_MIN_MS - performance.now()));
    return () => clearTimeout(t);
  }, [me]);

  if (me === undefined) return null;
  if (me === null) {
    return joining
      ? <JoinPage onJoined={(m) => { leaveJoin(); signedIn(m, { joined: true }); }} onSignIn={leaveJoin} />
      : <SignIn onSignedIn={signedIn} />;
  }
  return (
    <AppProvider me={me} onMe={onMe}>
      <Shell onLogout={() => { setJustJoined(false); setMe(null); }} justJoined={justJoined} />
    </AppProvider>
  );
}
