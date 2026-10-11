// SPEC §8.6 — the Settings menu: one PickGrid button per area (Household and Members for admins only), the open
// area in a Modal titled with its name, Log out under the grid. Holds which area is open and no setting of its own;
// a tapped alert notification (§9.5) opens Alerts on its card.
import { useEffect, useState, type ReactNode } from 'react';
import { post } from '../api';
import { useApp } from '../state';
import { isAdmin } from '../../../src/shared/roles';
import { useAction } from './useAction';
import { Modal } from './Modal';
import { PickGrid } from './PickGrid';
import { OptionalItems } from './OptionalItems';
import { SettingsMe } from './SettingsMe';
import { PhoneAlerts } from './PhoneAlerts';
import { HouseSpeakers } from './HouseSpeakers';
import { MyAlerts } from './MyAlerts';
import { SettingsHousehold } from './SettingsHousehold';
import { SettingsMembers } from './SettingsMembers';
import { SettingsStatus } from './SettingsStatus';

type Area = 'me' | 'calendar' | 'phone' | 'speakers' | 'alerts' | 'household' | 'members' | 'status';

/** ⚑ Q226 — the buttons in order; `admin` ones show only to admins. */
const AREAS: readonly { value: Area; emoji: string; label: string; admin?: true }[] = [
  { value: 'me', emoji: '🙂', label: 'Me' }, { value: 'calendar', emoji: '📅', label: 'Calendar items' },
  { value: 'phone', emoji: '📱', label: 'Phone alerts' }, { value: 'speakers', emoji: '🔊', label: 'Speakers' },
  { value: 'alerts', emoji: '🔔', label: 'Alerts' }, { value: 'household', emoji: '🏠', label: 'Household', admin: true },
  { value: 'members', emoji: '👥', label: 'Members', admin: true }, { value: 'status', emoji: '📊', label: 'Status' },
];

/** `openAlert`: a tapped notification's alert, whose card opens in Alerts (§9.5). */
export function Settings({ onLogout, openAlert, onAlertOpened }: { onLogout: () => void; openAlert: string | null; onAlertOpened: () => void }) {
  const { me } = useApp();
  const [open, setOpen] = useState<Area | null>(openAlert ? 'alerts' : null);
  useEffect(() => { if (openAlert) setOpen('alerts'); }, [openAlert]);
  const { run, busy, errorEl } = useAction();
  const areas = AREAS.filter((a) => !a.admin || isAdmin(me));
  const shown = areas.find((a) => a.value === open);

  const body: Record<Area, () => ReactNode> = {
    me: () => <SettingsMe />,
    calendar: () => <OptionalItems />,
    phone: () => <PhoneAlerts />,
    speakers: () => <HouseSpeakers />,
    alerts: () => <MyAlerts openId={openAlert} onOpened={onAlertOpened} />,
    household: () => <SettingsHousehold />,
    members: () => <SettingsMembers />,
    status: () => <SettingsStatus />,
  };

  return (
    <div style={{ padding: 12, overflowY: 'auto', height: '100%' }}>
      <h1 style={{ fontSize: '1.15rem', marginBottom: 12 }}>Settings</h1>
      <PickGrid entries={areas} onPick={(v) => setOpen(v as Area)} />
      {errorEl}
      <button style={{ marginTop: 16 }} disabled={busy} onClick={() => run(async () => { await post('/auth/logout'); onLogout(); })}>Log out</button>
      {shown && <Modal title={`${shown.emoji} ${shown.label}`} onClose={() => setOpen(null)}>{body[shown.value]()}</Modal>}
    </div>
  );
}
