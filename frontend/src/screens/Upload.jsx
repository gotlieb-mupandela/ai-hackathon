import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  analyzePage,
  getPages,
  insertPage,
  updatePage,
  deletePage,
  uploadToStorage,
  getOrCreateTodayEdition,
  upsertEdition,
} from '../api';
import { useAuth } from '../context/AuthContext';
import './Upload.css';

/**
 * Extract page number from a filename like NE_20260302_05.pdf → 5
 * Supports patterns: _05.pdf, _5.pdf, -05.pdf, page05.pdf, (5).pdf, _01 (4).pdf → 1
 * Returns null if no clear page number is found.
 */
function extractPageNumberFromFilename(filename) {
  if (!filename) return null;
  const name = filename.replace(/\.pdf$/i, '').trim();

  // Pattern: _NN or -NN at the end (most common: NE_20260302_05)
  const trailingNum = name.match(/[_-](\d{1,3})(?:\s*\(\d+\))?$/);
  if (trailingNum) return parseInt(trailingNum[1], 10);

  // Pattern: page followed by digits
  const pagePrefix = name.match(/page\s*(\d{1,3})/i);
  if (pagePrefix) return parseInt(pagePrefix[1], 10);

  // Pattern: just a bare number as the whole name or after a space
  const bareNum = name.match(/(?:^|\s)(\d{1,3})$/);
  if (bareNum) return parseInt(bareNum[1], 10);

  return null;
}

const STATUS_COLORS = {
  uploaded: 'var(--text-muted)',
  analysing: 'var(--warning, #f59e0b)',
  analysed: 'var(--success)',
  error: 'var(--error)',
};

