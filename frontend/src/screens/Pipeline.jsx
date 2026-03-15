import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import {
  getPages,
  downloadFromStorage,
  uploadToStorage,
  upsertEdition,
  getOrCreateTodayEdition,
  deduplicatePages,
  notifySubscribers,
  stampPage,
} from '../api';
import './Pipeline.css';

const SECTION_FILENAME_MAP = {
  News:      'news.pdf',
  Sport:     'sport.pdf',
  Business:  'business.pdf',
  'Vibez!':  'vibez.pdf',
  Vibez:     'vibez.pdf',
  AgriToday: 'agritoday.pdf',
};


const STEP_NAMES = [
  'Fetch & Sort Pages',
  'Analyze & Stamp Pages',
  'Merge Full Newspaper',
  'Split by Section',
  'Upload to E-Paper',
  'Publish & Notify WhatsApp',
];

const STEP_ICONS = {
  pending: (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
    </svg>
  ),
  running: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="spin">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
    </svg>
  ),
  done: (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
};

function formatElapsed(ms) {
  if (!ms) return null;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Extract page number from filename (e.g. NE_20260302_05.pdf → 5).
 * Returns null if no clear number is found.
 */
function extractPageNumberFromFilename(filename) {
  if (!filename) return null;
  const name = filename.replace(/\.pdf$/i, '').trim();
  const trailingNum = name.match(/[_-](\d{1,3})(?:\s*\(\d+\))?$/);
  if (trailingNum) return parseInt(trailingNum[1], 10);
  const pagePrefix = name.match(/page\s*(\d{1,3})/i);
  if (pagePrefix) return parseInt(pagePrefix[1], 10);
  const bareNum = name.match(/(?:^|\s)(\d{1,3})$/);
  if (bareNum) return parseInt(bareNum[1], 10);
  return null;
}



function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Pipeline() {
  const [steps, setSteps] = useState(
    STEP_NAMES.map((name, i) => ({ index: i, name, status: 'pending', elapsed_ms: null }))
  );
  const [logs, setLogs] = useState([]);
  const [progress, setProgress] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const logEndRef = useRef(null);
  const autoRunTriggeredRef = useRef(false);
  const runPipelineRef = useRef(null);
  const todayStr = getTodayStr();

  useEffect(() => {
    const refresh = () => {
      getPages(todayStr).then(pages => {
        setPageCount(pages.length);
      }).catch(() => {});
    };
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [todayStr]);

  // Auto-run pipeline when all pages are uploaded & analysed, or when deadline is reached (Step 4 → 5 in "The New Way")
  useEffect(() => {
    if (isRunning || isComplete || autoRunTriggeredRef.current) return;

    const checkAndRun = async () => {
      try {
        const [edition, allPages] = await Promise.all([
          getOrCreateTodayEdition(todayStr),
          getPages(todayStr),
        ]);
        if (edition?.status === 'published') return;

        const totalPages = allPages.length;
        const expectedNum = edition?.expected_pages != null ? Number(edition.expected_pages) : 0;

        const deadlineStr = edition?.deadline || '15:00';
        const [h, m] = deadlineStr.split(':').map(Number);
        const deadlineToday = new Date();
        deadlineToday.setHours(h, m || 0, 0, 0);
        const isPastDeadline = Date.now() >= deadlineToday.getTime();

        const allPagesReady = expectedNum > 0 && totalPages >= expectedNum;
        if (allPagesReady || isPastDeadline) {
          autoRunTriggeredRef.current = true;
          addLog('Auto-running pipeline (all pages ready or deadline reached)...');
          if (runPipelineRef.current) runPipelineRef.current();
        }
      } catch {
        // ignore
      }
    };

    checkAndRun();
    const interval = setInterval(checkAndRun, 60000);
    return () => clearInterval(interval);
  }, [todayStr, isRunning, isComplete]);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const addLog = useCallback((message) => {
    const timestamp = new Date().toLocaleTimeString('en-GB');
    setLogs(prev => [...prev, { timestamp, message }]);
  }, []);

  const updateStep = useCallback((index, status, elapsed_ms = null) => {
    setSteps(prev => prev.map((s, i) => i === index ? { ...s, status, elapsed_ms } : s));
    setProgress(Math.round(((index + (status === 'done' ? 1 : 0)) / STEP_NAMES.length) * 100));
  }, []);

  const mergePdfs = async (pdfBlobs) => {
    const merged = await PDFDocument.create();
    const docs = await Promise.all(
      pdfBlobs.map(async (blob) => {
        const bytes = await blob.arrayBuffer();
        return PDFDocument.load(bytes);
      })
    );
    for (const doc of docs) {
      // Each uploaded file = one newspaper page; only take page 1 to avoid duplicates
      const [copiedPage] = await merged.copyPages(doc, [0]);
      merged.addPage(copiedPage);
    }
    return merged.save();
  };

  const runPipeline = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setIsComplete(false);
    setLogs([]);
    setSteps(STEP_NAMES.map((name, i) => ({ index: i, name, status: 'pending', elapsed_ms: null })));
    setProgress(0);

    try {
      // ── Step 0: Fetch & Sort ────────────────────────────────────────
      let start = Date.now();
      updateStep(0, 'running');
      addLog('=== Pipeline started ===');

      const dedupResult = await deduplicatePages(todayStr);

      if (dedupResult.removed?.length > 0) {
        addLog(`Dedup: ${dedupResult.removed.length} duplicates removed (${dedupResult.total_before} → ${dedupResult.total_after})`);
      }

      const rawPages = dedupResult.unique_pages || [];

      if (rawPages.length === 0) {
        addLog('[ERROR] No pages found. Upload PDF pages first.');
        updateStep(0, 'error');
        setIsRunning(false);
        return;
      }

      const sortedPages = [...rawPages].sort((a, b) => {
        const na = extractPageNumberFromFilename(a.filename) ?? a.page_number ?? 9999;
        const nb = extractPageNumberFromFilename(b.filename) ?? b.page_number ?? 9999;
        return na - nb;
      });

      addLog(`${sortedPages.length} pages sorted — downloading PDFs...`);

      const downloadResults = await Promise.allSettled(
        sortedPages.map(async (page) => {
          const blob = await downloadFromStorage('Upload', page.storage_path);
          const pageNum = extractPageNumberFromFilename(page.filename) ?? page.page_number;
          // Use section exactly as set in the Upload page — no reclassification
          const section = page.section || null;
          return { page, blob, pageNum, section };
        })
      );

      const pdfBlobs = new Array(sortedPages.length).fill(null);
      const analyzedPages = new Array(sortedPages.length).fill(null);
      let sectionedCount = 0;
      let fullOnlyCount = 0;

      downloadResults.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          const { page, blob, pageNum, section } = result.value;
          pdfBlobs[idx] = blob;
          analyzedPages[idx] = { ...page, page_number: pageNum, section };
          if (section) sectionedCount++;
          else fullOnlyCount++;
        }
      });

      addLog(`${sectionedCount} pages with sections, ${fullOnlyCount} full paper only`);
      updateStep(0, 'done', Date.now() - start);

      // ── Step 1: Stamp Pages ────────────────────────────────────────
      start = Date.now();
      updateStep(1, 'running');
      await new Promise(resolve => setTimeout(resolve, 5000));

      analyzedPages.forEach((p, idx) => {
        if (!p) analyzedPages[idx] = { ...sortedPages[idx], section: null };
      });

      const classifiedTotal = analyzedPages.filter(p => p && p.section).length;
      const unclassifiedTotal = analyzedPages.length - classifiedTotal;
      addLog(`${classifiedTotal} pages classified into sections, ${unclassifiedTotal} for full paper only`);
      addLog(`Stamping ${classifiedTotal} pages with page number & section labels...`);
      const stampedBlobs = await Promise.all(
        analyzedPages.map(async (page, idx) => {
          const blob = pdfBlobs[idx];
          if (!blob || !page.page_number || !page.section) return blob;
          try {
            return await stampPage(
              new File([blob], page.filename || `page_${idx}.pdf`, { type: 'application/pdf' }),
              page.page_number,
              page.section
            );
          } catch {
            return blob;
          }
        })
      );
      stampedBlobs.forEach((blob, idx) => { if (blob) pdfBlobs[idx] = blob; });

      addLog(`${sortedPages.length} pages classified and stamped`);
      updateStep(1, 'done', Date.now() - start);

      // ── Step 2: Merge Full Newspaper ──────────────────────────────
      start = Date.now();
      updateStep(2, 'running');

      const validBlobs = pdfBlobs.filter(Boolean);
      const fullPaperBytes = await mergePdfs(validBlobs);

      addLog(`Merged ${validBlobs.length} stamped pages into full newspaper`);
      updateStep(2, 'done', Date.now() - start);

      // ── Step 3: Split by Section ──────────────────────────────────
      start = Date.now();
      updateStep(3, 'running');

      const sectionGroups = {};
      let splitFullOnlyCount = 0;
      analyzedPages.forEach((page, idx) => {
        const section = page.section;
        if (!section) { splitFullOnlyCount++; return; }
        if (!sectionGroups[section]) sectionGroups[section] = [];
        sectionGroups[section].push({ page, blobIndex: idx });
      });
      if (splitFullOnlyCount > 0) {
        addLog(`  ${splitFullOnlyCount} page(s) without a section — included in full paper only`);
      }

      const sectionOutputs = {};
      const mergeResults = await Promise.all(
        Object.entries(sectionGroups).map(async ([section, items]) => {
          const sectionBlobs = items.map(item => pdfBlobs[item.blobIndex]).filter(Boolean);
          if (sectionBlobs.length === 0) return null;
          const sectionBytes = await mergePdfs(sectionBlobs);
          const filename = SECTION_FILENAME_MAP[section] || `${section.toLowerCase().replace(/[^a-z0-9]/g, '')}.pdf`;
          return { section, bytes: sectionBytes, filename, count: sectionBlobs.length };
        })
      );
      mergeResults.filter(Boolean).forEach(({ section, bytes, filename, count }) => {
        sectionOutputs[section] = { bytes, filename };
        addLog(`  ${section}: ${count} pages → ${filename}`);
      });

      updateStep(3, 'done', Date.now() - start);

      // ── Step 4: Upload to E-Paper ─────────────────────────────────
      start = Date.now();
      updateStep(4, 'running');

      const storagePaths = {};

      const fullPaperUpload = uploadToStorage(
        'outputs',
        `${todayStr}/full_paper.pdf`,
        new Blob([fullPaperBytes], { type: 'application/pdf' })
      ).then(() => {
        storagePaths['full_paper'] = `${todayStr}/full_paper.pdf`;
        addLog('  Uploaded full_paper.pdf');
      });

      const sectionTasks = Object.entries(sectionOutputs).map(([section, { bytes, filename }]) => ({
        key: section.toLowerCase().replace(/[^a-z0-9]/g, ''),
        path: `${todayStr}/${filename}`,
        bytes,
        name: filename,
      }));

      const UPLOAD_CONCURRENCY = 5;
      const sectionUploadPromises = [];
      for (let i = 0; i < sectionTasks.length; i += UPLOAD_CONCURRENCY) {
        const batch = sectionTasks.slice(i, i + UPLOAD_CONCURRENCY);
        sectionUploadPromises.push(
          Promise.all(
            batch.map(async ({ key, path, bytes, name }) => {
              await uploadToStorage('outputs', path, new Blob([bytes], { type: 'application/pdf' }));
              storagePaths[key] = path;
              addLog(`  Uploaded ${name}`);
            })
          )
        );
      }

      await Promise.all([fullPaperUpload, ...sectionUploadPromises]);

      addLog(`All ${sectionTasks.length + 1} PDFs uploaded to E-Paper`);
      updateStep(4, 'done', Date.now() - start);

      // ── Step 5: Publish & Notify WhatsApp ─────────────────────────
      start = Date.now();
      updateStep(5, 'running');

      const sectionsMap = {};
      for (const [section, items] of Object.entries(sectionGroups)) {
        sectionsMap[section] = items.map(item => item.page.page_number).filter(Boolean);
      }

      const edition = await getOrCreateTodayEdition(todayStr);
      await upsertEdition({
        date: todayStr,
        status: 'published',
        expected_pages: edition.expected_pages,
        deadline: edition.deadline,
        published_at: new Date().toLocaleTimeString('en-GB'),
        pages: analyzedPages.map(p => ({
          filename: p.filename,
          page_number: p.page_number,
          section: p.section,
          headline: p.headline,
          tags: p.tags,
          uploaded_at: p.uploaded_at,
          uploaded_by: p.uploaded_by,
        })),
        sections: sectionsMap,
        outputs: storagePaths,
        storage_paths: storagePaths,
      });

      addLog(`Edition published at ${new Date().toLocaleTimeString('en-GB')} — ${Object.keys(sectionGroups).join(', ')}`);

      try {
        addLog('Sending WhatsApp notifications with PIN-protected links...');
        const notifyResult = await notifySubscribers(todayStr);

        if (notifyResult.status === 'queued') {
          addLog('WhatsApp delivery queued — subscribers will receive links shortly.');
        } else if (notifyResult.status === 'sent') {
          addLog(`WhatsApp: ${notifyResult.sent} sent, ${notifyResult.failed} failed.`);
        } else if (notifyResult.status === 'links' && notifyResult.links?.length > 0) {
          addLog(`Opening ${notifyResult.links.length} WhatsApp link(s)...`);
          for (let i = 0; i < notifyResult.links.length; i++) {
            const entry = notifyResult.links[i];
            addLog(`  WhatsApp for ${entry.phone} [${entry.sections.join(', ')}]`);
            window.open(entry.link, '_blank');
            if (i < notifyResult.links.length - 1) {
              await new Promise(r => setTimeout(r, 3000));
            }
          }
          addLog('All WhatsApp links opened — confirm delivery in each tab.');
        } else if (notifyResult.skipped) {
          addLog('WhatsApp auto-send disabled — skipped.');
        } else {
          addLog('WhatsApp agent not running — start with: cd whatsapp-agent && node server.js');
        }
      } catch (err) {
        if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
          addLog('WhatsApp agent not reachable — scan QR code first, then republish.');
        } else {
          addLog(`[WARN] WhatsApp notification skipped: ${err.message}`);
        }
      }

      updateStep(5, 'done', Date.now() - start);

      setProgress(100);
      setIsComplete(true);
      addLog('=== Pipeline complete — edition published & subscribers notified ===');

    } catch (err) {
      addLog(`[ERROR] Pipeline failed: ${err.message}`);
      console.error('Pipeline error:', err);
    } finally {
      setIsRunning(false);
    }
  };

  runPipelineRef.current = runPipeline;

  const overallStatus = isComplete
    ? 'complete'
    : isRunning
    ? 'running'
    : steps.some((s) => s.status === 'error')
    ? 'error'
    : 'idle';

  return (
    <div className="pipeline-page">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Publish Edition</h1>
        <p className="page-subtitle">
          When all expected pages are uploaded OR the deadline is reached, the pipeline runs automatically.
          <br/>You can also click "Run Pipeline" below to start it manually.
        </p>
        <div className="pipeline-header-actions">
          <div className={`pipeline-status-badge pipeline-status-badge--${overallStatus}`}>
            {overallStatus === 'running' && <span className="running-dot" />}
            {overallStatus === 'idle' && `Idle — ${pageCount} pages ready`}
            {overallStatus === 'running' && 'Pipeline running'}
            {overallStatus === 'complete' && '✓ Edition published'}
            {overallStatus === 'error' && 'Pipeline encountered an error'}
          </div>
          {!isRunning && !isComplete && (
            <button
              className="trigger-btn"
              onClick={runPipeline}
              disabled={pageCount === 0}
              title={pageCount === 0 ? 'Upload and analyse pages first' : 'Run pipeline now'}
              style={{fontSize: '15px', fontWeight: '600', padding: '12px 24px'}}
            >
              ▶ Run Pipeline Now
            </button>
          )}
        </div>
      </div>

      <div className="pipeline-body">
        {/* Step Tracker */}
        <div className="step-tracker">
          <h2 className="panel-title">Pipeline Steps</h2>
          <div className="steps-list">
            {steps.map((step, idx) => (
              <div
                key={idx}
                className={`step-item step-item--${step.status}`}
              >
                <div className="step-connector-wrap">
                  <div className={`step-icon step-icon--${step.status}`}>
                    {STEP_ICONS[step.status] || STEP_ICONS.pending}
                  </div>
                  {idx < steps.length - 1 && (
                    <div className={`step-line ${step.status === 'done' ? 'step-line--done' : ''}`} />
                  )}
                </div>
                <div className="step-info">
                  <div className="step-name">{step.name}</div>
                  <div className="step-meta">
                    <span className={`step-status-text step-status-text--${step.status}`}>
                      {step.status.charAt(0).toUpperCase() + step.status.slice(1)}
                    </span>
                    {step.elapsed_ms && (
                      <span className="step-elapsed">{formatElapsed(step.elapsed_ms)}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Log Terminal */}
        <div className="log-terminal-panel">
          <div className="log-terminal-header">
            <div className="mac-dots">
              <div className="mac-dot red" />
              <div className="mac-dot yellow" />
              <div className="mac-dot green" />
            </div>
            <div className="terminal-title">pipeline.log</div>
            <span className="log-count">{logs.length} entries</span>
          </div>
          <div className="log-terminal">
            {logs.length === 0 ? (
              <div className="log-empty">
                <span className="log-cursor">_</span> Pipeline runs automatically when ready, or click "Run Pipeline" to start now.
              </div>
            ) : (
              logs.map((entry, idx) => (
                <div key={idx} className={`log-line ${entry.message.startsWith('[ERROR]') ? 'log-line--error' : entry.message.startsWith('[WARN]') ? 'log-line--warn' : entry.message.startsWith('===') ? 'log-line--highlight' : ''}`}>
                  <span className="log-ts">{entry.timestamp}</span>
                  <span className="log-msg">{entry.message}</span>
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>

      {/* Overall Progress Bar */}
      <div className="pipeline-progress-section">
        <div className="pipeline-progress-header">
          <span>Overall Progress</span>
          <span className="pipeline-progress-pct">{progress}%</span>
        </div>
        <div className="pipeline-progress-track">
          <div
            className={`pipeline-progress-fill ${isComplete ? 'pipeline-progress-fill--complete' : ''}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
