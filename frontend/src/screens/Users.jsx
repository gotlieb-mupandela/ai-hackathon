/**
 * Users screen — customer/reader management.
 * Columns: Customer Name, Email, Phone No, Gender, Country, Subscriptions, Status, Action.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { getSupabaseClient } from '../lib/supabase';
import './Management.css';
import './TableScreen.css';

const GENDERS   = ['Male', 'Female', 'Other', 'Prefer not to say'];
const STATUSES  = ['Active', 'Inactive'];
const COUNTRIES = ['Namibia', 'South Africa', 'Botswana', 'Zimbabwe', 'Zambia', 'Angola', 'Other'];
const PAGE_SIZE = 10;

const SECTION_COLORS = {
  'FullPaper':        '#ef4444',
  'NewEra Business':  '#3b82f6',
  'NewEra Sport':     '#10b981',
  'NewEra AgriToday': '#22c55e',
  'NewEra Vibez':     '#ec4899',
  'Magazines':        '#f59e0b',
  'Kundana':          '#8b5cf6',
};

const EMPTY_FORM = { customer_name: '', email: '', phone_no: '', gender: 'Male', country: 'Namibia', status: 'Active' };

function SectionChip({ name }) {
  if (!name) return null;
  return <span className="ts-section-chip" style={{ color: SECTION_COLORS[name] || 'var(--accent)' }}>{name}</span>;
}

function StatusBadge({ status }) {
  return <span className={`ts-status ${status === 'Active' ? 'ts-status--active' : 'ts-status--inactive'}`}>{status}</span>;
}

export default function Users() {
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
      let q = supabase
        .from('customers')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });
      if (filterStatus !== 'All') q = q.eq('status', filterStatus);
      if (search.trim()) {
        q = q.or(`customer_name.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`);
      }
      const from = (page - 1) * PAGE_SIZE;
      q = q.range(from, from + PAGE_SIZE - 1);
      const { data, error: err, count } = await q;
      if (err) throw err;
      
      // Fetch subscriptions separately (no relationship join needed)
      if (data && data.length > 0) {
        const { data: subs } = await supabase
          .from('subscriptions')
          .select('customer_id, section')
          .in('customer_id', data.map(c => c.id));
        const subsMap = {};
        (subs || []).forEach(s => {
          if (!subsMap[s.customer_id]) subsMap[s.customer_id] = [];
          subsMap[s.customer_id].push(s);
        });
        data.forEach(c => { c.subscriptions = subsMap[c.id] || []; });
      }
      
      setRows(data || []);
      setTotal(count || 0);
      setError('');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [supabase, search, filterStatus, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, filterStatus]);

  function openCreate() { setEditRow(null); setForm(EMPTY_FORM); setShowModal(true); }
  function openEdit(row) {
    setEditRow(row);
    setForm({ customer_name: row.customer_name, email: row.email, phone_no: row.phone_no || '', gender: row.gender || 'Male', country: row.country || 'Namibia', status: row.status });
    setShowModal(true);
  }
  function closeModal() { setShowModal(false); setEditRow(null); setForm(EMPTY_FORM); }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { customer_name: form.customer_name.trim(), email: form.email.trim(), phone_no: form.phone_no.trim(), gender: form.gender, country: form.country, status: form.status };
      const { error: err } = editRow
        ? await supabase.from('customers').update(payload).eq('id', editRow.id)
        : await supabase.from('customers').insert(payload);
      if (err) throw err;
      closeModal(); await load();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id) {
    const { error: err } = await supabase.from('customers').delete().eq('id', id);
    if (err) { setError(err.message); return; }
    setDeleteId(null); await load();
  }

  async function exportAll(type) {
    const { data } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
    if (type === 'csv') {
      const h = 'Customer Name,Email,Phone No,Gender,Country,Status\n';
      const b = (data || []).map(r => `"${r.customer_name}","${r.email}","${r.phone_no || ''}","${r.gender || ''}","${r.country || ''}","${r.status}"`).join('\n');
      dl('users.csv', h + b, 'text/csv');
    } else {
      const b = (data || []).map(r => `${r.customer_name} | ${r.email} | ${r.phone_no||''} | ${r.gender||''} | ${r.country||''} | ${r.status}`).join('\n');
      dl('users.txt', b, 'text/plain');
    }
  }
  function dl(name, content, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name; a.click(); }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mgmt-screen">
      <div className="ts-page-header">
        <div>
          <h1 className="page-title">Users</h1>
          <nav className="ts-breadcrumb"><span>NewEra</span><span className="ts-bc-sep">/</span><span>Users</span><span className="ts-bc-sep">/</span><span className="ts-bc-active">Index</span></nav>
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
          <input className="ts-search" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="ts-toolbar-right">
          <select className="ts-filter-select" value={filterStatus} onChange={e => setFilter(e.target.value)}>
            <option>All</option><option>Active</option><option>Inactive</option>
          </select>
          <button className="btn-export" onClick={() => exportAll('csv')}>Export CSV</button>
          <button className="btn-export" onClick={() => exportAll('txt')}>Export TXT</button>
        </div>
      </div>

      <div className="ts-table-wrap">
        <div className="ts-col-header users-grid">
          <span>Customer Name</span><span>Email</span><span>Phone No</span>
          <span>Gender</span><span>Country</span><span>Subscriptions</span>
          <span>Status</span><span>Action</span>
        </div>

        {loading ? (
          <div className="mgmt-loading"><div className="loading-spinner" /><p>Loading…</p></div>
        ) : rows.length === 0 ? (
          <div className="mgmt-empty">No users found.</div>
        ) : rows.map(row => {
          const subs = row.subscriptions || [];
          return (
            <div key={row.id} className="ts-row users-grid">
              <span className="ts-name">{row.customer_name}</span>
              <span className="ts-email">{row.email}</span>
              <span className="ts-muted">{row.phone_no || '—'}</span>
              <span className="ts-muted">{row.gender || '—'}</span>
              <span className="ts-muted">{row.country || '—'}</span>
              <span>
                {subs.length > 0
                  ? subs.map((s, i) => <SectionChip key={i} name={s.section} />)
                  : <span className="ts-muted">—</span>}
              </span>
              <StatusBadge status={row.status} />
              <span className="ts-actions">
                <button
                  className={`action-btn action-btn--dot ${row.status === 'Active' ? 'dot--active' : 'dot--inactive'}`}
                  title={row.status === 'Active' ? 'Deactivate' : 'Activate'}
                  onClick={async () => {
                    const newStatus = row.status === 'Active' ? 'Inactive' : 'Active';
                    await supabase.from('customers').update({ status: newStatus }).eq('id', row.id);
                    load();
                  }}
                />
                <button className="action-btn action-btn--edit" title="Edit" onClick={() => openEdit(row)}>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                <button className="action-btn action-btn--delete" title="Delete" onClick={() => setDeleteId(row.id)}>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                </button>
              </span>
            </div>
          );
        })}

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
              <h2>{editRow ? 'Edit User' : 'Create New User'}</h2>
              <button className="modal-close-btn" onClick={closeModal}><svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <form className="ts-form" onSubmit={handleSave}>
              <label className="form-label">Customer Name<input type="text" className="form-input" value={form.customer_name} onChange={e => setForm({...form, customer_name: e.target.value})} required /></label>
              <label className="form-label">Email<input type="email" className="form-input" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required /></label>
              <label className="form-label">Phone No<input type="tel" className="form-input" value={form.phone_no} onChange={e => setForm({...form, phone_no: e.target.value})} /></label>
              <div className="form-row-2">
                <label className="form-label">Gender<select className="form-input" value={form.gender} onChange={e => setForm({...form, gender: e.target.value})}>{GENDERS.map(g=><option key={g}>{g}</option>)}</select></label>
                <label className="form-label">Country<select className="form-input" value={form.country} onChange={e => setForm({...form, country: e.target.value})}>{COUNTRIES.map(c=><option key={c}>{c}</option>)}</select></label>
              </div>
              <label className="form-label">Status<select className="form-input" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></label>
              <div className="form-actions">
                <button type="button" className="btn-cancel" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn-save" disabled={saving}>{saving ? 'Saving…' : editRow ? 'Save Changes' : 'Create User'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="ts-modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="ts-modal ts-modal--sm" onClick={e => e.stopPropagation()}>
            <div className="ts-modal-header"><h2>Delete User</h2></div>
            <p className="delete-confirm-text">Delete this user permanently? Their subscription history will also be removed.</p>
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
