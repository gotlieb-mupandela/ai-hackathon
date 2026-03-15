/**
 * PdfViewer
 * Full newspaper reader with page-by-page navigation, zoom, and progress bar.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';

function PdfPage({ pdf, pageNumber, scale }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;

    const render = async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;

      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = '100%';
      canvas.style.height = 'auto';

      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    };

    render();
    return () => { cancelled = true; };
  }, [pdf, pageNumber, scale]);

  return <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: 'auto' }} />;
}

export default function PdfViewer({ url }) {
  const [pdf, setPdf] = useState(null);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1.0);
  const [status, setStatus] = useState('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [jumpValue, setJumpValue] = useState('');

  useEffect(() => {
    if (!url) { setStatus('error'); setErrorMsg('No PDF URL provided.'); return; }
    let cancelled = false;

    const load = async () => {
      try {
        setStatus('loading');
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.min.mjs`;
        const doc = await pdfjsLib.getDocument({ url, withCredentials: false }).promise;
        if (cancelled) return;
        setPdf(doc);
        setTotalPages(doc.numPages);
        setCurrentPage(1);
        setStatus('done');
      } catch (err) {
        if (!cancelled) { setStatus('error'); setErrorMsg(err?.message || 'Could not load PDF.'); }
      }
    };

    load();
    return () => { cancelled = true; };
  }, [url]);

  const goTo = useCallback((n) => {
    setCurrentPage(Math.max(1, Math.min(n, totalPages)));
  }, [totalPages]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goTo(currentPage + 1);
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   goTo(currentPage - 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentPage, goTo]);

  if (status === 'loading') return (
    <div style={centeredStyle}>
      <div style={spinnerStyle} />
      <span style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8', marginTop: 12 }}>Loading newspaper…</span>
    </div>
  );

  if (status === 'error') return (
    <div style={centeredStyle}>
      <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="#475569" strokeWidth="1">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#475569', marginTop: 12 }}>Could not load PDF</div>
      <div style={{ fontSize: 13, color: '#64748b', textAlign: 'center', maxWidth: 300, marginTop: 4 }}>{errorMsg}</div>
      <a href={url} target="_blank" rel="noreferrer" style={openBtnStyle}>Open in New Tab</a>
    </div>
  );

  const progress = totalPages > 0 ? (currentPage / totalPages) * 100 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#1a2035' }}>

      {/* Progress bar */}
      <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <div style={{ height: '100%', width: `${progress}%`, background: '#d32f2f', transition: 'width 0.3s ease', borderRadius: '0 2px 2px 0' }} />
      </div>

      {/* Page area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px', boxSizing: 'border-box' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', background: '#fff', borderRadius: 4, overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}>
          <PdfPage pdf={pdf} pageNumber={currentPage} scale={zoom * 1.8} />
        </div>
      </div>

      {/* Bottom toolbar */}
      <div style={toolbarStyle}>

        {/* Prev */}
        <button onClick={() => goTo(currentPage - 1)} disabled={currentPage <= 1} style={navBtnStyle(currentPage <= 1)}>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Prev
        </button>

        {/* Page jump */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <form onSubmit={(e) => { e.preventDefault(); const n = parseInt(jumpValue, 10); if (!isNaN(n)) { goTo(n); setJumpValue(''); } }}>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={jumpValue}
              onChange={(e) => setJumpValue(e.target.value)}
              placeholder={String(currentPage)}
              style={pageInputStyle}
            />
          </form>
          <span style={{ color: '#64748b', fontSize: 13 }}>/ {totalPages}</span>
        </div>

        {/* Zoom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))} style={zoomBtnStyle} title="Zoom out">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
            </svg>
          </button>
          <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, minWidth: 44, textAlign: 'center' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={() => setZoom(z => Math.min(2.0, +(z + 0.25).toFixed(2)))} style={zoomBtnStyle} title="Zoom in">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16M4 12h16" />
            </svg>
          </button>
        </div>

        {/* Next */}
        <button onClick={() => goTo(currentPage + 1)} disabled={currentPage >= totalPages} style={navBtnStyle(currentPage >= totalPages)}>
          Next
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

      </div>
    </div>
  );
}

/* ── Inline styles ────────────────────────────────────────────── */
const centeredStyle = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', height: '100%', gap: 8,
};

const spinnerStyle = {
  width: 40, height: 40,
  border: '3px solid rgba(255,255,255,0.08)',
  borderTop: '3px solid #d32f2f',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
};

const openBtnStyle = {
  marginTop: 12, padding: '9px 22px',
  background: '#d32f2f', color: '#fff',
  borderRadius: 8, fontSize: 13, fontWeight: 600,
  textDecoration: 'none',
};

const toolbarStyle = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 20,
  padding: '14px 24px',
  background: 'rgba(0,0,0,0.4)',
  borderTop: '1px solid rgba(255,255,255,0.07)',
  backdropFilter: 'blur(8px)',
};

const navBtnStyle = (disabled) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 18px',
  background: disabled ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8, color: disabled ? '#334155' : '#cbd5e1',
  fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
  transition: 'all 0.15s',
});

const pageInputStyle = {
  width: 52, padding: '6px 8px',
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6, color: '#f1f5f9',
  fontSize: 13, fontWeight: 600, textAlign: 'center',
  outline: 'none',
};

const zoomBtnStyle = {
  width: 30, height: 30,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 6, color: '#94a3b8', cursor: 'pointer',
  transition: 'all 0.15s',
};
