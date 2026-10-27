// SPEC §7.2, §7.5 — the built-in calendar items each member can switch on or off: public holidays, 📈 options
// expiration, weather, moon phases and school days off. One row each: its /me key, its member_prefs column, the
// DayData key the calendar drops when it is off, and its Settings → 📅 Calendar label and title. Pure, imports nothing.

export const CALENDAR_ITEMS = [
  { pref: 'showPublicHolidays', column: 'show_public_holidays', day: 'publicHolidays', label: 'Public holidays', title: 'Public holidays' },
  { pref: 'showOptionsExpiration', column: 'show_options_expiration', day: 'marketDays', label: 'Monthly options expiration', title: '📈 Monthly options expiration' },
  { pref: 'showWeather', column: 'show_weather', day: 'weather', label: 'Weather', title: '🌤️ Weather' },
  { pref: 'showMoon', column: 'show_moon', day: 'moonPhases', label: 'Moon phases', title: '🌕 Moon phases' },
  { pref: 'showSchool', column: 'show_school', day: 'schoolDays', label: 'School days off', title: '🏫 School days off' },
] as const;

/** A built-in item's /me key (showMoon …). */
export type ItemPref = (typeof CALENDAR_ITEMS)[number]['pref'];
