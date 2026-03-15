import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  getPages,
  insertPage,
  deletePage,
  updatePage,
  uploadToStorage,
  getOrCreateTodayEdition,
  upsertEdition,
} from '../api';
import { useAuth } from '../context/AuthContext';
import './Upload.css';

const SECTIONS = ['News', 'Business', 'Sport', 'Vibez!', 'AgriToday'];

const SECTION_COLORS = {
  News:      { bg: '#ede9fe', color: '#5b21b6' },
  Business:  { bg: '#dcfce7', color: '#166534' },
  Sport:     { bg: '#dbeafe', color: '#1d4ed8' },
  'Vibez!':  { bg: '#fce7f3', color: '#9d174d' },
  AgriToday: { bg: '#fef9c3', color: '#854d0e' },
};

/**
 * Step 1 — check the filename itself for a section keyword.
 * Handles names like: Select News.pdf, SelectBusiness.pdf, NE_sport_05.pdf, vibez.pdf
 */
function detectSectionFromFilename(filename) {
  const name = filename.replace(/\.pdf$/i, '').toLowerCase();
  if (name.includes('agritoday') || name.includes('agri'))  return 'AgriToday';
  if (name.includes('vibez'))                               return 'Vibez!';
  if (name.includes('business'))                            return 'Business';
  if (name.includes('sport'))                               return 'Sport';
  if (name.includes('news'))                                return 'News';
  return null;
}

/**
 * Ordered keyword → section pairs used when reading text inside a PDF.
 * Most-specific terms first to avoid false positives.
 */
const SECTION_TEXT_KEYWORDS = [
  // AgriToday
  ['agritoday','AgriToday'],['agri today','AgriToday'],['agriculture','AgriToday'],
  ['farming','AgriToday'],['livestock','AgriToday'],['crop','AgriToday'],
  ['harvest','AgriToday'],['irrigation','AgriToday'],['green scheme','AgriToday'],
  ['farmer','AgriToday'],['cattle','AgriToday'],['maize','AgriToday'],
  ['fertilizer','AgriToday'],['food security','AgriToday'],['rural','AgriToday'],
  // Vibez!
  ['vibez','Vibez!'],['entertainment','Vibez!'],['lifestyle','Vibez!'],
  ['celebrity','Vibez!'],['fashion','Vibez!'],['music','Vibez!'],
  ['concert','Vibez!'],['festival','Vibez!'],['album','Vibez!'],
  ['drama','Vibez!'],['comedy','Vibez!'],['theatre','Vibez!'],
  ['movie','Vibez!'],['film','Vibez!'],['nightlife','Vibez!'],
  ['dance','Vibez!'],['culture','Vibez!'],
  // Business
  ['business','Business'],['tenders','Business'],['tender','Business'],
  ['accountant','Business'],['accounting','Business'],['audit','Business'],
  ['finance','Business'],['financial','Business'],['economy','Business'],
  ['economic','Business'],['market','Business'],['investment','Business'],
  ['corporate','Business'],['stock exchange','Business'],['nse','Business'],
  ['taxation','Business'],['tax','Business'],['revenue','Business'],
  ['budget','Business'],['banking','Business'],['insurance','Business'],
  ['inflation','Business'],['gdp','Business'],['trade','Business'],
  ['procurement','Business'],['quotation','Business'],['tender notice','Business'],
  // Sport
  ['sport','Sport'],['football','Sport'],['soccer','Sport'],['rugby','Sport'],
  ['cricket','Sport'],['athletics','Sport'],['marathon','Sport'],['boxing','Sport'],
  ['swimming','Sport'],['tennis','Sport'],['golf','Sport'],['basketball','Sport'],
  ['volleyball','Sport'],['cycling','Sport'],['championship','Sport'],
  ['league','Sport'],['tournament','Sport'],['fixture','Sport'],
  ['stadium','Sport'],['goal','Sport'],['kick-off','Sport'],
  ['handball','Sport'],['netball','Sport'],
  // News (catch-all — last)
  ['news','News'],['namibia','News'],['government','News'],['parliament','News'],
  ['minister','News'],['president','News'],['police','News'],['court','News'],
  ['crime','News'],['election','News'],['municipality','News'],['health','News'],
  ['education','News'],['school','News'],['hospital','News'],['policy','News'],
  ['legislation','News'],['region','News'],
];

/**
 * Step 2 — classify from text inside the PDF.
 * "Select X" headers printed at the top of a page take highest priority.
 */
function classifySectionFromText(text) {
  const lower = text.toLowerCase();

  // Highest priority: exact "Select <Section>" headers printed on the page
  if (lower.includes('select agritoday') || lower.includes('select agri today')) return 'AgriToday';
  if (lower.includes('select vibez'))    return 'Vibez!';
  if (lower.includes('select business')) return 'Business';
  if (lower.includes('select sport'))    return 'Sport';
  if (lower.includes('select news'))     return 'News';

  // Fallback: general keyword scan
  for (const [keyword, section] of SECTION_TEXT_KEYWORDS) {
    if (lower.includes(keyword)) return section;
  }
  return null;
}

