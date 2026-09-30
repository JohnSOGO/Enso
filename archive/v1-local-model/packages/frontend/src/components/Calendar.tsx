// packages/frontend/src/components/Calendar.tsx — Continuous (Rolling) Calendar View
import { useState, useMemo, useCallback } from 'react';

interface Event {
  id: string;
  title: string;
  start_time: string;
  end_time?: string | null;
  color?: string | null;
  is_all_day: boolean;
  assigned_to?: string[];
}

// Member colors from spec palette
const MEMBER_COLORS = [
  '#FF6B35', // orange
  '#3B82F6', // blue
  '#10B981', // green
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#F59E0B', // amber
  '#EF4444', // red
  '#06B6D4', // cyan
  '#84CC16', // lime
];

interface Holiday {
  date: string;
  name: string;
  type: 'public' | 'school';
}

// Built-in US federal holidays (simplified — full list in src/lib/holidays.ts)
function getPublicHolidays(year: number): Holiday[] {
  const holidays: Holiday[] = [];
  
  function d(month: number, day: number): string {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // New Year's Day
  holidays.push({ date: d(1, 1), name: "New Year's Day", type: 'public' });
  // MLK Day (3rd Monday Jan) — approximated for Phase 1
  holidays.push({ date: d(1, 20), name: "MLK Day", type: 'public' });
  // Presidents' Day (3rd Monday Feb)
  holidays.push({ date: d(2, 17), name: "Presidents' Day", type: 'public' });
  // Memorial Day (last Mon May)
  holidays.push({ date: d(5, 26), name: 'Memorial Day', type: 'public' });
  // Juneteenth
  holidays.push({ date: d(6, 19), name: "Juneteenth", type: 'public' });
  // Independence Day
  holidays.push({ date: d(7, 4), name: 'Independence Day', type: 'public' });
  // Labor Day (1st Mon Sep)
  holidays.push({ date: d(9, 1), name: "Labor Day", type: 'public' });
  // Columbus Day (2nd Mon Oct)
  holidays.push({ date: d(10, 13), name: "Columbus Day", type: 'public' });
  // Veterans Day
  holidays.push({ date: d(11, 11), name: "Veterans Day", type: 'public' });
  // Thanksgiving (4th Thu Nov)
  holidays.push({ date: d(11, 27), name: 'Thanksgiving', type: 'public' });
  // Christmas
  holidays.push({ date: d(12, 25), name: "Christmas Day", type: 'public' });

  return holidays;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ROW_HEIGHT = 64; // px per day cell (compact)

interface CalendarProps {
  events?: Event[];
}

export default function CalendarView({ events = [] }: CalendarProps) {
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  
  // Selected day for bottom sheet
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // Generate weeks for display (start from the week containing startDate)
  const weeks = useMemo(() => {
    const result: { date: Date; events: Event[] }[][] = [];
    
    // Find the Monday of the week containing startDate
    const startOfWeek = new Date(startDate);
    const dayOfWeek = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);

    // Generate 52 weeks (one year) starting from this week
    for (let w = 0; w < 52; w++) {
      const week: { date: Date; events: Event[] }[] = [];
      
      for (let d = 0; d < 7; d++) {
        const date = new Date(startOfWeek);
        date.setDate(date.getDate() + w * 7 + d);
        
        // Find events for this day
        const dateStr = formatDate(date);
        const dayEvents = events.filter(e => e.start_time.startsWith(dateStr));
        
        week.push({ date, events: dayEvents });
      }
      
      result.push(week);
    }
    
    return result;
  }, [startDate, events]);

  // Get holidays for the visible year range
  const publicHolidays = useMemo(() => {
    const all: Holiday[] = [];
    for (let y = startDate.getFullYear() - 1; y <= startDate.getFullYear() + 2; y++) {
      all.push(...getPublicHolidays(y));
    }
    return new Set(all.map(h => h.date));
  }, [startDate]);

  // Get school holidays (placeholder — will be loaded from DB)
  const schoolHolidays = useMemo(() => {
    // Phase 1: empty set. Will load from API in Phase 2.
    return new Set<string>();
  }, []);

  // Check if a date is a holiday
  const getHolidayType = useCallback((dateStr: string): 'public' | 'school' | null => {
    if (publicHolidays.has(dateStr)) return 'public';
    if (schoolHolidays.has(dateStr)) return 'school';
    return null;
  }, [publicHolidays, schoolHolidays]);

  // Get the month name for a date
  const getMonthName = useCallback((date: Date): string => {
    return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }, []);

  // Check if this is the first row of a new month
  const isFirstOfMonth = (week: { date: Date; events: Event[] }[]): boolean => {
    return week[0].date.getDate() === 1 || 
      week.every((d, i) => d.date.getMonth() >= week[0].date.getMonth());
  };

  // Get alternating month background color (even=light, odd=dark)
  const getMonthBg = useCallback((month: number): string => {
    return month % 2 === 0 ? '#E2E8F0' : '#1E293B';
  }, []);

  // Get events for a selected day
  const getDayEvents = useCallback((date: Date): Event[] => {
    const dateStr = formatDate(date);
    return events.filter(e => e.start_time.startsWith(dateStr));
  }, [events]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Fixed header with days of week */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: '#1E293B',
        borderBottom: '1px solid #334155',
        padding: '8px 0',
      }}>
        {/* Month header */}
        <div style={{
          padding: '6px 16px',
          fontSize: '14px',
          fontWeight: 600,
          color: '#94A3B8',
          borderBottom: '2px solid #475569',
          background: getMonthBg(startDate.getMonth()),
        }}>
          {getMonthName(startDate)}
        </div>
        
        {/* Day headers */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(7, 1fr)`,
          padding: '4px 8px',
          fontSize: '12px',
          color: '#94A3B8',
          textAlign: 'center',
        }}>
          {DAYS.map(day => (
            <div key={day}>{day}</div>
          ))}
        </div>
      </header>

      {/* Scrollable calendar body */}
      <main style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
          {weeks.map((week, wi) => (
            <WeekRow 
              key={wi} 
              week={week} 
              getHolidayType={getHolidayType}

              getMonthBg={getMonthBg}
              onDayClick={(date) => setSelectedDay(date)}
            />
          ))}
      </main>

      {/* Bottom sheet for selected day */}
      {selectedDay && (
        <BottomSheet 
          date={selectedDay}
          events={getDayEvents(selectedDay)}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}

// Individual week row component
function WeekRow({ 
  week, 
  getHolidayType,
  getMonthBg,
  onDayClick
}: { 
  week: { date: Date; events: Event[] }[];
  getHolidayType: (s: string) => 'public' | 'school' | null;
  getMonthBg: (month: number) => string;
  onDayClick: (date: Date) => void;
}) {
  return (
    <>
      {/* Day cells — directly stacked */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(7, 1fr)`,
      }}>
        {week.map((day, dayIndex) => (
          <DayCell 
            key={dayIndex} 
            day={day.date} 
            events={day.events} 
            getHolidayType={getHolidayType}
            dayIndex={dayIndex}
            monthBg={getMonthBg(day.date.getMonth())}
            onClick={() => onDayClick(day.date)}
          />
        ))}
      </div>
    </>
  );
}

