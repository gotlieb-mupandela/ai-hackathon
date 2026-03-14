import React, { useEffect, useState } from 'react';
import Calendar from 'react-calendar';
import { getEdition, getEditions, getStorageUrl } from '../api';
import './Archive.css';
import 'react-calendar/dist/Calendar.css';

export default function Archive() {
  const [publishedDates, setPublishedDates] = useState(new Set());
  const [allEditions, setAllEditions] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedEdition, setSelectedEdition] = useState(null);
  const [loadingEdition, setLoadingEdition] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [viewingPdf, setViewingPdf] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const editions = await getEditions();
        setAllEditions(editions);
        setPublishedDates(new Set(editions.map((e) => e.date)));
      } catch {
        // Silent fail
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleDateClick = async (date) => {
    const dateStr = toDateStr(date);
    setSelectedDate(dateStr);
    setSelectedEdition(null);
    setLoadingEdition(true);
    try {
      const edition = await getEdition(dateStr);
      setSelectedEdition(edition);
    } catch {
      setSelectedEdition(null);
    } finally {
      setLoadingEdition(false);
    }
  };

  const tileClassName = ({ date, view }) => {
    if (view === 'month') {
      const dateStr = toDateStr(date);
      if (publishedDates.has(dateStr)) return 'published-date';
    }
    return null;
  };

  const toDateStr = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-NA', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  };

  const getSectionCount = (edition) => {
    return edition.sections ? Object.keys(edition.sections).length : 0;
  };

  const getTotalPages = (edition) => {
    return edition.pages?.length || edition.expected_pages || '—';
  };

  return (
    <div className="archive-page">
      <div className="page-header">
        <h1 className="page-title">Archive</h1>
        <p className="page-subtitle">Browse all past editions by date. Highlighted dates have published editions.</p>
      </div>

      <div className="archive-body">
        {/* Calendar Panel */}
        <div className="calendar-panel">
          <h2 className="panel-title">Edition Calendar</h2>
          <div className="calendar-wrap">
            <Calendar
              onChange={setCalendarDate}
              value={selectedDate ? new Date(selectedDate + 'T12:00:00') : calendarDate}
              onClickDay={handleDateClick}
              tileClassName={tileClassName}
              locale="en-NA"
            />
          </div>
          <div className="calendar-legend">
            <span className="legend-dot" />
            <span className="legend-label">Published edition</span>
          </div>
          {loading && <div className="calendar-loading">Loading archive...</div>}
        </div>

        {/* Edition Detail Panel */}
        <div className="edition-detail-panel">
          {selectedDate && (
            <>
              <h2 className="panel-title">{formatDate(selectedDate)}</h2>
              {loadingEdition && (
                <div className="detail-loading">Loading edition data...</div>
              )}
              {!loadingEdition && !selectedEdition && (
                <div className="detail-empty">
                  No edition published for this date.
                </div>
              )}
              {!loadingEdition && selectedEdition && (
                <div className="edition-detail">
                  {/* Stats */}
                  <div className="detail-stats">
                    <div className="stat-card">
                      <div className="stat-value">{getTotalPages(selectedEdition)}</div>
                      <div className="stat-label">Pages</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value">{getSectionCount(selectedEdition)}</div>
                      <div className="stat-label">Sections</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-value stat-value--sm">{selectedEdition.published_at || '—'}</div>
                      <div className="stat-label">Published At</div>
                    </div>
                    <div className="stat-card">
                      <div className={`stat-badge stat-badge--${selectedEdition.status}`}>
                        {selectedEdition.status}
                      </div>
                      <div className="stat-label">Status</div>
                    </div>
                  </div>

                  {/* Sections */}
                  {selectedEdition.sections && (
                    <div className="detail-sections">
                      <h3 className="detail-section-title">Sections</h3>
                      <div className="sections-grid">
                        {Object.entries(selectedEdition.sections).map(([section, pages]) => (
                          <div key={section} className="section-row">
                            <span className={`section-badge section-badge--${section.toLowerCase()}`}>
                              {section}
                            </span>
                            <span className="section-page-range">
                              pp. {pages.join(', ')}
                            </span>
                            <span className="section-page-count">{pages.length} pages</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Output Files */}
                  {selectedEdition.storage_paths && (
                    <div className="detail-outputs">
                      <h3 className="detail-section-title">Output Files</h3>
                      <div className="outputs-list">
                        {Object.entries(selectedEdition.storage_paths).map(([key, path]) => {
                          if (!path) return null;
                          const filename = path.split('/').pop();
                          const url = getStorageUrl('outputs', path);
                          return (
                            <div key={key} className="output-row">
                              <div className="output-info">
                                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                <span className="output-name">{filename}</span>
                              </div>
                              <div className="output-actions">
                                <button
                                  className="output-view-btn"
                                  onClick={() => setViewingPdf({ url, filename })}
                                >
                                  View
                                </button>
                                <a href={url} download className="output-dl-btn">Download</a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          {!selectedDate && (
            <div className="detail-placeholder">
              <div className="placeholder-icon">
                <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p>Click a date on the calendar to view that edition's details.</p>
            </div>
          )}
        </div>
      </div>

      {/* All Editions List */}
      {allEditions.length > 0 && (
        <div className="all-editions-section">
          <h2 className="section-title">All Published Editions</h2>
          <div className="editions-table">
            <div className="editions-table-header">
              <span>Date</span>
              <span>Pages</span>
              <span>Sections</span>
              <span>Published At</span>
              <span>Status</span>
            </div>
            {allEditions.map((edition, idx) => (
              <div
                key={idx}
                className={`editions-table-row ${selectedDate === edition.date ? 'editions-table-row--selected' : ''}`}
                onClick={() => handleDateClick(new Date(edition.date + 'T12:00:00'))}
              >
                <span className="edition-table-date">{formatDate(edition.date)}</span>
                <span>{getTotalPages(edition)}</span>
                <span>{getSectionCount(edition)}</span>
                <span className="mono">{edition.published_at || '—'}</span>
                <span>
                  <span className={`status-badge status-badge--${edition.status}`}>
                    {edition.status}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PDF Viewer Modal */}
      {viewingPdf && (
        <div className="pdf-modal-overlay" onClick={() => setViewingPdf(null)}>
          <div className="pdf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pdf-modal-header">
              <span className="pdf-modal-title">{viewingPdf.filename}</span>
              <div style={{ display: 'flex', gap: 12 }}>
                <a href={viewingPdf.url} download className="pdf-download-btn">Download PDF</a>
                <button className="pdf-close-btn" onClick={() => setViewingPdf(null)}>
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <iframe src={viewingPdf.url} title={viewingPdf.filename} className="pdf-iframe" />
          </div>
        </div>
      )}
    </div>
  );
}