/** Extract embedded text from first page of a PDF (digital PDFs only). */
async function extractTextFromPdf(file) {
  try {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.min.mjs`;
    const bytes = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();
    return content.items.map(i => i.str).join(' ');
  } catch {
    return '';
  }
}

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


function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Inline badge that doubles as a section selector dropdown. */
function SectionBadge({ page, onSectionChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = page.section || null;
  const style = SECTION_COLORS[current] || { bg: '#f3f4f6', color: '#6b7280' };

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', alignSelf: 'center' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Click to change section"
        style={{
          fontSize: '12px', fontWeight: '600',
          padding: '2px 8px', borderRadius: '12px',
          background: style.bg, color: style.color,
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '4px',
        }}
      >
        {current || 'Unclassified'}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '110%', left: 0, zIndex: 999,
          background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden', minWidth: '130px',
        }}>
          {SECTIONS.map(s => {
            const sc = SECTION_COLORS[s];
            return (
              <button
                key={s}
                onClick={() => { setOpen(false); onSectionChange(s); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '7px 12px', border: 'none', cursor: 'pointer',
                  fontSize: '12px', fontWeight: '600',
                  background: current === s ? sc.bg : '#fff',
                  color: sc.color,
                  borderLeft: current === s ? `3px solid ${sc.color}` : '3px solid transparent',
                }}
              >
                {s}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Upload() {
  const { user, isAdmin, isDesigner } = useAuth();
  const [pages, setPages] = useState([]);
  const [expectedPages, setExpectedPages] = useState('');
  const [deadline, setDeadline] = useState('15:00');
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState({});
  const [toast, setToast] = useState(null);
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
    async (file, existingPages) => {
      // ── Deduplication: skip if this filename already exists today ────────
      const alreadyExists = existingPages.some(
        (p) => p.filename.toLowerCase() === file.name.toLowerCase()
      );
      if (alreadyExists) {
        showToast(`${file.name} already uploaded — skipped (duplicate)`, 'error');
        return;
      }

      setUploadingFiles((prev) => ({ ...prev, [file.name]: 'uploading' }));
      try {
        const storagePath = `${todayStr}/${file.name}`;
        await uploadToStorage('Upload', storagePath, file);

        const filenamePageNum = extractPageNumberFromFilename(file.name);

        // Insert the page record immediately so it shows up in the list
        const newPage = await insertPage({
          edition_date: todayStr,
          filename: file.name,
          storage_path: storagePath,
          page_number: filenamePageNum,
          status: 'uploaded',
          uploaded_by: user?.email || 'unknown',
        });

        // ── Auto-classify: filename first, then PDF text as fallback ──────
        setUploadingFiles((prev) => ({ ...prev, [file.name]: 'analysing' }));
        const filenameSection = detectSectionFromFilename(file.name);
        let detectedSection = filenameSection;
        if (!detectedSection) {
          const pdfText = await extractTextFromPdf(file);
          detectedSection = classifySectionFromText(pdfText);
        }

        if (detectedSection && newPage?.id) {
          await updatePage(newPage.id, {
            section: detectedSection,
            status: 'analysed',
          }).catch(() => {});
        }

        setUploadingFiles((prev) => {
          const next = { ...prev };
          delete next[file.name];
          return next;
        });

        const sectionLabel = detectedSection ? ` → ${detectedSection}` : '';
        showToast(
          `${file.name} uploaded${filenamePageNum != null ? ` (p${filenamePageNum})` : ''}${sectionLabel}`,
          'success'
        );
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

      // Snapshot current pages for dedup check (shared across parallel uploads)
      const currentPages = await getPages(todayStr).catch(() => []);

      // Process all files in parallel — each gets the same snapshot for dedup
      await Promise.all(pdfFiles.map((file) => processOneFile(file, currentPages)));
      fetchPages();
    },
    [fetchPages, processOneFile, todayStr]
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
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{pages.length} pages</span>
          </div>
          <div className="file-list">
            <div className="file-list-header" style={{ gridTemplateColumns: '2fr 0.6fr 1fr 1fr 0.5fr' }}>
              <span>Filename</span>
              <span>Page #</span>
              <span>Section</span>
              <span>Uploaded</span>
              <span></span>
            </div>
            {[...pages]
              .sort((a, b) => {
                const na = extractPageNumberFromFilename(a.filename) ?? a.page_number ?? 9999;
                const nb = extractPageNumberFromFilename(b.filename) ?? b.page_number ?? 9999;
                return na - nb;
              })
              .map((page, idx) => (
              <div key={page.id || idx} className="file-list-row" style={{ gridTemplateColumns: '2fr 0.6fr 1fr 1fr 0.5fr' }}>
                <span className="file-filename mono">{page.filename}</span>
                <span className="file-page-num">
                  {page.page_number != null ? `p${page.page_number}` : '—'}
                </span>
                <SectionBadge page={page} onSectionChange={async (newSection) => {
                  try {
                    await updatePage(page.id, { section: newSection });
                    fetchPages();
                  } catch {
                    showToast('Failed to update section', 'error');
                  }
                }} />
                <span className="file-time mono">
                  {page.uploaded_at ? new Date(page.uploaded_at).toLocaleTimeString() : '—'}
                </span>
                <button
                  className="file-delete-btn"
                  onClick={() => handleDeletePage(page)}
                  title={`Delete ${page.filename}`}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                  </svg>
                  Delete
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
