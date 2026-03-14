/**
 * Payments screen — transaction/payment records.
 * Columns: Trans. ID, User ID, Cost (N$), Method, Reference, Section, Period, Date Created.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '../lib/supabase';
import './Management.css';
import './TableScreen.css';

const SECTIONS = ['FullPaper', 'NewEra Business', 'NewEra Sport', 'NewEra AgriToday', 'NewEra Vibez', 'Magazines', 'Kundana'];
const METHODS  = ['Bank Transfer', 'Cash', 'Card', 'Mobile Money'];
const PAGE_SIZE = 10;

const EMPTY_FORM = {
  user_id: '', cost: '', method: 'Bank Transfer',
  reference: '', section: SECTIONS[0], period_months: 1,
};

function fmtDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function MethodChip({ method }) {
  const isTransfer = method === 'Bank Transfer';
  const isCard = method === 'Card';
  return (
    <span className={`ts-method-chip ${isTransfer ? 'method--transfer' : isCard ? 'method--card' : 'method--cash'}`}>
      {method}
    </span>
  );
}

export default function Payments() {
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');
  const [filterMethod, setFilter] = useState('All Payments');
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
      let q = supabase.from('payments').select('*', { count: 'exact' }).order('created_at', { ascending: false });
      if (filterMethod !== 'All Payments') q = q.eq('method', filterMethod);
      if (search.trim()) q = q.ilike('user_id', `%${search.trim()}%`);
      const from = (page - 1) * PAGE_SIZE;
      q = q.range(from, from + PAGE_SIZE - 1);
      const { data, error: err, count } = await q;
      if (err) throw err;
      setRows(data || []);
      setTotal(count || 0);
      setError('');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [supabase, search, filterMethod, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, filterMethod]);

  function openCreate() { setEditRow(null); setForm(EMPTY_FORM); setShowModal(true); }
  function openEdit(row) {
    setEditRow(row);
    setForm({ user_id: row.user_id, cost: row.cost, method: row.method, reference: row.reference || '', section: row.section, period_months: row.period_months });
    setShowModal(true);
  }
  function closeModal() { setShowModal(false); setEditRow(null); setForm(EMPTY_FORM); }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { user_id: form.user_id.trim(), cost: parseFloat(form.cost), method: form.method, reference: form.reference.trim() || null, section: form.section, period_months: Number(form.period_months) };
      const { error: err } = editRow
        ? await supabase.from('payments').update(payload).eq('id', editRow.id)
        : await supabase.from('payments').insert(payload);
      if (err) throw err;
      closeModal(); await load();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id) {
    const { error: err } = await supabase.from('payments').delete().eq('id', id);
    if (err) { setError(err.message); return; }
    setDeleteId(null); await load();
  }

  async function exportAll(type) {
    const { data } = await supabase.from('payments').select('*').order('created_at', { ascending: false });
    if (type === 'csv') {
      const h = 'Trans ID,User ID,Cost (N$),Method,Reference,Section,Period,Date Created\n';
      const b = (data || []).map(r => `${r.id},"${r.user_id}",${r.cost},"${r.method}","${r.reference||''}","${r.section}",${r.period_months} mos,${fmtDate(r.created_at)}`).join('\n');
      dl('payments.csv', h + b, 'text/csv');
    } else {
      const b = (data || []).map(r => `${r.id} | ${r.user_id} | N$ ${r.cost} | ${r.method} | ${r.reference||''} | ${r.section} | ${r.period_months} mos | ${fmtDate(r.created_at)}`).join('\n');
      dl('payments.txt', b, 'text/plain');
    }
  }
  function dl(name, content, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name; a.click(); }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mgmt-screen">
      <div className="ts-page-header">
        <div>
          <h1 className="page-title">Payments</h1>
          <nav className="ts-breadcrumb"><span>NewEra</span><span className="ts-bc-sep">/</span><span>Payments</span><span className="ts-bc-sep">/</span><span className="ts-bc-active">Index</span></nav>
        </div>
        <button className="btn-create-new" onClick={openCreate}>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Create New
        </button>
      </div>

      {error && <div className="mgmt-error">{error}</div>}

      <div className="ts-toolbar">
        <div className="ts-search-wrap">
          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="ts-search-ico"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input className="ts-search" placeholder="Search by user…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="ts-toolbar-right">
          <select className="ts-filter-select" value={filterMethod} onChange={e => setFilter(e.target.value)}>
            <option>All Payments</option>
            {METHODS.map(m => <option key={m}>{m}</option>)}
          </select>
          <button className="btn-export" onClick={() => exportAll('csv')}>Export CSV</button>
          <button className="btn-export" onClick={() => exportAll('txt')}>Export TXT</button>
        </div>
      </div>

      <div className="ts-table-wrap">
        <div className="ts-col-header payments-grid">
          <span>Trans. ID</span><span>User ID</span><span>Cost (N$)</span>
          <span>Method</span><span>Reference</span><span>Section</span>
          <span>Period</span><span>Date Created</span><span>Actions</span>
        </div>

        {loading ? (
          <div className="mgmt-loading"><div className="loading-spinner" /><p>Loading…</p></div>
        ) : rows.length === 0 ? (
          <div className="mgmt-empty">No payments found.</div>
        ) : rows.map(row => (
          <div key={row.id} className="ts-row payments-grid">
            <span className="ts-id">{row.id}</span>
            <span className="ts-email">{row.user_id}</span>
            <span className="ts-cost">N$ {Number(row.cost).toLocaleString()}</span>
            <MethodChip method={row.method} />
            <span className="ts-ref">{row.reference || '—'}</span>
            <span className="ts-muted">{row.section}</span>
            <span className="ts-muted">{row.period_months} mos</span>
            <span className="ts-muted">{fmtDate(row.created_at)}</span>
            <span className="ts-actions">
              <button className="action-btn action-btn--edit" title="Edit" onClick={() => openEdit(row)}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              </button>
              <button className="action-btn action-btn--delete" title="Delete" onClick={() => setDeleteId(row.id)}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
              </button>
            </span>
          </div>
        ))}

        <div className="ts-table-footer">
          <span className="ts-showing">{total === 0 ? 'No data available' : `Showing ${(page-1)*PAGE_SIZE+1} to ${Math.min(page*PAGE_SIZE,total)} of ${total} entries`}</span>
          <div className="ts-pagination">
            <button className="page-btn" disabled={page===1} onClick={() => setPage(p=>p-1)}>Previous</button>
            {buildPageNums(page, totalPages).map((p, i) => p === '...'
              ? <span key={`e${i}`} className="page-ellipsis">…</span>
              : <button key={p} className={`page-btn page-btn--num ${p===page?'page-btn--active':''}`} onClick={() => setPage(p)}>{p}</button>
            )}
            <button className="page-btn" disabled={page===totalPages} onClick={() => setPage(p=>p+1)}>Next</button>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="ts-modal-overlay" onClick={closeModal}>
          <div className="ts-modal" onClick={e => e.stopPropagation()}>
            <div className="ts-modal-header">
              <h2>{editRow ? 'Edit Payment' : 'Record New Payment'}</h2>
              <button className="modal-close-btn" onClick={closeModal}><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <form className="ts-form" onSubmit={handleSave}>
              <label className="form-label">User Email<input type="email" className="form-input" value={form.user_id} onChange={e => setForm({...form, user_id: e.target.value})} required /></label>
              <div className="form-row-2">
                <label className="form-label">Cost (N$)<input type="number" min="0" step="0.01" className="form-input" value={form.cost} onChange={e => setForm({...form, cost: e.target.value})} required /></label>
                <label className="form-label">Method<select className="form-input" value={form.method} onChange={e => setForm({...form, method: e.target.value})}>{METHODS.map(m=><option key={m}>{m}</option>)}</select></label>
              </div>
              <label className="form-label">Reference (optional)<input type="text" className="form-input" value={form.reference} onChange={e => setForm({...form, reference: e.target.value})} /></label>
              <div className="form-row-2">
                <label className="form-label">Section<select className="form-input" value={form.section} onChange={e => setForm({...form, section: e.target.value})}>{SECTIONS.map(s=><option key={s}>{s}</option>)}</select></label>
                <label className="form-label">Period (months)<input type="number" min="1" className="form-input" value={form.period_months} onChange={e => setForm({...form, period_months: e.target.value})} required /></label>
              </div>
              <div className="form-actions">
                <button type="button" className="btn-cancel" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn-save" disabled={saving}>{saving ? 'Saving…' : editRow ? 'Save Changes' : 'Record Payment'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="ts-modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="ts-modal ts-modal--sm" onClick={e => e.stopPropagation()}>
            <div className="ts-modal-header"><h2>Delete Payment</h2></div>
            <p className="delete-confirm-text">Delete this payment record permanently?</p>
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

function buildPageNums(current, total) {
  if (total <= 7) return Array.from({length: total}, (_, i) => i + 1);
  const pages = [1];
  if (current > 3) pages.push('...');
  for (let i = Math.max(2, current-1); i <= Math.min(total-1, current+1); i++) pages.push(i);
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}
