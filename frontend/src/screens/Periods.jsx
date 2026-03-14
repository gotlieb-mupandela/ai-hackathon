/**
 * Periods screen — subscription period management.
 * Fields: Period in Months, For Section, Cost, Status, Date Created, Actions.
 * Supports create, edit, delete, search, filter, export CSV/TXT.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '../lib/supabase';
import './Management.css';
import './Periods.css';

const SECTIONS = ['NewEra Business', 'NewEra Sport', 'NewEra AgriToday', 'NewEra Vibez', 'FullPaper'];
const STATUSES = ['Active', 'Inactive'];
const PERIOD_OPTIONS = [1, 3, 6, 12, 24, 36];

const EMPTY_FORM = { period_months: '', section: SECTIONS[0], cost: '', status: 'Active' };

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).replace(/ /g, ' ');
}

function StatusBadge({ status }) {
  const isActive = status === 'Active';
  return (
    <span className={`period-badge ${isActive ? 'period-badge--active' : 'period-badge--inactive'}`}>
      {status}
    </span>
  );
}

function SectionLabel({ name }) {
  const colorMap = {
    'NewEra Business':  '#f59e0b',
    'NewEra Sport':     '#10b981',
    'NewEra AgriToday': '#34d399',
    'NewEra Vibez':     '#ec4899',
    'FullPaper':        '#ef4444',
  };
  return (
    <span className="period-section-label" style={{ color: colorMap[name] || 'var(--accent)' }}>
      {name}
    </span>
  );
}

export default function Periods() {
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');
  const [filterStatus, setFilter] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [editRow, setEditRow]     = useState(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [deleteId, setDeleteId]   = useState(null);

  const supabase = getSupabaseClient();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: err } = await supabase
        .from('periods')
        .select('*')
        .order('created_at', { ascending: false });
      if (err) throw err;
      setRows(data || []);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  // ─── Filtering ────────────────────────────────────────────────
  const filtered = rows.filter((r) => {
    const matchStatus = filterStatus === 'All' || r.status === filterStatus;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      String(r.period_months).includes(q) ||
      (r.section || '').toLowerCase().includes(q) ||
      String(r.cost).includes(q);
    return matchStatus && matchSearch;
  });

  // ─── Modal helpers ────────────────────────────────────────────
  function openCreate() {
    setEditRow(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  }

  function openEdit(row) {
    setEditRow(row);
    setForm({
      period_months: row.period_months,
      section:       row.section,
      cost:          row.cost,
      status:        row.status,
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditRow(null);
    setForm(EMPTY_FORM);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.period_months || !form.cost) return;
    setSaving(true);
    try {
      const payload = {
        period_months: Number(form.period_months),
        section:       form.section,
        cost:          parseFloat(form.cost),
        status:        form.status,
      };
      let err;
      if (editRow) {
        ({ error: err } = await supabase.from('periods').update(payload).eq('id', editRow.id));
      } else {
        ({ error: err } = await supabase.from('periods').insert(payload));
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
    const { error: err } = await supabase.from('periods').delete().eq('id', id);
    if (err) { setError(err.message); return; }
    setDeleteId(null);
    await load();
  }

  // ─── Export helpers ───────────────────────────────────────────
  function exportCSV() {
    const header = 'Period (Months),Section,Cost,Status,Date Created\n';
    const body = filtered
      .map((r) => `${r.period_months},"${r.section}",N$ ${r.cost},${r.status},${formatDate(r.created_at)}`)
      .join('\n');
    download('periods.csv', header + body, 'text/csv');
  }

  function exportTXT() {
    const body = filtered
      .map((r) => `${r.period_months} months | ${r.section} | N$ ${r.cost} | ${r.status} | ${formatDate(r.created_at)}`)
      .join('\n');
    download('periods.txt', body, 'text/plain');
  }

  function download(filename, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = filename;
    a.click();
  }

  return (
    <div className="mgmt-screen">
      {/* Header */}
      <div className="periods-page-header">
        <div>
          <h1 className="page-title">Periods</h1>
          <nav className="periods-breadcrumb">
            <span>NewEra</span>
            <span className="bc-sep">/</span>
            <span>Subscription Periods</span>
            <span className="bc-sep">/</span>
            <span className="bc-active">Index</span>
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
      <div className="periods-toolbar">
        <div className="periods-search-wrap">
          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="search-ico">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            className="periods-search"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="periods-toolbar-right">
          <select
            className="periods-filter-select"
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
      <div className="periods-table-wrap">
        <div className="periods-col-header">
          <span>Period in Months</span>
          <span>For Section</span>
          <span>Cost</span>
          <span>Status</span>
          <span>Date Created</span>
          <span>Actions</span>
        </div>

        {loading ? (
          <div className="mgmt-loading">
            <div className="loading-spinner" />
            <p>Loading…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="mgmt-empty">No periods found. Click "+ Create New" to add one.</div>
        ) : (
          filtered.map((row) => (
            <div key={row.id} className="periods-row">
              <span className="periods-months">{row.period_months}</span>
              <SectionLabel name={row.section} />
              <span className="periods-cost">N$ {Number(row.cost).toLocaleString()}</span>
              <StatusBadge status={row.status} />
              <span className="periods-created">{formatDate(row.created_at)}</span>
              <span className="periods-actions">
                <button className="action-btn action-btn--edit" title="Edit" onClick={() => openEdit(row)}>
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  className="action-btn action-btn--delete"
                  title="Delete"
                  onClick={() => setDeleteId(row.id)}
                >
                  <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                </button>
              </span>
            </div>
          ))
        )}
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="periods-modal-overlay" onClick={closeModal}>
          <div className="periods-modal" onClick={(e) => e.stopPropagation()}>
            <div className="periods-modal-header">
              <h2>{editRow ? 'Edit Period' : 'Create New Period'}</h2>
              <button className="modal-close-btn" onClick={closeModal}>
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form className="periods-form" onSubmit={handleSave}>
              <label className="form-label">
                Period in Months
                <select
                  className="form-input"
                  value={form.period_months}
                  onChange={(e) => setForm({ ...form, period_months: e.target.value })}
                  required
                >
                  <option value="">Select…</option>
                  {PERIOD_OPTIONS.map((p) => (
                    <option key={p} value={p}>{p} months</option>
                  ))}
                </select>
              </label>
              <label className="form-label">
                For Section
                <select
                  className="form-input"
                  value={form.section}
                  onChange={(e) => setForm({ ...form, section: e.target.value })}
                >
                  {SECTIONS.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label className="form-label">
                Cost (N$)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="form-input"
                  placeholder="e.g. 90"
                  value={form.cost}
                  onChange={(e) => setForm({ ...form, cost: e.target.value })}
                  required
                />
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
                  {saving ? 'Saving…' : editRow ? 'Save Changes' : 'Create Period'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteId && (
        <div className="periods-modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="periods-modal periods-modal--sm" onClick={(e) => e.stopPropagation()}>
            <div className="periods-modal-header">
              <h2>Delete Period</h2>
            </div>
            <p className="delete-confirm-text">Are you sure you want to delete this period? This action cannot be undone.</p>
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
