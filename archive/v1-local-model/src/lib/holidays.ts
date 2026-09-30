// src/lib/holidays.ts — Built-in US federal holidays (auto-populated per year)

export interface Holiday {
  date: string;       // YYYY-MM-DD
  name: string;
  type: 'public';     // public = everyone off
}

/** Get all US federal holidays for a given year */
export function getPublicHolidays(year: number): Holiday[] {
  const holidays: Holiday[] = [];

  // Helper to find nth weekday of a month (e.g., "3rd Monday in January")
  function nthWeekdayOfMonth(month: number, dayOfWeek: number, n: number): Date {
    let count = 0;
    for (let day = 1; day <= 31; day++) {
      const d = new Date(year, month - 1, day);
      if (d.getMonth() !== month - 1) break; // past end of month
      if (d.getDay() === dayOfWeek) count++;
      if (count === n) return d;
    }
    throw new Error(`Could not find ${n}th weekday ${dayOfWeek} in month ${month}`);
  }

  // Helper for "last" weekday of a month
  function lastWeekdayOfMonth(month: number, dayOfWeek: number): Date {
    const lastDay = new Date(year, month, 0).getDate();
    for (let day = lastDay; day >= lastDay - 7; day--) {
      const d = new Date(year, month - 1, day);
      if (d.getDay() === dayOfWeek) return d;
    }
    throw new Error(`Could not find last weekday ${dayOfWeek} in month ${month}`);
  }

  // New Year's Day — Jan 1 (observed on nearest weekday)
  holidays.push({ date: formatDate(year, 1, 1), name: 'New Year\'s Day', type: 'public' });

  // MLK Day — 3rd Monday in January
  holidays.push({ date: formatDate(year, 1, nthWeekdayOfMonth(1, 1, 3)), name: "Martin Luther King Jr. Day", type: 'public' });

  // Presidents' Day — 3rd Monday in February
  holidays.push({ date: formatDate(year, 2, nthWeekdayOfMonth(2, 1, 3)), name: "Presidents' Day", type: 'public' });

  // Memorial Day — last Monday in May
  holidays.push({ date: formatDate(year, 5, lastWeekdayOfMonth(5, 1)), name: 'Memorial Day', type: 'public' });

  // Juneteenth — June 19 (observed on nearest weekday)
  holidays.push({ date: formatDate(year, 6, 19), name: "Juneteenth", type: 'public' });

  // Independence Day — July 4 (observed on nearest weekday)
  holidays.push({ date: formatDate(year, 7, 4), name: 'Independence Day', type: 'public' });

  // Labor Day — 1st Monday in September
  holidays.push({ date: formatDate(year, 9, nthWeekdayOfMonth(9, 1, 1)), name: "Labor Day", type: 'public' });

  // Columbus Day — 2nd Monday in October
  holidays.push({ date: formatDate(year, 10, nthWeekdayOfMonth(10, 1, 2)), name: "Columbus Day", type: 'public' });

  // Veterans Day — November 11 (observed on nearest weekday)
  holidays.push({ date: formatDate(year, 11, 11), name: "Veterans Day", type: 'public' });

  // Thanksgiving — 4th Thursday in November
  holidays.push({ date: formatDate(year, 11, nthWeekdayOfMonth(11, 4, 4)), name: 'Thanksgiving', type: 'public' });

  // Christmas — December 25 (observed on nearest weekday)
  holidays.push({ date: formatDate(year, 12, 25), name: "Christmas Day", type: 'public' });

  return holidays;
}

/** Get all school holidays for a given year (empty by default — user-configurable) */
export function getSchoolHolidays(_year: number): Holiday[] {
  // School holidays are stored in the database, not hardcoded.
  // This function is a placeholder that returns empty until the editor is built.
  return [];
}

/** Format date as YYYY-MM-DD */
function formatDate(year: number, month: number, day: number): string {
  const d = new Date(year, month - 1, day);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