// Individual day cell component
function DayCell({ 
  day, 
  events, 
  getHolidayType,
  dayIndex,
  monthBg,
  onClick
}: { 
  day: Date; 
  events: Event[];
  getHolidayType: (s: string) => 'public' | 'school' | null;
  dayIndex: number;
  monthBg: string;
  onClick: () => void;
}) {
  const dateStr = formatDate(day);
  const holidayType = getHolidayType(dateStr);
  const isToday = day.toDateString() === new Date().toDateString();

  // Determine background color for the date number
  let bgStyle: React.CSSProperties = {};
  if (holidayType === 'public') {
    bgStyle = { background: 'rgba(239, 68, 68, 0.15)' };
  } else if (holidayType === 'school') {
    bgStyle = { background: 'rgba(59, 130, 246, 0.15)' };
  }

  return (
    <div 
      onClick={onClick}
      style={{
        padding: '4px',
        borderRight: dayIndex < 6 ? '1px solid rgba(51, 65, 85, 0.3)' : 'none',
        borderBottom: '1px solid rgba(51, 65, 85, 0.3)',
        minHeight: ROW_HEIGHT,
        cursor: 'pointer',
        background: monthBg,
      }}
    >
      {/* Date number */}
      <div style={{
        fontSize: '14px',
        fontWeight: holidayType ? 700 : (isToday ? 600 : 400),
        color: holidayType === 'public' 
          ? '#EF4444' 
          : holidayType === 'school' 
            ? '#3B82F6' 
            : isToday ? '#fff' : '#94A3B8',
        background: isToday && !holidayType ? '#3B82F6' : 'transparent',
        width: '28px', height: '28px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: '50%',
      }}>
        {day.getDate()}
      </div>

      {/* Event pills */}
      <div style={{ marginTop: '4px' }}>
        {events.slice(0, 2).map((evt, i) => (
          <EventPill key={i} event={evt} />
        ))}
        {events.length > 2 && (
          <div style={{ fontSize: '10px', color: '#94A3B8', paddingLeft: '4px' }}>
            +{events.length - 2} more
          </div>
        )}
      </div>
    </div>
  );
}

