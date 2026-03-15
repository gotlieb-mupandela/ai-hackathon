import React, { useState, useCallback, useRef, useEffect } from 'react';
import './PdfReader.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8001';

const SECTION_LABELS = {
  full_paper: 'Full Newspaper',
  news: 'News',
  sport: 'Sport',
  business: 'Business',
  vibez: 'Vibez!',
  agritoday: 'AgriToday',
};

function Icon({ d, size = 20 }) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/**
 * Diagonal repeating watermark.
 * Subscriber phone + PIN appears on every screenshotted tile — fully traceable.
 */
function Watermark({ phone, pin }) {
  const label = `${phone}  •  ${pin}`;
  const tiles = Array.from({ length: 80 });
  return (
    <div className="reader-watermark" aria-hidden="true">
      <div className="reader-watermark-inner">
        {tiles.map((_, i) => (
          <span key={i} className="reader-watermark-text">{label}</span>
        ))}
      </div>
    </div>
  );
}

/**
 * Full-screen black overlay shown on focus loss / tab switch.
 * Hides content from screen-capture tools that capture the visible frame.
 */
function SecurityOverlay() {
  return (
    <div className="reader-security-overlay">
      <div className="reader-security-overlay-icon">
        <Icon d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" size={28} />
      </div>
      <p className="reader-security-overlay-title">Content Hidden</p>
      <p className="reader-security-overlay-sub">
        Return to this tab to continue reading. This content is protected and cannot be captured or shared.
      </p>
    </div>
  );
}

/**
 * Canvas-based PDF renderer using pdfjs-dist.
 *
 * Why canvas instead of <iframe>:
 *   - The browser never receives a raw PDF URL — it only sees an ArrayBuffer fetched
 *     by our code. There is no "Save as PDF" button, no share sheet, no context menu entry.
 *   - Chrome/Firefox built-in PDF viewers expose download buttons we cannot hide;
 *     canvas eliminates that entirely.
 */
