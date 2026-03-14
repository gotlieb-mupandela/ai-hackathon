/**
 * Designers management screen for admins.
 * Creates designer accounts via the backend's /admin/create-designer endpoint
 * (uses service role key + email_confirm=True), so designers can sign in immediately.
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { getSupabaseClient } from '../lib/supabase';
import './Designers.css';

const BACKEND = 'http://localhost:8000';

export default function Designers() {
  const [designers, setDesigners]     = useState([]);
  const [newEmail, setNewEmail]       = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]         = useState(true);
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState('');

  useEffect(() => {
    loadDesigners();
  }, []);

  const loadDesigners = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Supabase not configured');
      setLoading(false);
      return;
    }
    try {
      const { data, error: fetchError } = await supabase
        .from('designers')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setDesigners(data || []);
      setError('');
    } catch (err) {
      console.error('Error loading designers:', err);
      setError(err.message || 'Failed to load designers');
    } finally {
      setLoading(false);
    }
  };

  const handleAddDesigner = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (!newEmail.trim()) {
      setError('Email is required');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail.trim())) {
      setError('Please enter a valid email address');
      return;
    }
    if (!newPassword) {
      setError('Password is required');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Supabase not configured');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Create auth account via backend (service role, email_confirm=true → no email confirmation needed)
      await axios.post(`${BACKEND}/admin/create-designer`, {
        email: newEmail.trim().toLowerCase(),
        password: newPassword,
      });

      // 2. Add email to the designers allowlist table in Supabase
      const { error: insertError } = await supabase
        .from('designers')
        .insert({ email: newEmail.trim().toLowerCase() });

      if (insertError && insertError.code !== '23505') {
        throw insertError;
      }

      setSuccess(`Designer account created for ${newEmail}! They can sign in immediately.`);
      setNewEmail('');
      setNewPassword('');
      await loadDesigners();
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      console.error('Error creating designer:', err);
      const detail = err?.response?.data?.detail;
      setError(detail || err.message || 'Failed to create designer account');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveDesigner = async (id, email) => {
    if (!window.confirm(`Remove designer ${email}? This removes their access but does not delete their auth account.`)) {
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Supabase not configured');
      return;
    }
    try {
      const { error: deleteError } = await supabase
        .from('designers')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;
      setSuccess(`Designer ${email} removed`);
      await loadDesigners();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Error removing designer:', err);
      setError(err.message || 'Failed to remove designer');
    }
  };

  if (loading) {
    return (
      <div className="designers-screen">
        <div className="designers-loading">
          <div className="loading-spinner" />
          <p>Loading designers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="designers-screen">
      <header className="page-header">
        <h1 className="page-title">Designers Management</h1>
        <p className="page-subtitle">Create designer accounts and manage access to the editorial system</p>
      </header>

      <div className="designers-content">
        {/* Add designer form */}
        <div className="designers-add-panel">
          <h2 className="panel-title">Add New Designer</h2>
          <p className="panel-description">
            Create a login account for a new designer. They can use these credentials to sign in immediately.
          </p>

          <form onSubmit={handleAddDesigner} className="add-designer-form">
            <div className="form-row">
              {/* Email */}
              <div className="form-group">
                <label htmlFor="designer-email">Designer Email</label>
                <input
                  type="email"
                  id="designer-email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="designer@example.com"
                  className="email-input"
                  disabled={submitting}
                  autoComplete="off"
                />
              </div>

              {/* Password */}
              <div className="form-group">
                <label htmlFor="designer-password">Password</label>
                <div className="password-input-wrap">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="designer-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 6 characters"
                    className="email-input"
                    disabled={submitting}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={() => setShowPassword((v) => !v)}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
            </div>

            <button type="submit" className="btn-add-designer" disabled={submitting}>
              {submitting ? (
                <>
                  <span className="btn-spinner" />
                  Creating account…
                </>
              ) : (
                'Create Designer Account'
              )}
            </button>
          </form>

          {error   && <div className="message error-message">{error}</div>}
          {success && <div className="message success-message">{success}</div>}
        </div>

        {/* Designers list */}
        <div className="designers-list-panel">
          <h2 className="panel-title">Current Designers ({designers.length})</h2>

          {designers.length === 0 ? (
            <div className="empty-state">
              <p className="empty-text">No designers added yet</p>
              <p className="empty-hint">Create a designer account above to grant them access</p>
            </div>
          ) : (
            <div className="designers-list">
              {designers.map((designer) => (
                <div key={designer.id} className="designer-card">
                  <div className="designer-info">
                    <div className="designer-email">{designer.email}</div>
                    <div className="designer-meta">
                      Added {new Date(designer.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveDesigner(designer.id, designer.email)}
                    className="btn-remove"
                    title="Remove designer access"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
