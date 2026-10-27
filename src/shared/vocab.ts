// SPEC §3 — the only place these strings are defined. Import; never retype.

export const ALERT_KIND = ['reminder', 'timer', 'chore', 'thing', 'machine'] as const;
export const CHANNEL = ['push', 'house', 'funhouse'] as const; // §9.4b funhouse: the FunHouse desk device, via the PC poller
export const FIRE_STATE = ['scheduled', 'ringing', 'closed'] as const;
export const CLOSE_REASON = ['done', 'acked', 'missed', 'superseded', 'stopped', 'removed'] as const;
export const ACTION = ['done', 'snooze', 'ack'] as const;
export const TIMER_CMD = ['start', 'stop'] as const;
export const DELIVERY_STATUS = ['queued', 'claimed', 'sent', 'partial', 'failed'] as const;
export const ROLE = ['owner', 'member'] as const;
export const FREQ = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const;
export const WEEKDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
export const CHORE_TIMING = ['at', 'by'] as const; // §7B
export const THING_STATUS = ['idea', 'planned', 'done', 'dropped'] as const; // §7C
export const MACHINE = ['washer', 'dryer', 'dishwasher'] as const; // §7D, card order: the laundry in load order, then the dish washer
export const COOK_KIND = ['air_fryer', 'stove', 'oven', 'microwave', 'other'] as const; // §7D.8 a cooking timer's kind, in picker order
export const MACHINE_STATE = ['free', 'running', 'done'] as const; // §7D, derived, never stored
export const SUN_EVENT = ['sunset'] as const; // §7.7 events.start_sun — there is no sunrise
export const TIDE_KIND = ['H', 'L'] as const; // §7.14 tide_turns.kind: a high or a low (NOAA's own letters)
export const RECIPE_SOURCE = ['description', 'captions', 'transcript', 'comments', 'page', 'typed'] as const; // §7E what a recipe was read from ('transcript': pasted, §7E.2b)
export const CAPTIONS_FAILURE = ['blocked', 'none', 'failed'] as const; // §7E why captions couldn't be read
export const SPEAKER_KIND = ['echo', 'satellite'] as const; // §9.2a a house speaker, from its HA entity id
export const DEVICE_DOMAIN = ['climate', 'light', 'switch', 'fan'] as const; // §9.2e a room's HA device, from its entity id
export const DEVICE_ACTION = ['on', 'off', 'mode', 'target'] as const; // §9.2e what a tap asks of a device
export const IDENTIFY_FAILURE = ['off', 'failed'] as const; // §7A.3 why SogoAI gave no reading of a snapped item
export const ITEM_READ_VIA = ['sogoai', 'claude'] as const; // §7A.3 who named a snapped item
export const NOTE_MARK = ['time', 'date', 'phone', 'money', 'link', 'email', 'address', 'key'] as const; // §8.4a what a highlight in notes is
export const NOTE_MARKS_FAILURE = ['off', 'busy', 'failed'] as const; // §8.4a why SogoAI gave no marks for a notes text
export const NOTE_MARKS_WHY = ['unset', ...NOTE_MARKS_FAILURE] as const; // §8.4a why the sheet shows patterns ('unset': the Worker has no helper settings)
export const NOTE_MARKS_VIA = ['sogoai', 'patterns'] as const; // §8.4a who marked the notes
export const LOGIN_REQUEST_STATUS = ['pending', 'approved', 'denied', 'used'] as const; // §6.6 login_requests.status
export const LOGIN_VIEW = ['pending', 'approved', 'denied', 'expired'] as const; // §6.6 what the waiting browser / the phone is told — derived, never stored
export const NOTICE_KIND = ['login', 'new_sign_in'] as const; // §6.6 deliveries.notice — a sign-in notice push, never an ALERT_KIND
export const MESS_SETTLE = ['paid', 'forgiven'] as const; // §7B.7 messes.settled_how
export const MESS_STATUS = ['open', 'discuss', 'owed', 'closed', 'settled'] as const; // §7B.7 a mess's state — derived, never stored
export const BOUNTY_STATUS = ['open', 'taken', 'pending', 'paid'] as const; // §7B.8 a one-off bounty's state — derived, never stored
export const AFTER_KIND = ['work', 'school'] as const; // §8.5b member_prefs.after_kind
export const REMINDER_STATE = ['due', 'ringing', 'missed'] as const; // §8.5b a one-off reminder's state (done is not listed) — derived, never stored
export const SHOW_KIND = ['movie', 'show'] as const; // §7F shows.kind
export const SHOW_STATUS = ['want', 'watched'] as const; // §7F shows.status
export const WATCH_HOW = ['theater', 'stream', 'tv', 'rent', 'buy'] as const; // §7F a way to watch, in bestWatch order
export const LIST_ADD_RESULT = ['added', 'existing', 'reopened'] as const; // §7A.1 POST /lists/{id}/items result
export const HOUSE_QUIET_FOR = ['1h', '2h', '4h', 'today'] as const; // §9.2b how long the house is quiet
export const TASK_MOOD = ['great', 'steady', 'distracted', 'struggling', 'break'] as const; // §7G.3 a check-in answer, in button order
export const TASK_OUTCOME = ['finished', 'stopped'] as const; // §7G.6 task_sessions.outcome
export const TASK_LOOKS = ['yes', 'no', 'unsure'] as const; // §7G.6 a done line, as the photo check read it
export const FEATURE_REQUEST_STATUS = ['new', 'needs_john', 'outside', 'done', 'dismissed'] as const; // §8.18 feature_requests.status
export const FEATURE_REQUEST_SIZE = ['small', 'big'] as const; // §8.18 feature_requests.size
export const SAY_KIND = ['reminder', 'event', 'exists', 'request', 'outside'] as const; // §8.18 what POST /say read — never stored
export const IOU_PAY_HOW = ['paid', 'let_go', 'tab'] as const; // §7B.9 iou_payments.how ('tab': a split bill off the payer's tab)
export const IOU_PLAN_EVERY = ['week', '2weeks', 'month'] as const; // §7B.9 iou_plans.every