function CanvasPdfViewer({ pdfBytes }) {
  const containerRef = useRef(null);
  const renderingRef = useRef(false);

  useEffect(() => {
    if (!pdfBytes || renderingRef.current) return;
    renderingRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.min.mjs`;

        const pdf = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
        if (cancelled || !containerRef.current) return;

        // Clear previous canvases
        containerRef.current.innerHTML = '';

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          if (cancelled) break;
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1.5 });

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = 'reader-canvas-page';

          // Block right-click on each canvas
          canvas.addEventListener('contextmenu', (e) => e.preventDefault());

          const ctx = canvas.getContext('2d');
          await page.render({ canvasContext: ctx, viewport }).promise;

          if (!cancelled && containerRef.current) {
            containerRef.current.appendChild(canvas);
          }
        }
      } catch {
        // Silently ignore — session may have expired
      } finally {
        renderingRef.current = false;
      }
    })();

    return () => { cancelled = true; };
  }, [pdfBytes]);

  return <div ref={containerRef} className="reader-canvas-container" />;
}

export default function PdfReader() {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState('');
  const [sessionData, setSessionData] = useState(null);
  const [activeSection, setActiveSection] = useState(null);
  const [pdfBytes, setPdfBytes] = useState(null);
  const [hidden, setHidden] = useState(false);
  const sessionDataRef = useRef(null);
  sessionDataRef.current = sessionData;

  // ── Read PIN from URL query params ─────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlPin = params.get('pin');
    if (urlPin) setPin(urlPin);
  }, []);

  // ── Security protections ───────────────────────────────────────────
  useEffect(() => {
    const handleKeydown = (e) => {
      const ctrl = e.ctrlKey || e.metaKey;

      // PrintScreen — wipe clipboard immediately
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        navigator.clipboard?.writeText('').catch(() => {});
        return;
      }
      // Save / Print
      if (ctrl && (e.key === 's' || e.key === 'S' || e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        return;
      }
      // Ctrl+Shift+S (screenshot shortcut)
      if (ctrl && e.shiftKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        return;
      }
      // DevTools
      if (
        e.key === 'F12' ||
        (ctrl && e.shiftKey && (e.key === 'i' || e.key === 'I' || e.key === 'j' || e.key === 'J'))
      ) {
        e.preventDefault();
        return;
      }
      // View source
      if (ctrl && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault();
      }
    };

    const handleContextMenu = (e) => e.preventDefault();

    const handleVisibility = () => {
      setHidden(document.visibilityState === 'hidden');
    };

    const handleBlur = () => {
      if (sessionDataRef.current) setHidden(true);
    };
    const handleFocus = () => setHidden(false);

    document.addEventListener('keydown', handleKeydown);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('keydown', handleKeydown);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // ── Auto-expire after 24 hours ─────────────────────────────────────
  useEffect(() => {
    if (!sessionData?.used_at) return;
    const expiresAt = sessionData.used_at * 1000 + 86400 * 1000;
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) { setSessionData(null); setPdfBytes(null); return; }
    const timer = setTimeout(() => {
      setSessionData(null);
      setPdfBytes(null);
      setError('Your 24-hour reading session has expired.');
    }, remaining);
    return () => clearTimeout(timer);
  }, [sessionData]);

  const handleValidate = useCallback(async () => {
    const trimmed = pin.trim();
    if (!trimmed || trimmed.length !== 6) {
      setError('Enter a valid 6-digit PIN');
      return;
    }

    setLoading(true);
    setError('');
    setSessionData(null);
    setActiveSection(null);
    setPdfBytes(null);

    try {
      const resp = await fetch(`${API_URL}/pin/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: trimmed }),
      });

      if (resp.status === 403) {
        setError('This PIN is invalid or has already been used. Each PIN works only once.');
        return;
      }
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        setError(data.detail || 'Validation failed');
        return;
      }

      const data = await resp.json();
      setSessionData({ ...data, used_at: Math.floor(Date.now() / 1000) });

      if (data.sections?.length > 0) {
        fetchSection(data.sections[0].section, trimmed);
      }
    } catch {
      setError('Could not reach the server. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [pin]);

  /**
   * Fetch the PDF as raw bytes via our authenticated backend endpoint.
   * The browser never sees the URL as a "PDF link" — it's just an ArrayBuffer
   * inside our JS memory, rendered to canvas. No download button, no share sheet.
   */
  const fetchSection = useCallback(async (section, pinOverride) => {
    const p = pinOverride || pin.trim();
    setActiveSection(section);
    setPdfBytes(null);
    setPdfLoading(true);

    try {
      const resp = await fetch(`${API_URL}/pin/stream/${p}/${section}`, {
        headers: { 'Cache-Control': 'no-store' },
      });
      if (!resp.ok) {
        setError('Could not load section. Your session may have expired.');
        return;
      }
      const buffer = await resp.arrayBuffer();
      setPdfBytes(new Uint8Array(buffer));
    } catch {
      setError('Failed to load PDF. Please check your connection.');
    } finally {
      setPdfLoading(false);
    }
  }, [pin]);

  // ── PIN entry screen ───────────────────────────────────────────────
  if (!sessionData) {
    return (
      <div className="reader-root">
        <div className="reader-bg-orb reader-bg-orb--1" />
        <div className="reader-bg-orb reader-bg-orb--2" />
        <div className="reader-card">
          <div className="reader-logo">
            <Icon d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" size={32} />
          </div>
          <h1 className="reader-title">New Era ePaper</h1>
          <p className="reader-subtitle">Enter your one-time PIN to read today's edition</p>

          {error && (
            <div className="reader-error">
              <Icon d="M12 9v2m0 4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="reader-pin-group">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              className="reader-pin-input"
              placeholder="------"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && handleValidate()}
              autoFocus
              disabled={loading}
            />
            <button
              className="reader-submit"
              onClick={handleValidate}
              disabled={loading || pin.trim().length !== 6}
            >
              {loading ? <span className="reader-spinner" /> : (
                <>
                  <Icon d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" size={18} />
                  <span>Unlock</span>
                </>
              )}
            </button>
          </div>

          <div className="reader-security-note">
            <Icon d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" size={14} />
            <span>PIN valid for 24 hours after first use. Cannot be reused or shared.</span>
          </div>
        </div>
      </div>
    );
  }

  // ── PDF viewer screen ──────────────────────────────────────────────
  return (
    <div className="reader-viewer-root">
      {hidden && <SecurityOverlay />}

      <header className="reader-viewer-header">
        <div className="reader-viewer-brand">
          <Icon d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" size={20} />
          <span>New Era ePaper</span>
        </div>
        <div className="reader-viewer-info">
          <span className="reader-edition-date">{sessionData.edition_date}</span>
          <span className="reader-session-badge">
            <Icon d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" size={14} />
            24h session active
          </span>
        </div>
      </header>

      {sessionData.sections?.length > 1 && (
        <div className="reader-section-tabs">
          {sessionData.sections.map(({ section }) => (
            <button
              key={section}
              className={`reader-tab ${activeSection === section ? 'reader-tab--active' : ''}`}
              onClick={() => fetchSection(section)}
            >
              {SECTION_LABELS[section] || section}
            </button>
          ))}
        </div>
      )}

      <div className="reader-pdf-frame">
        <Watermark phone={sessionData.phone || ''} pin={pin} />

        {pdfLoading ? (
          <div className="reader-pdf-loading">
            <span className="reader-pdf-spinner" />
            <span>Loading edition...</span>
          </div>
        ) : pdfBytes ? (
          <CanvasPdfViewer pdfBytes={pdfBytes} key={activeSection} />
        ) : (
          <div className="reader-pdf-placeholder">
            <Icon d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" size={40} />
            <p>Select a section to view</p>
          </div>
        )}
      </div>

      <footer className="reader-viewer-footer">
        <span>Secure one-time session — downloading, printing, screenshotting and sharing are disabled. Content is watermarked.</span>
      </footer>
    </div>
  );
}
