import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import {
  getPages,
  downloadFromStorage,
  uploadToStorage,
  upsertEdition,
  getOrCreateTodayEdition,
  analyzePage,
  updatePage,
  notifySubscribers,
} from '../api';
import './Pipeline.css';

const SECTION_FILENAME_MAP = {
  News: 'news.pdf',
  Sport: 'sport.pdf',
  Business: 'business.pdf',
  Vibez: 'vibez.pdf',
  AgriToday: 'agritoday.pdf',
};

const STEP_NAMES = [
  'Analyze Pages',
  'Fetch Pages',
  'Sort by Page Number',
  'Merge Full Newspaper',
  'Category Segmentation',
  'Upload Outputs',
  'Publish Edition',
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
    // Load page count on mount
    getPages(todayStr).then(pages => {
      const analysed = pages.filter(p => p.status === 'analysed');
      setPageCount(analysed.length);
    }).catch(() => {});
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

        const analysedCount = allPages.filter(p => p.status === 'analysed').length;
        const expectedNum = edition?.expected_pages != null ? Number(edition.expected_pages) : 0;

        const deadlineStr = edition?.deadline || '15:00';
        const [h, m] = deadlineStr.split(':').map(Number);
        const deadlineToday = new Date();
        deadlineToday.setHours(h, m || 0, 0, 0);
        const isPastDeadline = Date.now() >= deadlineToday.getTime();

        const allPagesReady = expectedNum > 0 && analysedCount >= expectedNum;
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
    for (const blob of pdfBlobs) {
      const bytes = await blob.arrayBuffer();
      const doc = await PDFDocument.load(bytes);
      const copiedPages = await merged.copyPages(doc, doc.getPageIndices());
      copiedPages.forEach(page => merged.addPage(page));
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
      // Step 0: Analyze ALL pages with Gemini (always runs — never skipped)
      let start = Date.now();
      updateStep(0, 'running');
      addLog('=== Pipeline started ===');
      addLog('Sending all pages to Gemini for analysis...');

      const allPagesToday = await getPages(todayStr);

      if (allPagesToday.length === 0) {
        addLog('[ERROR] No pages found. Upload PDF pages first.');
        updateStep(0, 'error');
        setIsRunning(false);
        return;
      }

      addLog(`Found ${allPagesToday.length} pages — analyzing every page with Gemini...`);
      let analysisSuccess = 0;
      let analysisFailed = 0;

      for (const page of allPagesToday) {
        try {
          addLog(`  Analyzing ${page.filename}...`);

          // Download the PDF from Storage
          const blob = await downloadFromStorage('Upload', page.storage_path);

          // Create a File object for the analyzer
          const file = new File([blob], page.filename, { type: 'application/pdf' });

          // Always call Gemini — never skip based on old status
          const analysis = await analyzePage(file);

          // Update the page with fresh analysis results
          await updatePage(page.id, {
            page_number: analysis.page_number,
            section: analysis.section,
            headline: analysis.headline,
            tags: analysis.tags,
            status: 'analysed',
          });

          addLog(`  ✓ ${page.filename} → p${analysis.page_number} [${analysis.section}] "${(analysis.headline || '').substring(0, 40)}"`);
          analysisSuccess++;
        } catch (err) {
          addLog(`  [ERROR] Failed to analyze ${page.filename}: ${err.message}`);
          analysisFailed++;
        }
      }

      addLog(`Gemini analysis complete: ${analysisSuccess} succeeded, ${analysisFailed} failed`);
      if (analysisFailed > 0) {
        addLog(`[WARN] ${analysisFailed} pages failed analysis — check backend is running at http://localhost:8000`);
      }

      updateStep(0, 'done', Date.now() - start);

      // Step 1: Fetch pages
      start = Date.now();
      updateStep(1, 'running');
      addLog('Fetching analysed pages from Supabase...');

      const allPages = await getPages(todayStr);
      const pages = allPages.filter(p => p.status === 'analysed');

      if (pages.length === 0) {
        addLog('[ERROR] No analysed pages found. Upload and analyse pages first.');
        updateStep(1, 'error');
        setIsRunning(false);
        return;
      }

      addLog(`Found ${pages.length} analysed pages`);
      updateStep(1, 'done', Date.now() - start);

      // Step 2: Sort by page number (with secondary sort for stability)
      start = Date.now();
      updateStep(2, 'running');
      addLog('Sorting pages by page number...');
      
      const sortedPages = [...pages].sort((a, b) => {
        // Primary: page_number (null treated as 9999)
        const numA = a.page_number ?? 9999;
        const numB = b.page_number ?? 9999;
        if (numA !== numB) return numA - numB;
        
        // Secondary: uploaded_at
        const timeCompare = (a.uploaded_at || '').localeCompare(b.uploaded_at || '');
        if (timeCompare !== 0) return timeCompare;
        
        // Tertiary: filename
        return (a.filename || '').localeCompare(b.filename || '');
      });
      
      sortedPages.forEach(p => {
        const pageNum = p.page_number != null ? `p${p.page_number}` : 'p??';
        addLog(`  ${pageNum} → ${p.filename} [${p.section || 'Unknown'}]`);
        
        // Warn about missing page numbers
        if (p.page_number == null) {
          addLog(`  [WARN] ${p.filename} has no page_number (analysis may have failed)`);
        }
      });
      
      updateStep(2, 'done', Date.now() - start);

      // Step 3: Download and merge all pages into full_paper.pdf
      start = Date.now();
      updateStep(3, 'running');
      addLog(`Downloading and merging ${sortedPages.length} PDFs...`);

      const pdfBlobs = [];
      for (const page of sortedPages) {
        try {
          const blob = await downloadFromStorage('Upload', page.storage_path);
          pdfBlobs.push(blob);
          addLog(`  Downloaded: ${page.filename}`);
        } catch (err) {
          addLog(`  [WARN] Could not download ${page.filename}: ${err.message}`);
        }
      }

      const fullPaperBytes = await mergePdfs(pdfBlobs);
      addLog(`Full paper merged: ${pdfBlobs.length} pages`);
      updateStep(3, 'done', Date.now() - start);

      // Step 4: Segment by category
      start = Date.now();
      updateStep(4, 'running');
      addLog('Segmenting pages by section...');

      const sections = {};
      sortedPages.forEach((page, idx) => {
        const section = page.section || 'News';
        if (!sections[section]) sections[section] = [];
        sections[section].push({ page, blobIndex: idx });
      });

      const sectionOutputs = {};
      for (const [section, items] of Object.entries(sections)) {
        const sectionBlobs = items.map(item => pdfBlobs[item.blobIndex]).filter(Boolean);
        if (sectionBlobs.length > 0) {
          const sectionBytes = await mergePdfs(sectionBlobs);
          const filename = SECTION_FILENAME_MAP[section] || `${section.toLowerCase()}.pdf`;
          sectionOutputs[section] = { bytes: sectionBytes, filename };
          addLog(`  Created ${section}: ${filename} (${sectionBlobs.length} pages)`);
        }
      }
      updateStep(4, 'done', Date.now() - start);

      // Step 5: Upload outputs to Supabase Storage
      start = Date.now();
      updateStep(5, 'running');
      addLog('Uploading merged PDFs to Supabase Storage...');

      const storagePaths = {};

      // Upload full paper
      const fullPaperPath = `${todayStr}/full_paper.pdf`;
      const fullPaperBlob = new Blob([fullPaperBytes], { type: 'application/pdf' });
      await uploadToStorage('outputs', fullPaperPath, fullPaperBlob);
      storagePaths.full_paper = fullPaperPath;
      addLog(`  Uploaded full_paper.pdf`);

      // Upload section PDFs
      for (const [section, { bytes, filename }] of Object.entries(sectionOutputs)) {
        const path = `${todayStr}/${filename}`;
        const blob = new Blob([bytes], { type: 'application/pdf' });
        await uploadToStorage('outputs', path, blob);
        const key = section.toLowerCase().replace(/\s+/g, '_');
        storagePaths[key] = path;
        addLog(`  Uploaded ${filename}`);
      }
      updateStep(5, 'done', Date.now() - start);

      // Step 6: Publish edition
      start = Date.now();
      updateStep(6, 'running');
      addLog('Publishing edition record...');

      const sectionsMap = {};
      for (const [section, items] of Object.entries(sections)) {
        sectionsMap[section] = items.map(item => item.page.page_number).filter(Boolean);
      }

      const edition = await getOrCreateTodayEdition(todayStr);
      await upsertEdition({
        date: todayStr,
        status: 'published',
        expected_pages: edition.expected_pages,
        deadline: edition.deadline,
        published_at: new Date().toLocaleTimeString('en-GB'),
        pages: sortedPages.map(p => ({
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

      addLog(`Edition published at ${new Date().toLocaleTimeString('en-GB')}`);
      updateStep(6, 'done', Date.now() - start);

      setProgress(100);
      setIsComplete(true);
      addLog('=== Pipeline complete — edition published ===');

      // Trigger WhatsApp notifications to all subscribers (runs in background on backend)
      try {
        addLog('Sending WhatsApp notifications to subscribers...');
        const notifyResult = await notifySubscribers(todayStr);
        if (notifyResult.status === 'queued') {
          addLog('WhatsApp notifications queued — PDFs will be sent in the background.');
        }
      } catch (err) {
        addLog(`[WARN] WhatsApp notifications failed: ${err.message} (edition was still published successfully)`);
      }

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
        <h1 className="page-title">Live Pipeline</h1>
        <p className="page-subtitle">
          <strong>Step 4-9 Automation:</strong> When all expected pages are analyzed OR deadline is reached, the pipeline runs automatically.
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
