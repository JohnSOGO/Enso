// SPEC §8.6 ⚑ Q247–Q248 — Settings → ℹ️ About: the opening screen's look (§8.10) in the modal, its build stamp as the
// revision, and who made it. Nothing to change, nothing fetched.
import s from './SettingsAbout.module.css';

/** §8.10 the tagline, written once; frontend/index.html (plain HTML, no import) is held to it by a test. */
export const TAGLINE = ['Closing the loop.', 'Peace of mind, every day.'] as const;

export function SettingsAbout() {
  return (
    <div className={s.about}>
      <img src="/icon.svg" alt="" className={s.logo} />
      <h2 className={s.name}>Ensō</h2>
      <p className={s.tagline}>{TAGLINE.map((t, i) => <span key={t}>{i > 0 && ' '}{t}</span>)}</p>
      <p className={s.build}>{__ENSO_BUILD__}</p>
      <p className={s.credit}>Developed by MojoSOGO · with Claude</p>
    </div>
  );
}