export type AlertKind = (typeof ALERT_KIND)[number];
export type Channel = (typeof CHANNEL)[number];
export type FireState = (typeof FIRE_STATE)[number];
export type CloseReason = (typeof CLOSE_REASON)[number];
export type Action = (typeof ACTION)[number];
export type TimerCmd = (typeof TIMER_CMD)[number];
export type DeliveryStatus = (typeof DELIVERY_STATUS)[number];
export type Role = (typeof ROLE)[number];
export type Freq = (typeof FREQ)[number];
export type Weekday = (typeof WEEKDAY)[number];
export type ChoreTiming = (typeof CHORE_TIMING)[number];
export type ThingStatus = (typeof THING_STATUS)[number];
export type MachineId = (typeof MACHINE)[number];
export type CookKind = (typeof COOK_KIND)[number];
export type MachineState = (typeof MACHINE_STATE)[number];
export type SunEvent = (typeof SUN_EVENT)[number];
export type RecipeSource = (typeof RECIPE_SOURCE)[number];
export type CaptionsFailure = (typeof CAPTIONS_FAILURE)[number];
export type SpeakerKind = (typeof SPEAKER_KIND)[number];
export type DeviceDomain = (typeof DEVICE_DOMAIN)[number];
export type DeviceAction = (typeof DEVICE_ACTION)[number];
export type IdentifyFailure = (typeof IDENTIFY_FAILURE)[number];
export type ItemReadVia = (typeof ITEM_READ_VIA)[number];
export type NoteMark = (typeof NOTE_MARK)[number];
export type NoteMarksFailure = (typeof NOTE_MARKS_FAILURE)[number];
export type NoteMarksWhy = (typeof NOTE_MARKS_WHY)[number];
export type NoteMarksVia = (typeof NOTE_MARKS_VIA)[number];
export type LoginRequestStatus = (typeof LOGIN_REQUEST_STATUS)[number];
export type LoginView = (typeof LOGIN_VIEW)[number];
export type NoticeKind = (typeof NOTICE_KIND)[number];
export type MessSettle = (typeof MESS_SETTLE)[number];
export type MessStatus = (typeof MESS_STATUS)[number];
export type BountyStatus = (typeof BOUNTY_STATUS)[number];
export type ReminderState = (typeof REMINDER_STATE)[number];
export type AfterKind = (typeof AFTER_KIND)[number];
export type ShowKind = (typeof SHOW_KIND)[number];
export type ShowStatus = (typeof SHOW_STATUS)[number];
export type WatchHow = (typeof WATCH_HOW)[number];
export type ListAddResult = (typeof LIST_ADD_RESULT)[number];
export type HouseQuietFor = (typeof HOUSE_QUIET_FOR)[number];
export type TaskMood = (typeof TASK_MOOD)[number];
export type TaskOutcome = (typeof TASK_OUTCOME)[number];
export type TaskLooks = (typeof TASK_LOOKS)[number];
export type FeatureRequestStatus = (typeof FEATURE_REQUEST_STATUS)[number];
export type FeatureRequestSize = (typeof FEATURE_REQUEST_SIZE)[number];
export type SayKind = (typeof SAY_KIND)[number];
export type IouPayHow = (typeof IOU_PAY_HOW)[number];
export type IouPlanEvery = (typeof IOU_PLAN_EVERY)[number];

/** §7H an Inbox item's kind — derived from which of photo / url / text it has, never stored. */
export const INBOX_KIND = ['photo', 'link', 'text'] as const;
export type InboxKind = (typeof INBOX_KIND)[number];

/** /status `house.state` (§9.2) — derived from the deliveries table, never stored. */
export const HOUSE_STATE = ['ok', 'failing', 'not_configured', 'untried'] as const;
export type HouseState = (typeof HOUSE_STATE)[number];

export function isOneOf<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (list as readonly string[]).includes(v);
}

/** Member colors (§8.4), assigned in order at signup. Red and blue mean holidays. */
export const MEMBER_PALETTE = [
  '#FF6B35', '#10B981', '#8B5CF6', '#EC4899',
  '#F59E0B', '#06B6D4', '#84CC16', '#A16207',
] as const;
