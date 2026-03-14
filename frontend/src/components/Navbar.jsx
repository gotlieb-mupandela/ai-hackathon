import React from 'react';
import { useAuth } from '../context/AuthContext';
import './Navbar.css';

export default function Navbar() {
  const { user, signOut } = useAuth();

  return (
    <header className="navbar">
      <div className="navbar-left">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="navbar-date">
          {new Date().toLocaleDateString('en-NA', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      </div>
      <div className="navbar-right">
        {user?.email && (
          <span className="navbar-user" title={user.email}>
            {user.email}
          </span>
        )}
        <div className="navbar-logo">
          <div className="navbar-logo-sun">
            <svg viewBox="0 0 100 50" width="40" height="20">
              <path d="M50 20 L50 5 M35 25 L20 15 M65 25 L80 15 M25 35 L10 30 M75 35 L90 30" stroke="#facc15" strokeWidth="3" strokeLinecap="round" />
              <path d="M50 45 L15 45 A35 35 0 0 1 85 45 Z" fill="none" stroke="#ef4444" strokeWidth="4" />
              <path d="M50 41 L21 41 A29 29 0 0 1 79 41 Z" fill="none" stroke="#f59e0b" strokeWidth="4" />
              <path d="M50 37 L27 37 A23 23 0 0 1 73 37 Z" fill="none" stroke="#facc15" strokeWidth="4" />
              <path d="M50 33 L33 33 A17 17 0 0 1 67 33 Z" fill="none" stroke="#22c55e" strokeWidth="4" />
              <path d="M50 29 L39 29 A11 11 0 0 1 61 29 Z" fill="none" stroke="#3b82f6" strokeWidth="4" />
              <circle cx="50" cy="45" r="12" fill="#facc15" />
            </svg>
          </div>
          <span className="navbar-logo-nepc">NEPC</span>
        </div>
        <span className="navbar-system-name">Editorial System</span>
        <div className="navbar-badge">
          <span className="badge-dot" />
          Live
        </div>
        <button type="button" className="navbar-logout" onClick={() => signOut()} aria-label="Sign out">
          Sign out
        </button>
      </div>
    </header>
  );
}
