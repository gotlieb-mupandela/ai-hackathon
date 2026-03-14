/**
 * Sections screen — subscription section management.
 * Fields: Section Name, Theme (hex color), Last Modified, Status, Actions.
 * Supports create, edit, delete, search, filter, export CSV/TXT, pagination.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '../lib/supabase';
import './Management.css';
import './Sections.css';

const STATUSES = ['Active', 'Inactive'];
const PAGE_SIZE = 10;

const EMPTY_FORM = { name: '', theme: '#D32F2F', status: 'Active' };

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

function StatusBadge({ status }) {
  const isActive = status === 'Active';
  return (
    <span className={`section-badge ${isActive ? 'section-badge--active' : 'section-badge--inactive'}`}>
      {status}
    </span>
  );
}

function ThemeChip({ color }) {
  const label = (color || '#000000').toUpperCase();
  return (
    <span className="theme-chip" style={{ background: color || '#000', color: getContrastColor(color) }}>
      {label}
    </span>
  );
}

/** Returns black or white text depending on background brightness */
function getContrastColor(hex) {
  if (!hex) return '#fff';
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#111' : '#fff';
}

export default function Sections() {
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');
  const [filterStatus, setFilter] = useState('Active');
  const [page, setPage]           = useState(1);
  const [total, setTotal]         = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [editRow, setEditRow]     = useState(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [deleteId, setDeleteId]   = useState(null);

  const supabase = getSupabaseClient();

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      let query = supabase
        .from('sections')
        .select('*', { count: 'exact' })
        .order('updated_at', { ascending: false });

      if (filterStatus !== 'All') query = query.eq('status', filterStatus);
      if (search.trim()) query = query.ilike('name', `%${search.trim()}%`);

      const from = (page - 1) * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data, error: err, count } = await query;
      if (err) throw err;
      setRows(data || []);
      setTotal(count || 0);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, search, filterStatus, page]);

  useEffect(() => { load(); }, [load]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [search, filterStatus]);

  // ─── Modal helpers ────────────────────────────────────────────
  function openCreate() {
    setEditRow(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  }

  function openEdit(row) {
    setEditRow(row);
    setForm({ name: row.name, theme: row.theme || '#D32F2F', status: row.status });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditRow(null);
    setForm(EMPTY_FORM);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name:       form.name.trim(),
        theme:      form.theme,
        status:     form.status,
        updated_at: new Date().toISOString(),
      };
      let err;
      if (editRow) {
        ({ error: err } = await supabase.from('sections').update(payload).eq('id', editRow.id));
      } else {
        ({ error: err } = await supabase.from('sections').insert(payload));
      }
      if (err) throw err;
      closeModal();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    const { error: err } = await supabase.from('sections').delete().eq('id', id);
    if (err) { setError(err.message); return; }
    setDeleteId(null);
    await load();
  }

  // ─── Export helpers ───────────────────────────────────────────
  async function getAllRows() {
    const { data } = await supabase
      .from('sections')
      .select('*')
      .order('updated_at', { ascending: false });
    return data || [];
  }

  async function exportCSV() {
    const all = await getAllRows();
    const header = 'Section Name,Theme,Last Modified,Status\n';
    const body = all.map((r) => `"${r.name}",${r.theme},${formatDate(r.updated_at)},${r.status}`).join('\n');
    download('sections.csv', header + body, 'text/csv');
  }

  async function exportTXT() {
    const all = await getAllRows();
    const body = all.map((r) => `${r.name} | ${r.theme} | ${formatDate(r.updated_at)} | ${r.status}`).join('\n');
    download('sections.txt', body, 'text/plain');
  }

  function download(filename, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = filename;
    a.click();
  }

  // ─── Pagination ───────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const startEntry = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endEntry   = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="mgmt-screen">
      {/* Header */}
      <div className="sections-page-header">
        <div>
          <h1 className="page-title">Subscription Sections</h1>
          <nav className="sections-breadcrumb">
            <span>NewEra</span>
            <span className="sbc-sep">/</span>
            <span>Subscription Sections</span>
            <span className="sbc-sep">/</span>
            <span className="sbc-active">Index</span>
          </nav>
        </div>
        <button className="btn-create-new" onClick={openCreate}>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Create New
        </button>
      </div>

      {error && <div className="mgmt-error">{error}</div>}

      {/* Toolbar */}
      <div className="sections-toolbar">
        <div className="sections-search-wrap">
          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="search-ico-s">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            className="sections-search"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="sections-toolbar-right">
          <select
            className="sections-filter-select"
            value={filterStatus}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option>All</option>
            <option>Active</option>
            <option>Inactive</option>
          </select>
          <button className="btn-export" onClick={exportCSV}>Export CSV</button>
          <button className="btn-export" onClick={exportTXT}>Export TXT</button>
        </div>
      </div>

      {/* Table */}
      <div className="sections-table-wrap">
        <div className="sections-col-header">
          <span>Section Name</span>
          <span>Theme</span>
          <span>Last Modified</span>
          <span>Status</span>
          <span>Actions</span>
        </div>

        {loading ? (
          <div className="mgmt-loading">
            <div className="loading-spinner" />
            <p>Loading…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="mgmt-empty">No sections found. Click "+ Create New" to add one.</div>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="sections-row">
              <span className="section-name">{row.name}</span>
              <ThemeChip color={row.theme} />
              <span className="section-modified">{formatDate(row.updated_at)}</span>
              <StatusBadge status={row.status} />
              <span className="section-actions">
                <button className="action-btn action-btn--edit" title="Edit" onClick={() => openEdit(row)}>
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button className="action-btn action-btn--delete" title="Delete" onClick={() => setDeleteId(row.id)}>
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                </button>
              </span>
            </div>
          ))
        )}

        {/* Pagination footer */}
        <div className="sections-table-footer">
          <span className="sections-showing">
            {total === 0
              ? 'No data available in table'
              : `Showing ${startEntry} to ${endEntry} of ${total} entries`}
          </span>
          <div className="sections-pagination">
            <button
              className="page-btn"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                className={`page-btn page-btn--num ${p === page ? 'page-btn--active' : ''}`}
                onClick={() => setPage(p)}
              >
                {p}
              </button>
            ))}
            <button
              className="page-btn"
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="sections-modal-overlay" onClick={closeModal}>
          <div className="sections-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sections-modal-header">
              <h2>{editRow ? 'Edit Section' : 'Create New Section'}</h2>
              <button className="modal-close-btn" onClick={closeModal}>
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form className="sections-form" onSubmit={handleSave}>
              <label className="form-label">
                Section Name
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. NewEra Sport"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </label>
              <label className="form-label">
                Theme Colour
                <div className="color-picker-row">
                  <input
                    type="color"
                    className="form-color-input"
                    value={form.theme}
                    onChange={(e) => setForm({ ...form, theme: e.target.value })}
                  />
                  <input
                    type="text"
                    className="form-input form-hex-input"
                    value={form.theme}
                    maxLength={7}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setForm({ ...form, theme: v });
                    }}
                  />
                  <ThemeChip color={form.theme} />
                </div>
              </label>
              <label className="form-label">
                Status
                <select
                  className="form-input"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <div className="form-actions">
                <button type="button" className="btn-cancel" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn-save" disabled={saving}>
                  {saving ? 'Saving…' : editRow ? 'Save Changes' : 'Create Section'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteId && (
        <div className="sections-modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="sections-modal sections-modal--sm" onClick={(e) => e.stopPropagation()}>
            <div className="sections-modal-header">
              <h2>Delete Section</h2>
            </div>
            <p className="delete-confirm-text">Are you sure you want to delete this section? This action cannot be undone.</p>
            <div className="form-actions">
              <button className="btn-cancel" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="btn-delete-confirm" onClick={() => handleDelete(deleteId)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
