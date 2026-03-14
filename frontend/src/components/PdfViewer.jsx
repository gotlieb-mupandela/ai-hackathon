/**
 * PdfViewer
 * Renders every page of a PDF URL as a scrollable stack of canvases.
 * Used inside the ePaper modal to show the full newspaper.
 */
import React, { useEffect, useRef, useState } from 'react';

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

      await page.render({
        canvasContext: canvas.getContext('2d'),
        viewport,
      }).promise;
    };

    render();
    return () => { cancelled = true; };
  }, [pdf, pageNumber, scale]);

  return (
    <div style={{
      marginBottom: 12,
      borderRadius: 4,
      overflow: 'hidden',
      boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
      background: '#fff',
    }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

export default function PdfViewer({ url }) {
  const [pdf, setPdf] = useState(null);
  const [totalPages, setTotalPages] = useState(0);
  const [status, setStatus] = useState('loading'); // loading | done | error
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!url) { setStatus('error'); setErrorMsg('No PDF URL provided.'); return; }

    let cancelled = false;

    const load = async () => {
      try {
        setStatus('loading');
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.min.mjs`;

        const loadingTask = pdfjsLib.getDocument({ url, withCredentials: false });
        const doc = await loadingTask.promise;
        if (cancelled) return;

        setPdf(doc);
        setTotalPages(doc.numPages);
        setStatus('done');
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setErrorMsg(err?.message || 'Could not load PDF.');
        }
      }
    };

    load();
    return () => { cancelled = true; };
  }, [url]);

  if (status === 'loading') {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', gap: 16, color: '#64748b',
      }}>
        <div style={{
          width: 40, height: 40, border: '3px solid #e2e8f0',
          borderTop: '3px solid #d32f2f', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <span style={{ fontSize: 14, fontWeight: 600 }}>Loading newspaper…</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100%', gap: 12, color: '#94a3b8',
        padding: 32,
      }}>
        <div style={{ fontSize: 40 }}>📄</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#475569' }}>Could not load PDF</div>
        <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', maxWidth: 300 }}>{errorMsg}</div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          style={{
            marginTop: 8, padding: '8px 20px', background: '#d32f2f', color: '#fff',
            borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none',
          }}
        >
          Open in New Tab
        </a>
      </div>
    );
  }

  return (
    <div style={{
      overflowY: 'auto', height: '100%', padding: '20px 24px',
      background: '#374151',
      boxSizing: 'border-box',
    }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {Array.from({ length: totalPages }, (_, i) => (
          <PdfPage key={i + 1} pdf={pdf} pageNumber={i + 1} scale={1.6} />
        ))}
        <div style={{ textAlign: 'center', padding: '16px 0', color: '#9ca3af', fontSize: 13 }}>
          End of edition · {totalPages} {totalPages === 1 ? 'page' : 'pages'}
        </div>
      </div>
    </div>
  );
}
