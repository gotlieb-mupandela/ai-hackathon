/**
 * Designer Dashboard — overview for designers: today's deadline and upload count.
 * Designers do not see Publish or admin-only sections.
 */
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getPages, getOrCreateTodayEdition } from '../api';
import './DesignerDashboard.css';

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DesignerDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deadline, setDeadline] = useState('');
  const [myUploadCount, setMyUploadCount] = useState(0);
  const [countdown, setCountdown] = useState('');
  const todayStr = getTodayStr();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [pages, edition] = await Promise.all([
          getPages(todayStr),
          getOrCreateTodayEdition(todayStr),
        ]);
        if (cancelled) return;
        const deadlineStr = edition?.deadline || '15:00';
        setDeadline(deadlineStr);
        const mine = (pages || []).filter((p) => p.uploaded_by === user?.email);
        setMyUploadCount(mine.length);
        setError('');
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (user?.email) load();
    return () => { cancelled = true; };
  }, [todayStr, user?.email]);

  // Countdown to deadline
  useEffect(() => {
    if (!deadline) return;

    const updateCountdown = () => {
      const now = new Date();
      const today = getTodayStr();
      const [hours, minutes] = deadline.split(':');
      const deadlineDate = new Date(`${today}T${hours}:${minutes}:00`);
      const diff = deadlineDate - now;

      if (diff <= 0) {
        setCountdown('Time to publish!');
        return;
      }
      const hrs = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);
      setCountdown(`${hrs}h ${mins}m ${secs}s`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  if (loading) {
    return (
      <div className="designer-dashboard">
        <div className="designer-dashboard-loading">
          <div className="loading-spinner" />
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const displayDate = new Date(todayStr + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="designer-dashboard">
      <header className="page-header">
        <h1 className="page-title">Welcome back</h1>
        <p className="page-subtitle">Overview for {displayDate}</p>
      </header>

      {error && <div className="designer-dashboard-error">{error}</div>}

      <div className="designer-hero-panel">
        <div className="hero-stat-block">
          <h3 className="hero-stat-title">My Uploads Today</h3>
          <div className="hero-stat-value">
            <span className="stat-number">{myUploadCount}</span>
            <span className="stat-label">{myUploadCount === 1 ? 'page' : 'pages'}</span>
          </div>
          <p className="hero-stat-hint">Ready for this edition</p>
        </div>

        <div className="hero-divider"></div>

        <div className="hero-stat-block">
          <h3 className="hero-stat-title">Publication Deadline</h3>
          <div className="hero-stat-value">
            <span className="stat-countdown">{countdown || deadline}</span>
          </div>
          <p className="hero-stat-hint">Admin will publish at this time</p>
        </div>
      </div>

      <div className="designer-actions">
        <Link to="/upload" className="btn-primary-large">
          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Go to My Uploads
        </Link>
      </div>
    </div>
  );
}
