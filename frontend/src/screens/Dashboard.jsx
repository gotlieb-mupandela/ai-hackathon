/**
 * Admin Dashboard - View all uploads grouped by designer.
 * Reads directly from Supabase pages table.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { getPages, getOrCreateTodayEdition } from '../api';
import SubscriberPanel from '../components/SubscriberPanel';
import './Dashboard.css';

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Dashboard() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadsByDesigner, setUploadsByDesigner] = useState({});
  const [countdown, setCountdown] = useState('');
  const todayStr = getTodayStr();

  const groupUploadsByDesigner = useCallback((pages) => {
    const grouped = {};
    pages.forEach((page) => {
      const designer = page.uploaded_by || 'Unknown';
      if (!grouped[designer]) {
        grouped[designer] = [];
      }
      grouped[designer].push(page);
    });
    setUploadsByDesigner(grouped);
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const [pages, edition] = await Promise.all([
        getPages(todayStr),
        getOrCreateTodayEdition(todayStr),
      ]);
      setStatus({
        date: todayStr,
        uploaded_count: pages.length,
        expected_pages: edition?.expected_pages || 24,
        deadline: edition?.deadline || '15:00',
        is_running: false,
        is_complete: edition?.status === 'published',
      });
      groupUploadsByDesigner(pages);
      setError('');
    } catch (err) {
      console.error('Error fetching status:', err);
      setError(err.message || 'Failed to fetch uploads');
    } finally {
      setLoading(false);
    }
  }, [todayStr, groupUploadsByDesigner]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Countdown timer for deadline
  useEffect(() => {
    if (!status?.deadline) return;

    const updateCountdown = () => {
      const now = new Date();
      const today = getTodayStr();
      const [hours, minutes] = status.deadline.split(':');
      const deadline = new Date(`${today}T${hours}:${minutes}:00`);

      const diff = deadline - now;
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
    const countdownInterval = setInterval(updateCountdown, 1000);
    return () => clearInterval(countdownInterval);
  }, [status?.deadline]);

  const getStatusBadgeClass = (pageStatus) => {
    const statusMap = {
      uploaded: 'status-uploaded',
      analysing: 'status-analyzing',
      analysed: 'status-analyzed',
      published: 'status-published',
      error: 'status-error',
    };
    return statusMap[pageStatus] || 'status-default';
  };

  if (loading) {
    return (
      <div className="dashboard-screen">
        <div className="dashboard-loading">
          <div className="loading-spinner"></div>
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const designerEmails = Object.keys(uploadsByDesigner).sort();

  return (
    <div className="dashboard-screen">
      <header className="page-header">
        <h1 className="page-title">Admin Dashboard</h1>
        <p className="page-subtitle">Monitor all designer uploads for {status?.date || 'today'}</p>
      </header>

      {/* Overall Progress */}
      <div className="admin-hero-panel">
        <div className="hero-stat-block">
          <h3 className="hero-stat-title">Total Uploads Today</h3>
          <div className="hero-stat-value">
            <span className="stat-number">{status?.uploaded_count || 0}</span>
            <span className="stat-label">pages</span>
          </div>
          <p className="hero-stat-hint">From all designers</p>
        </div>

        <div className="hero-divider"></div>

        <div className="hero-stat-block">
          <h3 className="hero-stat-title">Publication Deadline</h3>
          <div className="hero-stat-value">
            <span className="stat-countdown">{countdown || status?.deadline || '15:00'}</span>
          </div>
          <p className="hero-stat-hint">
            {status?.is_complete ? (
              <span style={{ color: '#34d399', fontWeight: 'bold' }}>✓ Edition Published</span>
            ) : (
              'Pipeline auto-runs at this time'
            )}
          </p>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Designer Upload Blocks */}
      <div className="dashboard-content">
        <h2 className="section-title">
          Uploads by Designer ({designerEmails.length})
        </h2>

        {designerEmails.length === 0 ? (
          <div className="empty-state">
            <p className="empty-text">No uploads yet</p>
            <p className="empty-hint">
              Waiting for designers to upload pages for today's edition
            </p>
          </div>
        ) : (
          <div className="designer-blocks">
            {designerEmails.map((email) => {
              const pages = uploadsByDesigner[email];
              return (
                <div key={email} className="designer-block">
                  <div className="designer-block-header">
                    <div className="designer-name">
                      {email}
                    </div>
                    <span className="designer-count">
                      {pages.length} {pages.length === 1 ? 'page' : 'pages'}
                    </span>
                  </div>
                  <div className="designer-uploads">
                    {pages.map((page, idx) => (
                      <div key={page.id || idx} className="upload-card">
                        <div className="upload-info">
                          <div className="upload-filename">{page.filename}</div>
                          <div className="upload-meta">
                            {page.page_number && (
                              <span className="meta-item">
                                Page {page.page_number}
                              </span>
                            )}
                            {page.section && (
                              <span className="meta-item">{page.section}</span>
                            )}
                            <span className="meta-item upload-time">
                              {page.uploaded_at ? new Date(page.uploaded_at).toLocaleTimeString() : '—'}
                            </span>
                          </div>
                          {page.headline && (
                            <div className="upload-headline">{page.headline}</div>
                          )}
                        </div>
                        <span
                          className={`status-badge ${getStatusBadgeClass(page.status)}`}
                        >
                          {page.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* WhatsApp Subscriber Management */}
      <div className="dashboard-content">
        <h2 className="section-title">WhatsApp Notifications</h2>
        <SubscriberPanel />
      </div>
    </div>
  );
}
