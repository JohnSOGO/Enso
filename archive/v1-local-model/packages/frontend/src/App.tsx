// packages/frontend/src/App.tsx — Main app shell (Phase 1 skeleton)
import { useState } from 'react';
import CalendarView from './components/Calendar';

export default function App() {
  const [activeTab, setActiveTab] = useState<'calendar' | 'reminders' | 'members'>('calendar');

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <header style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--surface)',
      }}>
        <span style={{ fontWeight: 600, fontSize: '18px' }}>Home Reminder</span>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button style={iconBtnStyle} title="Notifications">🔔</button>
          <button style={iconBtnStyle} title="Profile">👤</button>
        </div>
      </header>

      {/* Main content */}
      <main style={{ flex: 1, overflow: 'auto' }}>
        {activeTab === 'calendar' && <CalendarView />}
        {activeTab === 'reminders' && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Active reminders will appear here.
          </div>
        )}
        {activeTab === 'members' && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Household members will be listed here.
          </div>
        )}
      </main>

      {/* Bottom bar */}
      <nav style={{
        display: 'flex',
        borderTop: '1px solid var(--border)',
        background: 'var(--surface)',
      }}>
        {[
          { key: 'calendar' as const, icon: '📅', label: 'Calendar' },
          { key: 'reminders' as const, icon: '⏰', label: 'Reminders' },
          { key: 'members' as const, icon: '👥', label: 'Members' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              ...navBtnStyle,
              background: activeTab === tab.key ? 'var(--accent)' : 'transparent',
              color: activeTab === tab.key ? '#fff' : 'var(--text-secondary)',
            }}
          >
            <span>{tab.icon}</span>
            <span style={{ fontSize: '12px' }}>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Quick actions */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-around',
        padding: '8px 0',
        borderTop: '1px solid var(--border)',
        background: 'var(--surface)',
      }}>
        <button style={quickBtnStyle}>+ Add Event</button>
        <button style={quickBtnStyle}>📅 Today</button>
      </div>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: '20px',
  cursor: 'pointer',
  padding: '4px',
};

const navBtnStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  cursor: 'pointer',
  padding: '8px 0',
  transition: 'background 0.2s',
};

const quickBtnStyle: React.CSSProperties = {
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  padding: '8px 16px',
  cursor: 'pointer',
  fontSize: '14px',
};
