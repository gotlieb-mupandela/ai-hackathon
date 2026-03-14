import React, { useState, useEffect, useCallback } from 'react';
import {
  getSubscribers,
  addSubscriber,
  removeSubscriber,
  toggleAutoSend,
} from '../api';
import './SubscriberPanel.css';

export default function SubscriberPanel() {
  const [numbers, setNumbers] = useState([]);
  const [autoSend, setAutoSend] = useState(true);
  const [newPhone, setNewPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  const getErrorMessage = (err, fallback) => {
    const status = err?.response?.status;
    const data = err?.response?.data;
    const detail = data?.detail;

    if (status === 404) {
      return 'Subscriber API not found (404). Start the Python backend with: cd backend && uvicorn main:app --reload';
    }
    if (detail) return Array.isArray(detail) ? detail.map((d) => d.msg).join(', ') : String(detail);
    if (typeof data === 'string') return data;
    return err?.message || fallback;
  };

  const fetchSubscribers = useCallback(async () => {
    try {
      const data = await getSubscribers();
      setNumbers(data.numbers || []);
      setAutoSend(data.auto_send ?? true);
      setError('');
    } catch (err) {
      setError(
        err?.message === 'Network Error'
          ? 'Cannot reach backend — make sure the Python server is running on port 8000.'
          : getErrorMessage(err, 'Could not load subscribers')
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscribers();
  }, [fetchSubscribers]);

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
      setNumbers(data.numbers || []);
      setNewPhone('');
    } catch (err) {
      setError(
        err?.message === 'Network Error'
          ? 'Cannot reach backend — make sure the Python server is running on port 8000.'
          : getErrorMessage(err, 'Failed to add subscriber')
      );
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (phone) => {
    try {
      const data = await removeSubscriber(phone);
      setNumbers(data.numbers || []);
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

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleAdd();
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
          onKeyDown={handleKeyDown}
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
          numbers.map((phone) => (
            <div key={phone} className="subscriber-item">
              <span className="subscriber-phone">{phone}</span>
              <button
                className="subscriber-remove-btn"
                onClick={() => handleRemove(phone)}
                title={`Remove ${phone}`}
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
