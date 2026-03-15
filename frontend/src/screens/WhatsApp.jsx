import React from 'react';
import SubscriberPanel from '../components/SubscriberPanel';
import './WhatsApp.css';

function Icon({ d, size = 20 }) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export default function WhatsApp() {
  return (
    <div className="wa-root">
      <header className="wa-header">
        <div className="wa-header-icon">
          <Icon d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" size={24} />
        </div>
        <div>
          <h1 className="wa-title">WhatsApp Notifications</h1>
          <p className="wa-subtitle">Manage subscribers, delivery preferences, and auto-send settings</p>
        </div>
      </header>

      <div className="wa-info-bar">
        <div className="wa-info-item">
          <Icon d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" size={16} />
          <span>PIN-protected PDFs sent on every publish</span>
        </div>
        <div className="wa-info-item">
          <Icon d="M13 10V3L4 14h7v7l9-11h-7z" size={16} />
          <span>Powered by local WhatsApp agent</span>
        </div>
        <div className="wa-info-item">
          <Icon d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" size={16} />
          <span>One-time PIN per subscriber per edition</span>
        </div>
      </div>

      <div className="wa-panel-wrap">
        <SubscriberPanel />
      </div>
    </div>
  );
}
