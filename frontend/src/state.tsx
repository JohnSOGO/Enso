// App-wide data: who I am, household members/settings, ringing fires, house/push status.
// Refreshed on a 30 s poll while visible (SPEC §10 "Freshness"), on focus/visibility, and after any write.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { get } from './api';
import { clockText, utcToLocal } from '../../src/shared/time';
import type { AlertKind, Channel, DeliveryStatus, HouseState, Role, TaskMood } from '../../src/shared/vocab';
import type { Task, TaskState } from '../../src/shared/tasks';
import type { After } from '../../src/shared/reminders';

export interface Me {
  id: string; email: string; displayName: string; color: string; role: Role;
  showPublicHolidays: number; showOptionsExpiration: number; showWeather: number; showMoon: number; showSchool: number;
  /** §9.2a: the house speakers this member chose; null = not chosen (the default speakers). */
  houseSpeakers: string[] | null;
  /** §8.17: true = 24-hour clock, false = 12-hour. */
  clock24h: boolean;
  /** §8.5b: my After work / After school, resolved by the server. */
  after: After;
}
/** §6.3: role 'owner' reads Admin; the founder (isFounder) reads Owner and is protected. */
export interface Member { id: string; displayName: string; color: string; role: Role; isFounder: boolean; email?: string; disabledAt: string | null; joinedAt: string; after: After }
export interface Fire {
  id: string; kind: AlertKind; dueAt: string; state: string; alertCount: number;
  occurrenceDate: string | null; eventId: string | null; timerId: string | null; title: string; startTime: string | null;
  /** §7.7: 'sunset' for a sun-timed reminder, else null. */
  startSun: string | null;
  /** Chore fires only (§10): the run, the current step's title (> 1 step only) and its person. */
  choreRunId?: string | null; stepTitle?: string | null; personId?: string | null;
  /** Machine fires only (§10): the machine; `title` is its label and `personId` the load's owner. */
  machineId?: string | null;
  /** §9.2c: who said "I'm away" on it (its speakers and phones stop), else null. */
  awayBy: string | null;
  /** §7G.3: a task check-in whose working time has reached its limit (task fires only). */
  taskTimeUp?: boolean;
}

/** §8.5a — the 💪 Enso box over every screen: a reply (and the summary once ended), or Finish's done check. */
export type TaskSheet = { kind: 'said'; said: string; task: Task; mood?: TaskMood } | { kind: 'finish'; taskId: string };
export interface Status {
  /** §9.2 — the server's verdict; shown as given, never re-derived here. */
  house: { state: HouseState; lastOkAt: string | null; lastFailedAt: string | null; lastError: string | null };
  mySubscriptions: { id: string; endpoint: string; userAgent: string | null; createdAt: string; lastOkAt: string | null; lastError: string | null }[];
  recentDeliveries: { id: string; channel: Channel; message: string; status: DeliveryStatus; detail: string | null; createdAt: string; member: string | null }[];
  /** §8.5a ⚑ Q309 — my open task session, if any; its state as the server decided it. */
  myTask: { title: string; state: Exclude<TaskState, 'ended'> } | null;
}

interface Ctx {
  me: Me;
  members: Member[];
  tz: string;
  householdName: string;
  ringing: Fire[];
  status: Status | null;
  /** Bumps on every refresh so views re-read their own data. */
  version: number;
  refresh: () => void;
  today: () => string;
  /** §8.17: a local 'HH:MM' in my clock. */
  clock: (hhmm: string) => string;
  /** An instant's local time, in my clock. */
  localTime: (iso: string) => string;
  memberById: (id: string) => Member | undefined;
  /** §8.5a: the 💪 Enso box; it outlives the ringing row that answered. */
  taskSheet: TaskSheet | null;
  showTask: (t: TaskSheet | null) => void;
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

/** §6.3: whether I am the founder (from the members list; false until it loads). */
export function useIsFounder(): boolean {
  const { me, members } = useApp();
  return members.some((m) => m.id === me.id && m.isFounder);
}

export function AppProvider({ me, onMe, children }: { me: Me; onMe: (m: Me | null) => void; children: ReactNode }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [settings, setSettings] = useState({ householdName: 'Home', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  const [ringing, setRinging] = useState<Fire[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [version, setVersion] = useState(0);
  const [taskSheet, showTask] = useState<TaskSheet | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, s, r, st, meNow] = await Promise.all([
        get<Member[]>('/members'), get('/settings'), get<Fire[]>('/fires?state=ringing'), get<Status>('/status'), get<Me>('/me'),
      ]);
      setMembers(m); setSettings(s); setRinging(r); setStatus(st); onMe(meNow);
    } catch (e: any) {
      if (e?.status === 401) onMe(null);
      else console.warn('refresh failed', e);
    }
  }, [onMe]);

  const refresh = useCallback(() => { setVersion((v) => v + 1); }, []);

  useEffect(() => { load(); }, [load, version]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    const timer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 30_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      clearInterval(timer);
    };
  }, [refresh]);

  const value = useMemo<Ctx>(() => ({
    me, members, tz: settings.timezone, householdName: settings.householdName, ringing, status, version, refresh,
    today: () => utcToLocal(new Date().toISOString(), settings.timezone).date,
    clock: (hhmm: string) => clockText(hhmm, me.clock24h),
    localTime: (iso: string) => clockText(utcToLocal(iso, settings.timezone).time, me.clock24h),
    memberById: (id: string) => members.find((m) => m.id === id),
    taskSheet, showTask,
  }), [me, members, settings, ringing, status, version, refresh, taskSheet]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
