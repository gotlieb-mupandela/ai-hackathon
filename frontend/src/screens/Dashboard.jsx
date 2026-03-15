import React, { useState, useEffect, useCallback } from 'react';
import { getPages, getOrCreateTodayEdition } from '../api';
import { useAuth } from '../context/AuthContext';
import './Dashboard.css';

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function Icon({ d, size = 20 }) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const SECTION_COLORS = {
  News:      { bg: '#ede9fe', text: '#5b21b6', border: '#ddd6fe' },
  Business:  { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' },
  Sport:     { bg: '#dbeafe', text: '#1d4ed8', border: '#bfdbfe' },
  'Vibez!':  { bg: '#fce7f3', text: '#9d174d', border: '#fbcfe8' },
  AgriToday: { bg: '#fef9c3', text: '#854d0e', border: '#fef08a' },
};

const STATUS_STYLES = {
  uploaded:  { bg: 'rgba(59, 130, 246, 0.08)',  text: '#3b82f6', border: 'rgba(59, 130, 246, 0.2)' },
  analysing: { bg: 'rgba(245, 158, 11, 0.08)', text: '#f59e0b', border: 'rgba(245, 158, 11, 0.2)' },
  analysed:  { bg: 'rgba(139, 92, 246, 0.08)',  text: '#8b5cf6', border: 'rgba(139, 92, 246, 0.2)' },
  published: { bg: 'rgba(16, 185, 129, 0.08)',  text: '#10b981', border: 'rgba(16, 185, 129, 0.2)' },
  error:     { bg: 'rgba(239, 68, 68, 0.08)',   text: '#ef4444', border: 'rgba(239, 68, 68, 0.2)' },
};

function StatCard({ icon, label, value, sub, accent }) {
  return (
    <div className="dash-stat">
      <div className="dash-stat-icon" style={{ background: accent ? `${accent}12` : undefined, color: accent }}>
        <Icon d={icon} size={22} />
      </div>
      <div className="dash-stat-body">
        <span className="dash-stat-label">{label}</span>
        <span className="dash-stat-value">{value}</span>
        {sub && <span className="dash-stat-sub">{sub}</span>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadsByDesigner, setUploadsByDesigner] = useState({});
  const [sectionCounts, setSectionCounts] = useState({});
  const [countdown, setCountdown] = useState('');
  const todayStr = getTodayStr();

  const fetchStatus = useCallback(async () => {
    try {
      const [pages, edition] = await Promise.all([
        getPages(todayStr),
        getOrCreateTodayEdition(todayStr),
      ]);

      const grouped = {};
      const sections = {};
      pages.forEach((page) => {
        const designer = page.uploaded_by || 'Unknown';
        if (!grouped[designer]) grouped[designer] = [];
        grouped[designer].push(page);
        const sec = page.section || 'Unclassified';
        sections[sec] = (sections[sec] || 0) + 1;
      });

      setUploadsByDesigner(grouped);
      setSectionCounts(sections);
      setStatus({
        date: todayStr,
        uploaded_count: pages.length,
        expected_pages: edition?.expected_pages || 24,
        deadline: edition?.deadline || '15:00',
        is_complete: edition?.status === 'published',
      });
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [todayStr]);

  useEffect(() => {
    fetchStatus();
    const iv = setInterval(fetchStatus, 5000);
    return () => clearInterval(iv);
  }, [fetchStatus]);

  useEffect(() => {
    if (!status?.deadline) return;
    const tick = () => {
      const now = new Date();
      const [hh, mm] = status.deadline.split(':');
      const dl = new Date(`${getTodayStr()}T${hh}:${mm}:00`);
      const diff = dl - now;
      if (diff <= 0) { setCountdown('Now'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${h}h ${m}m ${s}s`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [status?.deadline]);

  if (loading) {
    return (
      <div className="dash-root">
        <div className="dash-loading"><div className="dash-spinner" /><span>Loading dashboard...</span></div>
      </div>
    );
  }

  const designers = Object.keys(uploadsByDesigner).sort();
  const userName = user?.email?.split('@')[0] || 'Admin';
  const progress = status ? Math.min(Math.round((status.uploaded_count / status.expected_pages) * 100), 100) : 0;

  return (
    <div className="dash-root">
      {/* ── Header ──────────────────────────────────────── */}
      <header className="dash-header">
        <div className="dash-header-left">
          <span className="dash-greeting">{getGreeting()}</span>
          <h1 className="dash-user-name">{userName}</h1>
          <p className="dash-header-sub">Welcome to the editorial dashboard</p>
        </div>
        <div className="dash-header-right">
          <div className="dash-date-chip">
            <Icon d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" size={16} />
            <span>{todayStr}</span>
          </div>
          <div className="dash-avatar">
            {userName.charAt(0).toUpperCase()}
          </div>
        </div>
      </header>

      {/* ── Quick Stats Row ──────────────────────────────── */}
      <div className="dash-stats-row">
        <StatCard
          icon="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
          label="Total Uploads"
          value={status?.uploaded_count || 0}
          sub="pages today"
          accent="#3b82f6"
        />
        <StatCard
          icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
          label="Active Designers"
          value={designers.length}
          sub="uploading today"
          accent="#8b5cf6"
        />
        <StatCard
          icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          label="Deadline"
          value={countdown || status?.deadline || '15:00'}
          sub={status?.is_complete ? 'Published' : 'time remaining'}
          accent={status?.is_complete ? '#10b981' : '#f59e0b'}
        />
        <StatCard
          icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          label="Progress"
          value={`${progress}%`}
          sub={`${status?.uploaded_count || 0} / ${status?.expected_pages || 24}`}
          accent={progress >= 100 ? '#10b981' : '#D32F2F'}
        />
      </div>

      {/* ── Progress Bar ─────────────────────────────────── */}
      <div className="dash-progress-wrap">
        <div className="dash-progress-header">
          <span className="dash-progress-title">Edition Progress</span>
          <span className="dash-progress-pct" style={{ color: progress >= 100 ? '#10b981' : '#D32F2F' }}>{progress}%</span>
        </div>
        <div className="dash-progress-bar">
          <div
            className="dash-progress-fill"
            style={{ width: `${progress}%`, background: progress >= 100 ? 'linear-gradient(90deg, #10b981, #34d399)' : 'linear-gradient(90deg, #D32F2F, #ef5350)' }}
          />
        </div>
      </div>

      {error && <div className="dash-error">{error}</div>}

      {/* ── Two-Column Body ──────────────────────────────── */}
      <div className="dash-body">
        {/* Left: Designer uploads */}
        <div className="dash-main-col">
          <div className="dash-card">
            <div className="dash-card-header">
              <div className="dash-card-title-group">
                <Icon d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                <h2 className="dash-card-title">Uploads by Designer</h2>
              </div>
              <span className="dash-card-badge">{designers.length} designer{designers.length !== 1 ? 's' : ''}</span>
            </div>

            {designers.length === 0 ? (
              <div className="dash-empty">
                <Icon d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" size={32} />
                <p className="dash-empty-title">No uploads yet</p>
                <p className="dash-empty-sub">Waiting for designers to upload pages</p>
              </div>
            ) : (
              <div className="dash-designer-list">
                {designers.map((email) => {
                  const pages = uploadsByDesigner[email];
                  return (
                    <div key={email} className="dash-designer">
                      <div className="dash-designer-head">
                        <div className="dash-designer-avatar">{email.charAt(0).toUpperCase()}</div>
                        <div className="dash-designer-info">
                          <span className="dash-designer-email">{email}</span>
                          <span className="dash-designer-count">{pages.length} page{pages.length !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      <div className="dash-file-list">
                        {pages.map((page, idx) => {
                          const st = STATUS_STYLES[page.status] || STATUS_STYLES.uploaded;
                          const sc = SECTION_COLORS[page.section];
                          return (
                            <div key={page.id || idx} className="dash-file">
                              <div className="dash-file-left">
                                <span className="dash-file-name">{page.filename}</span>
                                <div className="dash-file-meta">
                                  {page.page_number != null && <span className="dash-file-tag">p{page.page_number}</span>}
                                  {page.section && (
                                    <span className="dash-file-section" style={sc ? { background: sc.bg, color: sc.text, borderColor: sc.border } : {}}>
                                      {page.section}
                                    </span>
                                  )}
                                  <span className="dash-file-time">
                                    {page.uploaded_at ? new Date(page.uploaded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                  </span>
                                </div>
                              </div>
                              <span className="dash-file-status" style={{ background: st.bg, color: st.text, borderColor: st.border }}>
                                {page.status}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Sections + Subscribers */}
        <div className="dash-side-col">
          {/* Section breakdown */}
          <div className="dash-card">
            <div className="dash-card-header">
              <div className="dash-card-title-group">
                <Icon d="M4 6h16M4 12h8m-8 6h16" />
                <h2 className="dash-card-title">Sections</h2>
              </div>
            </div>
            <div className="dash-sections">
              {['News', 'Business', 'Sport', 'Vibez!', 'AgriToday'].map(sec => {
                const count = sectionCounts[sec] || 0;
                const sc = SECTION_COLORS[sec] || {};
                return (
                  <div key={sec} className="dash-section-row">
                    <div className="dash-section-label">
                      <span className="dash-section-dot" style={{ background: sc.text || '#94a3b8' }} />
                      <span>{sec}</span>
                    </div>
                    <span className="dash-section-count" style={{
                      background: count > 0 ? sc.bg : '#f1f5f9',
                      color: count > 0 ? sc.text : '#94a3b8',
                      borderColor: count > 0 ? sc.border : '#e2e8f0',
                    }}>
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
