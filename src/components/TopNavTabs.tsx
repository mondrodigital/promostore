import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const TABS_HEIGHT = 56;

const tabs = [
  { label: 'Event Items', path: '/' },
  { label: 'Store', path: '/store' },
];

export default function TopNavTabs() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'center',
        borderBottom: '1px solid #e5e7eb',
        background: '#fff',
        height: TABS_HEIGHT,
        alignItems: 'center',
      }}
    >
      {tabs.map(tab => {
        const isActive = location.pathname === tab.path || (tab.path === '/' && location.pathname === '/event-items');
        return (
          <button
            key={tab.label}
            onClick={() => navigate(tab.path)}
            style={{
              padding: '16px 32px',
              border: 'none',
              background: 'none',
              fontWeight: isActive ? 700 : 500,
              color: isActive ? '#0075AE' : '#58595B',
              borderBottom: isActive ? '3px solid #0075AE' : '3px solid transparent',
              fontSize: '18px',
              cursor: 'pointer',
              outline: 'none',
              transition: 'color 0.2s, border-bottom 0.2s',
              height: '100%',
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
} 