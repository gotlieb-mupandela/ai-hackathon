import React, { useState, useEffect, useCallback } from 'react';
import {
  getSubscribers,
  addSubscriber,
  removeSubscriber,
  toggleAutoSend,
  updateSubscriberPreferences,
} from '../api';
import './SubscriberPanel.css';

const SECTIONS = [
  { key: 'full_paper', label: 'Full Paper' },
  { key: 'news',       label: 'News' },
  { key: 'sport',      label: 'Sport' },
  { key: 'business',   label: 'Business' },
  { key: 'vibez',      label: 'Vibez!' },
  { key: 'agritoday',  label: 'AgriToday' },
];

export default function SubscriberPanel() {
  const [numbers, setNumbers]         = useState([]);
  const [preferences, setPreferences] = useState({});
  const [autoSend, setAutoSend]       = useState(true);
  const [newPhone, setNewPhone]       = useState('');
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [adding, setAdding]           = useState(false);
  // Track which subscriber's preferences are being saved
  const [savingPref, setSavingPref]   = useState({});

  const getErrorMessage = (err, fallback) => {
    const status = err?.response?.status;
    const data   = err?.response?.data;
    const detail = data?.detail;
    if (status === 404) return 'Subscriber API not found — start the Python backend on port 8001.';
    if (detail) return Array.isArray(detail) ? detail.map((d) => d.msg).join(', ') : String(detail);
    if (typeof data === 'string') return data;
    return err?.message || fallback;
  };

  const applyData = (data) => {
    setNumbers(data.numbers || []);
    setAutoSend(data.auto_send ?? true);
    setPreferences(data.preferences || {});
  };

  const fetchSubscribers = useCallback(async () => {
    try {
      const data = await getSubscribers();
      applyData(data);
      setError('');
    } catch (err) {
      setError(
        err?.message === 'Network Error'
          ? 'Cannot reach backend — make sure the Python server is running on port 8001.'
          : getErrorMessage(err, 'Could not load subscribers')
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSubscribers(); }, [fetchSubscribers]);

  const handleAdd = async () => {
    const phone = newPhone.trim();
    if (!phone) return;
    if (!phone.startsWith('+')) {
      setError('Phone number must start with country code (e.g. +264...)');
      return;
    }
    setAdding(true);
    setError('');
    try {
      const data = await addSubscriber(phone);
      applyData(data);
      setNewPhone('');
    } catch (err) {
      setError(
        err?.message === 'Network Error'
          ? 'Cannot reach backend — make sure the Python server is running on port 8001.'
          : getErrorMessage(err, 'Failed to add subscriber')
      );
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (phone) => {
    try {
      const data = await removeSubscriber(phone);
      applyData(data);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to remove subscriber'));
    }
  };

  const handleToggleAutoSend = async () => {
    try {
      const data = await toggleAutoSend();
      setAutoSend(data.auto_send);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to toggle auto-send'));
    }
  };

  const handleToggleSection = async (phone, sectionKey) => {
    const current = preferences[phone] || ['full_paper'];
    const updated = current.includes(sectionKey)
      ? current.filter((s) => s !== sectionKey)
      : [...current, sectionKey];

    // Optimistically update UI
    setPreferences((prev) => ({ ...prev, [phone]: updated }));
    setSavingPref((prev) => ({ ...prev, [phone]: true }));

    try {
      const data = await updateSubscriberPreferences(phone, updated);
      applyData(data);
    } catch (err) {
      // Roll back on failure
      setPreferences((prev) => ({ ...prev, [phone]: current }));
      setError(getErrorMessage(err, 'Failed to update preferences'));
    } finally {
      setSavingPref((prev) => ({ ...prev, [phone]: false }));
    }
  };

  if (loading) {
    return (
      <div className="subscriber-panel">
        <div className="subscriber-loading">Loading subscribers...</div>
      </div>
    );
  }

  return (
    <div className="subscriber-panel">
      <div className="subscriber-header">
        <div className="subscriber-title-row">
          <h3 className="subscriber-title">WhatsApp Subscribers</h3>
          <span className="subscriber-count">{numbers.length}</span>
        </div>
        <p className="subscriber-desc">
          Published editions are automatically sent to these numbers via WhatsApp.
          Each subscriber receives a unique one-time PIN before their PDF — they must enter it to open the file.
          A new PIN is generated on every send.
        </p>
      </div>

      {/* Auto-send toggle */}
      <div className="auto-send-row">
        <span className="auto-send-label">Auto-send on publish</span>
        <button
          className={`auto-send-toggle ${autoSend ? 'auto-send-on' : 'auto-send-off'}`}
          onClick={handleToggleAutoSend}
          title={autoSend ? 'Click to disable auto-send' : 'Click to enable auto-send'}
        >
          <span className="toggle-knob" />
          <span className="toggle-text">{autoSend ? 'ON' : 'OFF'}</span>
        </button>
      </div>

      {error && <div className="subscriber-error">{error}</div>}

      {/* Add number form */}
      <div className="subscriber-add-row">
        <input
          type="tel"
          className="subscriber-input"
          placeholder="+264 81 123 4567"
          value={newPhone}
          onChange={(e) => setNewPhone(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          disabled={adding}
        />
        <button
          className="subscriber-add-btn"
          onClick={handleAdd}
          disabled={adding || !newPhone.trim()}
        >
          {adding ? 'Adding...' : '+ Add'}
        </button>
      </div>

      {/* Number list */}
      <div className="subscriber-list">
        {numbers.length === 0 ? (
          <div className="subscriber-empty">
            No subscribers yet. Add phone numbers above.
          </div>
        ) : (
          numbers.map((phone) => {
            const prefs    = preferences[phone] || ['full_paper'];
            const isSaving = savingPref[phone];
            return (
              <div key={phone} className="subscriber-item">
                <div className="subscriber-item-top">
                  <span className="subscriber-phone">{phone}</span>
                  <button
                    className="subscriber-remove-btn"
                    onClick={() => handleRemove(phone)}
                    title={`Remove ${phone}`}
                  >
                    Remove
                  </button>
                </div>

                {/* OTP indicator — PIN is generated fresh on every send */}
                <div className="subscriber-password-row">
                  <span className="subscriber-password-label">PDF Security:</span>
                  <span className="subscriber-otp-badge">One-Time PIN per edition</span>
                </div>

                <div className="subscriber-sections">
                  <span className="subscriber-sections-label">
                    {isSaving ? 'Saving...' : 'Receives:'}
                  </span>
                  <div className="subscriber-section-chips">
                    {SECTIONS.map(({ key, label }) => {
                      const active = prefs.includes(key);
                      return (
                        <button
                          key={key}
                          className={`section-chip ${active ? 'section-chip--active' : ''}`}
                          onClick={() => handleToggleSection(phone, key)}
                          disabled={isSaving}
                          title={active ? `Remove ${label}` : `Add ${label}`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
