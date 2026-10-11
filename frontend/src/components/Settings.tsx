// SPEC §8.6 — Me, Alerts (§9.5), Household (admins), Status: the page that composes each area under its heading.
import type { ReactNode } from 'react';
import { post } from '../api';
import { useApp } from '../state';
import { isAdmin } from '../../../src/shared/roles';
import { useAction } from './useAction';
import { OptionalItems } from './OptionalItems';
import { SettingsMe } from './SettingsMe';
import { PhoneAlerts } from './PhoneAlerts';
import { HouseSpeakers } from './HouseSpeakers';
import { MyAlerts } from './MyAlerts';
import { SettingsHousehold } from './SettingsHousehold';
import { SettingsMembers } from './SettingsMembers';
import { SettingsStatus } from './SettingsStatus';
import s from './Lists.module.css';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className={s.section}><h2>{title}</h2>{children}</section>;
}

/** `openAlert`: a tapped notification's alert, whose card opens in Alerts (§9.5). */
export function Settings({ onLogout, openAlert, onAlertOpened }: { onLogout: () => void; openAlert: string | null; onAlertOpened: () => void }) {
  const { me, status } = useApp();
  const { run, errorEl } = useAction();
  return (
    <div style={{ padding: 12, overflowY: 'auto', height: '100%' }}>
      <h1 style={{ fontSize: '1.15rem', marginBottom: 12 }}>Settings</h1>
      <Section title="Me">
        {errorEl}
        <OptionalItems />
        <SettingsMe />
        <PhoneAlerts />
        <HouseSpeakers />
        <button onClick={() => run(async () => { await post('/auth/logout'); onLogout(); })}>Log out</button>
      </Section>
      <Section title="Alerts"><MyAlerts openId={openAlert} onOpened={onAlertOpened} /></Section>
      {isAdmin(me) && <Section title="Household"><SettingsHousehold /><SettingsMembers /></Section>}
      {status && <Section title="Status"><SettingsStatus /></Section>}
    </div>
  );
}
