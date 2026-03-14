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

  const getProgressPercentage = () => {
    if (!status) return 0;
    return Math.round((status.uploaded_count / status.expected_pages) * 100);
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
      <div className="dashboard-progress-panel">
        <div className="progress-header">
          <div className="progress-info">
            <h3 className="progress-title">Edition Progress</h3>
            <div className="progress-stats">
              <span className="stat-number">{status?.uploaded_count || 0}</span>
              <span className="stat-separator">/</span>
              <span className="stat-total">{status?.expected_pages || 0}</span>
              <span className="stat-label">pages</span>
            </div>
          </div>
          <div className="progress-badges">
            {status?.is_complete && (
              <span className="badge badge-complete">Published</span>
            )}
            <span className="badge badge-deadline">
              Deadline: {status?.deadline || '15:00'}
            </span>
          </div>
        </div>
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${getProgressPercentage()}%` }}
          >
            <span className="progress-label">{getProgressPercentage()}%</span>
          </div>
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