// Event pill component (colored bar)
function EventPill({ event }: { event: Event }) {
  const color = event.color || '#3B82F6';
  
  return (
    <div style={{
      fontSize: '10px',
      padding: '2px 4px',
      background: `${color}33`, // 20% opacity
      borderLeft: `2px solid ${color}`,
      borderRadius: '2px',
      color: '#E2E8F0',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      marginBottom: '1px',
    }}>
      {event.title}
    </div>
  );
}

// Bottom sheet for day detail view
function BottomSheet({ 
  date, 
  events, 
  onClose 
}: { 
  date: Date; 
  events: Event[];
  onClose: () => void;
}) {
  const monthName = date.toLocaleString('en-US', { month: 'long' });
  const dayNum = date.getDate();
  const year = date.getFullYear();

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      maxHeight: '60vh',
      background: '#1E293B',
      borderTopLeftRadius: '16px',
      borderTopRightRadius: '16px',
      boxShadow: '0 -4px 20px rgba(0,0,0,0.5)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Drag handle */}
      <div 
        onClick={onClose}
        style={{
          width: '40px',
          height: '4px',
          background: '#475569',
          borderRadius: '2px',
          margin: '8px auto 0',
          cursor: 'pointer',
        }}
      />

      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #334155',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 600, color: '#F8FAFC' }}>
            {monthName} {dayNum}, {year}
          </div>
          <div style={{ fontSize: '12px', color: '#94A3B8' }}>
            {events.length === 0 ? 'No events' : `${events.length} event${events.length > 1 ? 's' : ''}`}
          </div>
        </div>
        <button 
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '24px',
            color: '#94A3B8',
            cursor: 'pointer',
            padding: '0 8px',
          }}
        >
          ✕
        </button>
      </div>

      {/* Events list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
        {events.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            color: '#94A3B8', 
            padding: '24px 0',
            fontSize: '14px',
          }}>
            No events scheduled for this day.
          </div>
        ) : (
          events.map((evt, i) => (
            <EventCard key={i} event={evt} />
          ))
        )}
      </div>

      {/* Add event button */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid #334155',
      }}>
        <button 
          style={{
            width: '100%',
            background: '#3B82F6',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            padding: '12px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          + Add Event for {monthName} {dayNum}
        </button>
      </div>
    </div>
  );
}

// Event card component (for bottom sheet)
function EventCard({ event }: { event: Event }) {
  const color = event.color || '#3B82F6';
  
  return (
    <div style={{
      padding: '12px',
      background: `${color}15`, // 10% opacity
      borderLeft: `4px solid ${color}`,
      borderRadius: '8px',
      marginBottom: '8px',
    }}>
      <div style={{ fontSize: '14px', fontWeight: 500, color: '#F8FAFC' }}>
        {event.title}
      </div>
      {event.description && (
        <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>
          {event.description}
        </div>
      )}
    </div>
  );
}

// Format date as YYYY-MM-DD
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
