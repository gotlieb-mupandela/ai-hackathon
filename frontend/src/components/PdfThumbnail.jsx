/**
 * PdfThumbnail
 * Renders the first page of a PDF URL onto a <canvas> element.
 * Falls back to a styled placeholder if the PDF cannot be loaded.
 */
import React, { useEffect, useRef, useState } from 'react';

export default function PdfThumbnail({ url, width = 220 }) {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | done | error

  useEffect(() => {
    if (!url) { setStatus('error'); return; }

    let cancelled = false;

    const render = async () => {
      try {
        // Lazy-load pdfjs-dist so it doesn't bloat the initial bundle
        const pdfjsLib = await import('pdfjs-dist');

        // Point the worker to the bundled worker file
        pdfjsLib.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.min.mjs`;

        const loadingTask = pdfjsLib.getDocument({ url, withCredentials: false });
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        const page = await pdf.getPage(1);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        // Scale to fit the desired width while keeping aspect ratio
        const viewport = page.getViewport({ scale: 1 });
        const scale = width / viewport.width;
        const scaled = page.getViewport({ scale });

        canvas.width = scaled.width;
        canvas.height = scaled.height;

        await page.render({
          canvasContext: canvas.getContext('2d'),
          viewport: scaled,
        }).promise;

        if (!cancelled) setStatus('done');
      } catch {
        if (!cancelled) setStatus('error');
      }
    };

    render();
    return () => { cancelled = true; };
  }, [url, width]);

  return (
    <div style={{ width, position: 'relative', background: '#f3f4f6', borderRadius: 6, overflow: 'hidden' }}>
      {/* Actual PDF canvas */}
      <canvas
        ref={canvasRef}
        style={{
          display: status === 'done' ? 'block' : 'none',
          width: '100%',
          height: 'auto',
        }}
      />

      {/* Loading skeleton */}
      {status === 'loading' && (
        <div style={{
          width: '100%',
          aspectRatio: '3/4',
          background: 'linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.4s infinite',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9ca3af',
          fontSize: 13,
        }}>
          Loading…
        </div>
      )}

      {/* Error fallback — styled mock cover */}
      {status === 'error' && (
        <div style={{
          width: '100%',
          aspectRatio: '3/4',
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: 16,
          boxSizing: 'border-box',
        }}>
          <div style={{ color: '#b91c1c', fontWeight: 800, fontSize: 20, fontFamily: 'serif', letterSpacing: 1 }}>
            New Era
          </div>
          <div style={{ color: '#92400e', fontSize: 10, letterSpacing: 2, textTransform: 'uppercase' }}>
            Truth for its own sake
          </div>
          <div style={{ width: '80%', height: 2, background: '#b91c1c', margin: '6px 0' }} />
          <div style={{ width: '70%', height: 10, background: '#e5e7eb', borderRadius: 3 }} />
          <div style={{ width: '85%', height: 60, background: '#f3f4f6', borderRadius: 4, marginTop: 4 }} />
        </div>
      )}
    </div>
  );
}
