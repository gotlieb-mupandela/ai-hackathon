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
        <span className="navbar-system-name">NewEra Editorial System</span>
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