const STATUS_LABELS = {
  uploaded: 'Uploaded',
  analysing: 'Analysing…',
  analysed: 'Analysed',
  error: 'Error',
};

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Upload() {
  const { user, isAdmin, isDesigner } = useAuth();
  const [pages, setPages] = useState([]);
  const [expectedPages, setExpectedPages] = useState('');
  const [deadline, setDeadline] = useState('15:00');
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState({});
  const [toast, setToast] = useState(null);
  const [reanalyzing, setReanalyzing] = useState(false);
  const pollRef = useRef(null);
  const todayStr = getTodayStr();

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchPages = useCallback(async () => {
    try {
      const allPages = await getPages(todayStr);

      // For designers, filter to show only their uploads
      let filteredPages = allPages;
      if (isDesigner && user?.email) {
        filteredPages = allPages.filter(p => p.uploaded_by === user.email);
      }

      setPages(filteredPages);

      // Also fetch edition settings
      try {
        const edition = await getOrCreateTodayEdition(todayStr);
        if (edition) {
          setExpectedPages(edition.expected_pages != null ? String(edition.expected_pages) : '');
          setDeadline(edition.deadline || '15:00');
        }
      } catch {
        // Edition might not exist yet — that's fine
      }
    } catch {
      // Silent fail on poll
    }
  }, [isDesigner, user, todayStr]);

  useEffect(() => {
    fetchPages();
    pollRef.current = setInterval(fetchPages, 5000);
    return () => clearInterval(pollRef.current);
  }, [fetchPages]);

  const processOneFile = useCallback(
    async (file) => {
      setUploadingFiles((prev) => ({ ...prev, [file.name]: 'uploading' }));
      try {
        const storagePath = `${todayStr}/${file.name}`;
        await uploadToStorage('Upload', storagePath, file);

        setUploadingFiles((prev) => ({ ...prev, [file.name]: 'saved' }));
        const pageRecord = await insertPage({
          edition_date: todayStr,
          filename: file.name,
          storage_path: storagePath,
          status: 'uploaded',
          uploaded_by: user?.email || 'unknown',
        });

        // Check if page number is already in the filename (e.g. NE_20260302_05.pdf → 5)
        const filenamePageNum = extractPageNumberFromFilename(file.name);

        if (filenamePageNum != null) {
          // Page number found in filename — save immediately, skip AI vision call
          await updatePage(pageRecord.id, {
            page_number: filenamePageNum,
            section: null,
            headline: null,
            tags: [],
            status: 'analysed',
          });
          showToast(`${file.name} → page ${filenamePageNum} (from filename)`, 'success');
        } else {
          // No page number in filename — call AI vision to extract it
          setUploadingFiles((prev) => ({ ...prev, [file.name]: 'analysing' }));
          try {
            const analysis = await analyzePage(file);
            await updatePage(pageRecord.id, {
              page_number: analysis.page_number,
              section: analysis.section,
              headline: analysis.headline,
              tags: analysis.tags,
              status: 'analysed',
            });
            showToast(`${file.name} analysed → page ${analysis.page_number}`, 'success');
          } catch (analyzeErr) {
            console.error('Analysis failed:', analyzeErr);
            await updatePage(pageRecord.id, { status: 'error' });
            const isNetworkError = analyzeErr.code === 'ERR_NETWORK' ||
              analyzeErr.message?.includes('Network Error') ||
              analyzeErr.message?.includes('ECONNREFUSED');
            if (isNetworkError) {
              showToast(`${file.name} uploaded but analysis failed — is backend running?`, 'error');
            } else {
              showToast(`${file.name} analysis failed: ${analyzeErr.message}`, 'error');
            }
          }
        }

        setUploadingFiles((prev) => {
          const next = { ...prev };
          delete next[file.name];
          return next;
        });
      } catch (err) {
        setUploadingFiles((prev) => {
          const next = { ...prev };
          delete next[file.name];
          return next;
        });
        showToast(`Failed to upload ${file.name}: ${err.message || 'Unknown error'}`, 'error');
      }
    },
    [todayStr, user]
  );

  const onDrop = useCallback(
    async (acceptedFiles) => {
      const pdfFiles = acceptedFiles.filter((f) => {
        if (!f.name.toLowerCase().endsWith('.pdf')) {
          showToast(`${f.name} is not a PDF — skipped`, 'error');
          return false;
        }
        return true;
      });

      if (pdfFiles.length === 0) return;

      // Process ALL files in parallel for maximum speed
      await Promise.all(pdfFiles.map((file) => processOneFile(file)));
      fetchPages();
    },
    [fetchPages, processOneFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: true,
  });

  const handleSaveSettings = async () => {
    try {
      await upsertEdition({
        date: todayStr,
        expected_pages: expectedPages === '' ? null : Number(expectedPages),
        deadline: deadline || '15:00',
        status: 'draft',
      });
      setSettingsSaved(true);
      showToast('Settings saved', 'success');
      setTimeout(() => setSettingsSaved(false), 2000);
    } catch {
      showToast('Failed to save settings', 'error');
    }
  };

  const handleReanalyzeAll = async () => {
    if (reanalyzing || pages.length === 0) return;
    setReanalyzing(true);
    showToast(`Re-analyzing ${pages.length} pages in parallel…`, 'info');

    const { downloadFromStorage } = await import('../api');
    const results = await Promise.allSettled(
      pages.map(async (page) => {
        await updatePage(page.id, { status: 'analysing' });
        const blob = await downloadFromStorage('Upload', page.storage_path);
        const file = new File([blob], page.filename, { type: 'application/pdf' });
        const analysis = await analyzePage(file);
        await updatePage(page.id, {
          page_number: analysis.page_number,
          section: analysis.section,
          headline: analysis.headline,
          tags: analysis.tags,
          status: 'analysed',
        });
      })
    );

    const done = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    // Mark failed pages
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'rejected') {
        await updatePage(pages[i].id, { status: 'error' }).catch(() => {});
      }
    }

    setReanalyzing(false);
    fetchPages();
    if (failed > 0) {
      showToast(`Done: ${done} analysed, ${failed} failed. Is the backend running?`, 'error');
    } else {
      showToast(`All ${done} pages re-analyzed in parallel`, 'success');
    }
  };

  const handleDeletePage = async (page) => {
    if (!window.confirm(`Delete "${page.filename}"? This cannot be undone.`)) return;
    try {
      await deletePage(page.id, page.storage_path);
      showToast(`Deleted ${page.filename}`, 'success');
      fetchPages();
    } catch (err) {
      showToast(`Failed to delete: ${err.message}`, 'error');
    }
  };

  const uploadedCount = pages.length;
  const hasActiveUploads = Object.keys(uploadingFiles).length > 0;

  return (
    <div className="upload-page">
      {/* Toast */}
      {toast && (
        <div className={`toast toast--${toast.type}`}>{toast.message}</div>
      )}

      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">{isDesigner ? 'My Uploads' : 'Upload Portal'}</h1>
        <p className="page-subtitle">
          {isDesigner 
            ? 'Upload your PDF pages here. All uploads are monitored by the admin dashboard.'
            : 'Designers upload individual PDF pages here. The system handles everything else.'
          }
        </p>
      </div>

      {/* Settings Bar - Only for admins */}
      {isAdmin && (
        <div className="settings-bar">
          <div className="settings-info">
            <strong>Daily Edition Settings</strong>
            <p style={{margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-muted)'}}>
              Set your publication deadline. The pipeline will auto-run at that time.
            </p>
          </div>
          <div className="settings-group">
            <label className="settings-label">Publication Deadline <span style={{color: 'var(--error)'}}>*</span></label>
            <input
              type="time"
              className="settings-input"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              aria-label="Publication deadline time"
            />
            <small style={{fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginTop: '4px'}}>
              Pipeline auto-runs at this time (even if not all pages are ready)
            </small>
          </div>
          <button
            className={`settings-save-btn ${settingsSaved ? 'settings-save-btn--saved' : ''}`}
            onClick={handleSaveSettings}
            disabled={!deadline}
          >
            {settingsSaved ? '✓ Saved' : 'Save Settings'}
          </button>
        </div>
      )}


      {/* Drop Zone */}
      <div
        {...getRootProps()}
        className={`dropzone ${isDragActive ? 'dropzone--active' : ''} ${hasActiveUploads ? 'dropzone--uploading' : ''}`}
      >
        <input {...getInputProps()} />
        <div className="dropzone-icon">
          <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </div>
        {isDragActive ? (
          <p className="dropzone-text">Drop PDF pages here...</p>
        ) : (
          <>
            <p className="dropzone-text">Drag & drop PDF pages here</p>
            <p className="dropzone-hint">or click to browse files — accepts .pdf only</p>
          </>
        )}
      </div>

      {/* Active uploads */}
      {Object.entries(uploadingFiles).map(([filename, stage]) => (
        <div key={filename} className="uploading-item">
          <span className="uploading-filename">{filename}</span>
          <div className="uploading-bar-wrap">
            <div className="uploading-bar" style={{ width: stage === 'analysing' ? '66%' : stage === 'saved' ? '33%' : '100%' }} />
          </div>
          <span className="uploading-percent">
            {stage === 'uploading' ? 'Uploading…' : stage === 'saved' ? 'Saving…' : stage === 'analysing' ? 'Analysing…' : 'Done'}
          </span>
        </div>
      ))}

      {/* File list */}
      {pages.length > 0 && (
        <div className="file-list-section">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h2 className="section-title" style={{ margin: 0 }}>{isDesigner ? 'My Uploaded Pages' : 'Uploaded Pages'}</h2>
            <button
              onClick={handleReanalyzeAll}
              disabled={reanalyzing}
              style={{
                background: reanalyzing ? '#6b7280' : 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 18px',
                fontWeight: '600',
                fontSize: '13px',
                cursor: reanalyzing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
              }}
            >
              {reanalyzing ? (
                <><span className="spin" style={{ display: 'inline-block' }}>↻</span> Analyzing…</>
              ) : (
                <>↻ Re-Analyze All</>
              )}
            </button>
          </div>
          <div className="file-list">
            <div className="file-list-header">
              <span>Filename</span>
              <span>Page #</span>
              <span>Section</span>
              <span>Headline</span>
              <span>Uploaded</span>
              <span>Status</span>
              <span></span>
            </div>
            {pages.map((page, idx) => (
              <div key={page.id || idx} className="file-list-row">
                <span className="file-filename mono">{page.filename}</span>
                <span className="file-page-num">
                  {page.page_number != null ? `p${page.page_number}` : '—'}
                </span>
                <span className="file-section">
                  {page.section ? (
                    <span className={`section-badge section-badge--${page.section?.toLowerCase().replace(/[^a-z0-9]/g, '')}`}>
                      {page.section}
                    </span>
                  ) : '—'}
                </span>
                <span className="file-headline" title={page.headline}>
                  {page.headline ? page.headline.substring(0, 50) + (page.headline.length > 50 ? '…' : '') : '—'}
                </span>
                <span className="file-time mono">
                  {page.uploaded_at ? new Date(page.uploaded_at).toLocaleTimeString() : '—'}
                </span>
                <span
                  className="file-status"
                  style={{ color: STATUS_COLORS[page.status] || 'var(--text-muted)' }}
                >
                  {STATUS_LABELS[page.status] || page.status || 'Pending'}
                </span>
                <button
                  className="file-delete-btn"
                  onClick={() => handleDeletePage(page)}
                  title={`Delete ${page.filename}`}
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {pages.length === 0 && !hasActiveUploads && (
        <div className="empty-state">
          <p>{isDesigner ? 'You haven\'t uploaded any pages yet for today\'s edition.' : 'No pages uploaded yet for today\'s edition.'}</p>
        </div>
      )}
    </div>
  );
}
