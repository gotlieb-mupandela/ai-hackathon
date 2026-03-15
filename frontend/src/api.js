/**
 * API client — Supabase-first architecture.
 * - File uploads → Supabase Storage
 * - Page/edition data → Supabase tables (pages, editions)
 * - PDF analysis → Python backend (POST /analyze or POST /pipeline/analyze-all)
 */
import axios from 'axios';
import { getSupabaseClient } from './lib/supabase';

// Python backend — PDF analysis + WhatsApp notifications
const ANALYZER_URL = 'http://localhost:8001';

const analyzer = axios.create({
  baseURL: ANALYZER_URL,
  timeout: 180000, // 3 min — allows for OpenRouter vision model response times
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── PDF Analysis (Python backend) ──────────────────────────

/**
 * Send a PDF file to the Python backend for image conversion + Gemini analysis.
 * Returns { page_number, section, headline, tags }
 */
export const analyzePage = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await analyzer.post('/analyze', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

/**
 * Analyze all PDF pages in a single batch request.
 * Backend tries instant PDF text extraction first; falls back to AI vision per page.
 * All pages are processed in parallel — much faster than calling /analyze one by one.
 *
 * @param {File[]} files - Array of PDF File objects to analyze
 * @returns {Promise<Array<{filename, page_number, section, headline, tags, method}>>}
 *   Results array aligned with the input files order.
 */
export const analyzeAllPages = async (files) => {
  const formData = new FormData();
  files.forEach((f) => formData.append('files', f));
  const res = await analyzer.post('/pipeline/analyze-all', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

/**
 * Server-side deduplication — uses service role key to bypass RLS.
 * Permanently deletes duplicate page records and their storage files.
 * Returns { unique_pages, removed, total_before, total_after }
 */
export const deduplicatePages = async (date) => {
  const res = await analyzer.post('/pipeline/deduplicate', { date });
  return res.data;
};

/**
 * Stamp a single PDF page with a "Page N | Section" banner.
 * @param {Blob|File} file - The PDF blob/file to stamp
 * @param {number} pageNumber - The page number to display
 * @param {string} section - The section name (e.g. "Business")
 * @returns {Promise<Blob>} Stamped PDF as a Blob
 */
export const stampPage = async (file, pageNumber, section) => {
  const formData = new FormData();
  formData.append('file', file instanceof File ? file : new File([file], 'page.pdf', { type: 'application/pdf' }));
  formData.append('page_number', String(pageNumber));
  formData.append('section', section);
  const res = await analyzer.post('/pipeline/stamp', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    responseType: 'arraybuffer',
  });
  return new Blob([res.data], { type: 'application/pdf' });
};

// ─── WhatsApp Subscribers (Python backend) ──────────────────

export const getSubscribers = async () => {
  const res = await analyzer.get('/subscribers');
  return res.data;
};

export const addSubscriber = async (phone) => {
  const res = await analyzer.post('/subscribers/add', { phone });
  return res.data;
};

export const removeSubscriber = async (phone) => {
  const res = await analyzer.post('/subscribers/remove', { phone });
  return res.data;
};

export const updateSubscriberPreferences = async (phone, sections) => {
  const res = await analyzer.post('/subscribers/preferences', { phone, sections });
  return res.data;
};

export const toggleAutoSend = async () => {
  const res = await analyzer.post('/subscribers/auto-send');
  return res.data;
};

export const notifySubscribers = async (editionDate) => {
  // WhatsApp delivery runs in the background — use a short timeout so it
  // never blocks the pipeline UI.  If the agent is not running it fails fast.
  const res = await analyzer.post(
    '/notify-subscribers',
    { edition_date: editionDate },
    { timeout: 15000 }  // 15 s — agent health check + queue, not actual delivery
  );
  return res.data;
};

// ─── Supabase Storage ───────────────────────────────────────

/**
 * Upload a file to Supabase Storage.
 * @param {string} bucket - Storage bucket name ('Upload' for pages, 'outputs' for pipeline)
 * @param {string} path - Storage path e.g. '2026-03-14/page1.pdf'
 * @param {File|Blob} file - The file to upload
 */
export const uploadToStorage = async (bucket, path, file) => {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase not configured');

  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (!error) return data;
    lastError = error;

    // Retry transient network/protocol errors with backoff.
    const errMsg = String(error.message || '').toLowerCase();
    const retryable =
      errMsg.includes('failed to fetch') ||
      errMsg.includes('network') ||
      errMsg.includes('http2') ||
      errMsg.includes('timeout') ||
      errMsg.includes('econnreset');

    if (!retryable || attempt === 4) break;
    await sleep(attempt * 1200);
  }

  throw lastError || new Error('Upload failed');
};

/**
 * Get a public/signed URL for a file in Supabase Storage.
 */
export const getStorageUrl = (bucket, path) => {
  const supabase = getSupabaseClient();
  if (!supabase) return '';

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || '';
};

/**
 * Download a file from Supabase Storage as a Blob.
 */
export const downloadFromStorage = async (bucket, path) => {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw error;
  return data; // Blob
};

// ─── Pages table ────────────────────────────────────────────

/**
 * Insert a new page record.
 */
export const insertPage = async (pageData) => {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('pages')
    .insert(pageData)
    .select()
    .single();

  if (error) throw error;
  return data;
};

/**
 * Update a page record (e.g. with analysis results).
 */
export const updatePage = async (id, updates) => {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('pages')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

/**
 * Delete a page record and its file from Supabase Storage.
 */
export const deletePage = async (id, storagePath) => {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase not configured');

  // Remove the file from storage first
  if (storagePath) {
    const { error: storageError } = await supabase.storage
      .from('Upload')
      .remove([storagePath]);
    if (storageError) console.warn('Storage delete warning:', storageError.message);
  }

  // Delete the row from the pages table
  const { error } = await supabase.from('pages').delete().eq('id', id);
  if (error) throw error;
};

/**
 * Fetch all pages for a given date.
 * Returns [] when not authenticated to avoid 401 errors after logout.
 */
export const getPages = async (editionDate) => {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase not configured');

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];

  const { data, error } = await supabase
    .from('pages')
    .select('*')
    .eq('edition_date', editionDate)
    .order('uploaded_at', { ascending: true });

  if (error) throw error;
  return data || [];
};

// ─── Editions table ─────────────────────────────────────────

/**
 * Upsert an edition record (insert or update by date).
 */
export const upsertEdition = async (editionData) => {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('editions')
    .upsert(editionData, { onConflict: 'date' })
    .select()
    .single();

  if (error) throw error;
  return data;
};

/**
 * Get a single edition by date.
 */
export const getEdition = async (date) => {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('editions')
    .select('*')
    .eq('date', date)
    .maybeSingle();

  if (error) throw error;
  return data;
};

/**
 * Delete a single output PDF (e.g. sport.pdf) from the outputs bucket and
 * remove its key from the edition's storage_paths in the DB.
 * If the key is 'full_paper' the edition is also set back to 'draft'.
 */
export const deleteOutputPdf = async (date, storageKey, storagePath) => {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase not configured');

  // Remove the file from storage
  if (storagePath) {
    const { error: storageErr } = await supabase.storage
      .from('outputs')
      .remove([storagePath]);
    if (storageErr) console.warn('Storage delete warning:', storageErr.message);
  }

  // Fetch the current edition row so we can patch storage_paths
  const { data: edition, error: fetchErr } = await supabase
    .from('editions')
    .select('storage_paths, outputs, status')
    .eq('date', date)
    .single();
  if (fetchErr) throw fetchErr;

  const currentPaths = { ...(edition.storage_paths || edition.outputs || {}) };
  delete currentPaths[storageKey];

  const updates = {
    storage_paths: currentPaths,
    outputs: currentPaths,
  };
  if (storageKey === 'full_paper') {
    updates.status = 'draft'; // Unpublish if the full paper is deleted
  }

  const { error: updateErr } = await supabase
    .from('editions')
    .update(updates)
    .eq('date', date);
  if (updateErr) throw updateErr;
};

/**
 * Fetch only published editions that came through the pipeline (have storage_paths), newest first.
 */
export const getEditions = async () => {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase
    .from('editions')
    .select('*')
    .eq('status', 'published')
    .not('storage_paths', 'is', null)
    .order('date', { ascending: false });

  if (error) throw error;
  return data || [];
};

/**
 * Get edition settings for today (or create draft if none exists).
 * Returns a default draft when not authenticated to avoid 401/RLS errors on login page.
 */
export const getOrCreateTodayEdition = async (todayStr) => {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase not configured');

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { date: todayStr, status: 'draft', expected_pages: 24, deadline: '15:00' };
  }

  // Try to get existing
  let { data, error } = await supabase
    .from('editions')
    .select('*')
    .eq('date', todayStr)
    .maybeSingle();

  if (error) throw error;

  // Create draft if not found
  if (!data) {
    const result = await supabase
      .from('editions')
      .insert({ date: todayStr, status: 'draft', expected_pages: 24, deadline: '15:00' })
      .select()
      .single();

    if (result.error) throw result.error;
    data = result.data;
  }

  return data;
};

// ─── AI Agent ───────────────────────────────────────────

/**
 * Query the AI Agent with data-driven insights.
 * Agent analyzes company data and makes informed recommendations.
 */
export const queryAgent = async (params) => {
  const res = await analyzer.post('/agent/query', params);
  return res.data;
};
