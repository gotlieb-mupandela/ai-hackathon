import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import {
  getPages,
  downloadFromStorage,
  uploadToStorage,
  upsertEdition,
  getOrCreateTodayEdition,
  analyzeAllPages,
  updatePage,
  deduplicatePages,
  notifySubscribers,
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
  'Merge Full Newspaper',
  'AI Analyze All Pages',
  'Split by Section',
  'Upload All PDFs',
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

/**
 * Extract section name from filename if it contains a known section keyword.
 * E.g. NE_20260302_Business.pdf → "Business", NE_20260302_Sport.pdf → "Sport"
 */
const KNOWN_SECTIONS_MAP = {
  sport:     'Sport',
  business:  'Business',
  news:      'News',
  vibez:     'Vibez!',
  agritoday: 'AgriToday',
};

function extractSectionFromFilename(filename) {
  if (!filename) return null;
  const name = filename.replace(/\.pdf$/i, '').toLowerCase().trim();
  for (const [keyword, section] of Object.entries(KNOWN_SECTIONS_MAP)) {
    if (name.includes(keyword)) return section;
  }
  return null;
}

/**
 * Ordered keyword → section mapping.
 * Most-specific terms come first to prevent false positives.
 * Mirrors the backend's _SECTION_TEXT_KEYWORDS list.
 */
const SECTION_TEXT_KEYWORDS = [
  // AgriToday
  ['agritoday',       'AgriToday'], ['agri today',      'AgriToday'],
  ['agriculture',     'AgriToday'], ['agricultural',    'AgriToday'],
  ['farming',         'AgriToday'], ['livestock',       'AgriToday'],
  ['crop',            'AgriToday'], ['harvest',         'AgriToday'],
  ['irrigation',      'AgriToday'], ['green scheme',    'AgriToday'],
  ['farmer',          'AgriToday'], ['cattle',          'AgriToday'],
  ['maize',           'AgriToday'], ['soil',            'AgriToday'],
  ['fertilizer',      'AgriToday'], ['planting season', 'AgriToday'],
  ['food security',   'AgriToday'], ['rural',           'AgriToday'],
  // Vibez!
  ['vibez',           'Vibez!'],   ['entertainment',   'Vibez!'],
  ['lifestyle',       'Vibez!'],   ['celebrity',       'Vibez!'],
  ['fashion',         'Vibez!'],   ['music',           'Vibez!'],
  ['concert',         'Vibez!'],   ['festival',        'Vibez!'],
  ['album',           'Vibez!'],   ['artist',          'Vibez!'],
  ['drama',           'Vibez!'],   ['comedy',          'Vibez!'],
  ['theatre',         'Vibez!'],   ['movie',           'Vibez!'],
  ['film',            'Vibez!'],   ['nightlife',       'Vibez!'],
  ['dance',           'Vibez!'],   ['culture',         'Vibez!'],
  // Business
  ['business',        'Business'], ['tenders',         'Business'],
  ['tender',          'Business'], ['accountant',      'Business'],
  ['accounting',      'Business'], ['audit',           'Business'],
  ['finance',         'Business'], ['financial',       'Business'],
  ['economy',         'Business'], ['economic',        'Business'],
  ['market',          'Business'], ['investment',      'Business'],
  ['commerce',        'Business'], ['corporate',       'Business'],
  ['stock exchange',  'Business'], ['nse',             'Business'],
  ['taxation',        'Business'], ['tax',             'Business'],
  ['revenue',         'Business'], ['budget',          'Business'],
  ['profit',          'Business'], ['banking',         'Business'],
  ['insurance',       'Business'], ['inflation',       'Business'],
  ['gdp',             'Business'], ['trade',           'Business'],
  ['procurement',     'Business'], ['quotation',       'Business'],
  ['annual report',   'Business'], ['tender notice',   'Business'],
  // Sport
  ['sport',           'Sport'],    ['football',        'Sport'],
  ['soccer',          'Sport'],    ['rugby',           'Sport'],
  ['cricket',         'Sport'],    ['athletics',       'Sport'],
  ['marathon',        'Sport'],    ['boxing',          'Sport'],
  ['swimming',        'Sport'],    ['tennis',          'Sport'],
  ['golf',            'Sport'],    ['basketball',      'Sport'],
  ['volleyball',      'Sport'],    ['cycling',         'Sport'],
  ['championship',    'Sport'],    ['league',          'Sport'],
  ['tournament',      'Sport'],    ['fixture',         'Sport'],
  ['stadium',         'Sport'],    ['coach',           'Sport'],
  ['goal',            'Sport'],    ['kick-off',        'Sport'],
  ['handball',        'Sport'],    ['netball',         'Sport'],
  // News (catch-all — must be last)
  ['news',            'News'],     ['namibia',         'News'],
  ['government',      'News'],     ['parliament',      'News'],
  ['minister',        'News'],     ['president',       'News'],
  ['police',          'News'],     ['court',           'News'],
  ['crime',           'News'],     ['election',        'News'],
  ['municipality',    'News'],     ['health',          'News'],
  ['education',       'News'],     ['school',          'News'],
  ['hospital',        'News'],     ['policy',          'News'],
  ['legislation',     'News'],     ['region',          'News'],
];

/**
 * Extract section from PDF embedded text using pdfjs-dist.
 * Digital PDFs have text layers — instant classification, zero API calls.
 * Returns null for image/scanned PDFs (fall back to backend AI vision).
 */
async function extractSectionFromPdfBlob(blob, pdfjsLib) {
  try {
    const bytes = await blob.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();
    const text = content.items.map(i => i.str).join(' ').toLowerCase();
    for (const [keyword, section] of SECTION_TEXT_KEYWORDS) {
      if (text.includes(keyword)) return section;
    }
  } catch {
    // Scanned/image PDF — falls back to backend AI vision
  }
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
    // Load all PDFs in parallel, then add pages in order
    const docs = await Promise.all(
      pdfBlobs.map(async (blob) => {
        const bytes = await blob.arrayBuffer();
        return PDFDocument.load(bytes);
      })
    );
    for (const doc of docs) {
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
      // ── Step 0: Fetch & Sort ────────────────────────────────────────
      let start = Date.now();
      updateStep(0, 'running');
      addLog('=== Pipeline started ===');
      addLog('Fetching uploaded pages...');

      // Server-side deduplication — uses service role key to bypass RLS
      addLog('Running server-side deduplication (bypasses RLS)...');
      const dedupResult = await deduplicatePages(todayStr);

      if (dedupResult.removed?.length > 0) {
        dedupResult.removed.forEach(r => addLog(`  [REMOVED] ${r.filename} (duplicate)`));
        addLog(`Duplicates deleted: ${dedupResult.removed.length} removed (${dedupResult.total_before} → ${dedupResult.total_after})`);
      }

      const rawPages = dedupResult.unique_pages || [];

      if (rawPages.length === 0) {
        addLog('[ERROR] No pages found. Upload PDF pages first.');
        updateStep(0, 'error');
        setIsRunning(false);
        return;
      }

      // Sort pages by page number — filename number first, then DB field, unknown go last
      const sortedPages = [...rawPages].sort((a, b) => {
        const na = extractPageNumberFromFilename(a.filename) ?? a.page_number ?? 9999;
        const nb = extractPageNumberFromFilename(b.filename) ?? b.page_number ?? 9999;
        return na - nb;
      });

      addLog(`${sortedPages.length} unique pages — sorted order:`);
      sortedPages.forEach(p => {
        const num = extractPageNumberFromFilename(p.filename) ?? p.page_number;
        const sec = p.section ? ` [${p.section}]` : '';
        addLog(`  p${num ?? '?'}${sec} → ${p.filename}`);
      });

      updateStep(0, 'done', Date.now() - start);

      // ── Steps 1+2: Download PDFs and extract sections simultaneously ────────
      // pdfjs-dist reads the text layer from digital PDFs in the browser — instant,
      // zero backend calls. Only truly image/scanned pages fall back to AI vision.
      start = Date.now();
      updateStep(1, 'running');
      addLog(`Downloading ${sortedPages.length} PDFs + extracting sections in parallel...`);

      // Load pdfjs-dist once (lazy import, already bundled via PdfThumbnail)
      let pdfjsLib = null;
      try {
        pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.min.mjs`;
      } catch {
        // pdfjs unavailable — all pages fall back to backend
      }

      // Download every page and immediately attempt text extraction in parallel.
      // This overlaps network I/O with CPU work — no sequential waiting.
      const downloadExtractResults = await Promise.allSettled(
        sortedPages.map(async (page, idx) => {
          const blob = await downloadFromStorage('Upload', page.storage_path);
          const filenameSection = extractSectionFromFilename(page.filename);
          const pageNum = extractPageNumberFromFilename(page.filename) ?? page.page_number;

          // Try frontend text extraction (instant — no HTTP call)
          let section = filenameSection;
          let method = filenameSection ? 'filename' : null;
          if (!section && pdfjsLib && blob) {
            section = await extractSectionFromPdfBlob(blob, pdfjsLib);
            if (section) method = 'text';
          }

          return { idx, page, blob, pageNum, section, method };
        })
      );

      // Build aligned arrays and collect pages that still need AI vision
      const pdfBlobs = new Array(sortedPages.length).fill(null);
      const analyzedPages = new Array(sortedPages.length).fill(null);
      const needsAI = [];

      downloadExtractResults.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          const { page, blob, pageNum, section, method } = result.value;
          pdfBlobs[idx] = blob;
          if (section) {
            addLog(`  p${pageNum ?? '?'} [${section}] — ${page.filename} (${method})`);
            analyzedPages[idx] = { ...page, page_number: pageNum, section, headline: '' };
            updatePage(page.id, { page_number: pageNum, section, status: 'analysed' }).catch(() => {});
          } else {
            needsAI.push(idx);
          }
        } else {
          addLog(`  [WARN] Could not download ${sortedPages[idx].filename}: ${result.reason?.message}`);
          needsAI.push(idx);
        }
      });

      // Merge full newspaper from downloaded blobs
      const validBlobs = pdfBlobs.filter(Boolean);
      addLog(`  Downloaded ${validBlobs.length}/${sortedPages.length} — merging into full_paper.pdf...`);
      const fullPaperBytes = await mergePdfs(validBlobs);
      addLog(`Full newspaper merged: ${validBlobs.length} pages in order`);
      updateStep(1, 'done', Date.now() - start);

      // ── Step 2: AI vision — only for pages text extraction couldn't classify ──
      start = Date.now();
      updateStep(2, 'running');

      const textCount = sortedPages.length - needsAI.length;
      if (textCount > 0) {
        addLog(`${textCount} page(s) classified instantly (filename/text extraction).`);
      }

      if (needsAI.length > 0) {
        addLog(`${needsAI.length} page(s) need AI vision — sending in one batch...`);

        const batchFiles = needsAI
          .map((idx) => {
            const blob = pdfBlobs[idx];
            const page = sortedPages[idx];
            return blob ? new File([blob], page.filename, { type: 'application/pdf' }) : null;
          })
          .filter(Boolean);

        // Single HTTP round trip — backend processes all in parallel
        const batchResults = await analyzeAllPages(batchFiles);

        let resultIdx = 0;
        for (const idx of needsAI) {
          const page = sortedPages[idx];
          const result = batchResults[resultIdx++];

          if (!result || result.method === 'error') {
            addLog(`  [WARN] ${page.filename}: AI failed — defaulting to News`);
            analyzedPages[idx] = { ...page, section: page.section || 'News', headline: '' };
          } else {
            const pageNum = extractPageNumberFromFilename(page.filename) ?? result.page_number;
            analyzedPages[idx] = {
              ...page,
              page_number: pageNum,
              section: result.section,
              headline: result.headline || '',
              tags: result.tags || [],
            };
            addLog(`  p${pageNum ?? '?'} [${result.section}] "${(result.headline || '').substring(0, 50)}" — ${page.filename} (AI)`);
            updatePage(page.id, {
              page_number: pageNum,
              section: result.section,
              headline: result.headline,
              tags: result.tags,
              status: 'analysed',
            }).catch(() => {});
          }
        }
      } else {
        addLog('All pages classified without AI — no API calls needed.');
      }

      // Safety net — fill any remaining nulls
      analyzedPages.forEach((p, idx) => {
        if (!p) analyzedPages[idx] = { ...sortedPages[idx], section: 'News' };
      });

      addLog(`Analysis complete: ${sortedPages.length} pages classified`);
      updateStep(2, 'done', Date.now() - start);

      // ── Step 3: Split by Section ────────────────────────────────────
      start = Date.now();
      updateStep(3, 'running');
      addLog('Splitting pages by identified section...');

      const sectionGroups = {};
      analyzedPages.forEach((page, idx) => {
        const section = page.section || 'News';
        if (!sectionGroups[section]) sectionGroups[section] = [];
        sectionGroups[section].push({ page, blobIndex: idx });
      });

      // Merge all sections in parallel — each section is independent
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

      // ── Step 4: Upload Full Paper + All Section PDFs (sequential + retry) ────
      start = Date.now();
      updateStep(4, 'running');
      addLog(`Uploading full paper + ${Object.keys(sectionOutputs).length} section PDFs to storage...`);

      const storagePaths = {};

      // Build upload task list: full paper first, then all sections
      const uploadTasks = [
        {
          key: 'full_paper',
          path: `${todayStr}/full_paper.pdf`,
          bytes: fullPaperBytes,
          name: 'full_paper.pdf',
        },
        ...Object.entries(sectionOutputs).map(([section, { bytes, filename }]) => ({
          key: section.toLowerCase().replace(/[^a-z0-9]/g, ''),
          path: `${todayStr}/${filename}`,
          bytes,
          name: filename,
        })),
      ];

      // Upload 3 at a time — faster than sequential, avoids ERR_HTTP2_PROTOCOL_ERROR
      const UPLOAD_CONCURRENCY = 3;
      for (let i = 0; i < uploadTasks.length; i += UPLOAD_CONCURRENCY) {
        const batch = uploadTasks.slice(i, i + UPLOAD_CONCURRENCY);
        await Promise.all(
          batch.map(async ({ key, path, bytes, name }) => {
            await uploadToStorage('outputs', path, new Blob([bytes], { type: 'application/pdf' }));
            storagePaths[key] = path;
            addLog(`  Uploaded ${name}`);
          })
        );
      }

      addLog(`All ${uploadTasks.length} PDFs uploaded`);
      updateStep(4, 'done', Date.now() - start);

      // ── Step 5: Publish Edition ─────────────────────────────────────
      start = Date.now();
      updateStep(5, 'running');
      addLog('Publishing edition to E-Paper viewer...');

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

      addLog(`Edition published at ${new Date().toLocaleTimeString('en-GB')}`);
      addLog(`Sections published: ${Object.keys(sectionGroups).join(', ')}`);
      updateStep(5, 'done', Date.now() - start);


      setProgress(100);
      setIsComplete(true);
      addLog('=== Pipeline complete — edition published ===');

      // Send WhatsApp notifications — auto-open each link in a new tab
      try {
        addLog('Sending WhatsApp notifications to subscribers...');
        const notifyResult = await notifySubscribers(todayStr);

        if (notifyResult.status === 'sent') {
          addLog(`WhatsApp messages sent via API: ${notifyResult.sent} delivered, ${notifyResult.failed} failed`);
        } else if (notifyResult.status === 'links' && notifyResult.links?.length > 0) {
          addLog(`Opening ${notifyResult.links.length} WhatsApp message(s) automatically...`);
          for (let i = 0; i < notifyResult.links.length; i++) {
            const entry = notifyResult.links[i];
            addLog(`  Opening WhatsApp for ${entry.phone} [${entry.sections.join(', ')}]`);
            window.open(entry.link, '_blank');
            // Stagger tab opens so WhatsApp Web doesn't choke
            if (i < notifyResult.links.length - 1) {
              await new Promise(r => setTimeout(r, 3000));
            }
          }
          addLog('All WhatsApp tabs opened — press Send in each tab.');
        } else if (notifyResult.skipped) {
          addLog('WhatsApp auto-send is disabled — skipped.');
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
        <h1 className="page-title">Publish Edition</h1>
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
