import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Auth.css';

const FEATURES = [
  {
    title: 'Upload Portal',
    desc: 'Designers upload pages, auto-classified by AI into the correct section',
    color: '#D32F2F',
    icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12',
  },
  {
    title: 'Publish Pipeline',
    desc: 'Merge, split by section, deduplicate, and publish in one click',
    color: '#10b981',
    icon: 'M13 10V3L4 14h7v7l9-11h-7z',
  },
  {
    title: 'E-Paper Viewer',
    desc: 'Browse published editions with thumbnails and downloadable PDFs',
    color: '#3b82f6',
    icon: 'M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z',
  },
  {
    title: 'WhatsApp Delivery',
    desc: 'OTP-protected PDFs sent to subscribers automatically, free of charge',
    color: '#8b5cf6',
    icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  },
];

function FeatureIcon({ d, color }) {
  return (
    <div className="auth-feat-icon" style={{ background: `${color}15`, color }}>
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    </div>
  );
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = await signIn(email.trim(), password);
      if (result?.role === 'admin') navigate('/dashboard', { replace: true });
      else if (result?.role === 'designer') navigate('/upload', { replace: true });
      else navigate('/upload', { replace: true });
    } catch (err) {
      setError(err.message || 'Sign in failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Animated background orbs */}
      <div className="auth-orb auth-orb--1" />
      <div className="auth-orb auth-orb--2" />
      <div className="auth-orb auth-orb--3" />

      <div className="auth-split">
        {/* Left: Login form */}
        <div className="auth-left">
          <div className="auth-left-inner">
            <div className="auth-brand">
              <div className="auth-brand-mark">NE</div>
              <div className="auth-brand-text">
                <span className="auth-brand-name">New Era</span>
                <span className="auth-brand-tag">Editorial Automation</span>
              </div>
            </div>

            <div className="auth-welcome">
              <h1 className="auth-title">Welcome back</h1>
              <p className="auth-subtitle">Sign in to access the editorial dashboard</p>
            </div>

            <form onSubmit={handleSubmit} className="auth-form">
              {error && <div className="auth-error" role="alert">{error}</div>}

              <label className="auth-label" htmlFor="login-email">
                Email Address
                <div className="auth-input-wrap">
                  <svg className="auth-input-icon" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    className="auth-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@newera.com"
                    autoComplete="email"
                    required
                  />
                </div>
              </label>

              <label className="auth-label" htmlFor="login-password">
                <span className="auth-label-row">
                  Password
                  <a href="#forgot" className="auth-forgot" onClick={e => e.preventDefault()}>Forgot password?</a>
                </span>
                <div className="auth-input-wrap">
                  <svg className="auth-input-icon" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <input
                    id="login-password"
                    name="password"
                    type="password"
                    className="auth-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                  />
                </div>
              </label>

              <button type="submit" className="auth-submit" disabled={submitting}>
                {submitting ? (
                  <span className="auth-submit-loading">
                    <span className="auth-spinner" />
                    Signing in...
                  </span>
                ) : (
                  <span className="auth-submit-content">
                    Sign In
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </span>
                )}
              </button>
            </form>

            <div className="auth-security">
              <div className="auth-security-item">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Protected by enterprise-grade security
              </div>
              <div className="auth-security-badges">
                <span>256-bit encryption</span>
                <span className="auth-security-dot" />
                <span>Secure authentication</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Feature showcase */}
        <div className="auth-right">
          <div className="auth-right-inner">
            <h2 className="auth-right-title">Automate your newsroom</h2>
            <p className="auth-right-sub">
              Join editors who trust NewEra to streamline their newspaper production across Namibia.
            </p>

            <div className="auth-features">
              {FEATURES.map((f, i) => (
                <div key={i} className="auth-feat" style={{ animationDelay: `${0.15 + i * 0.1}s` }}>
                  <FeatureIcon d={f.icon} color={f.color} />
                  <div>
                    <div className="auth-feat-title">{f.title}</div>
                    <div className="auth-feat-desc">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="auth-testimonial">
              <p className="auth-testimonial-text">
                &ldquo;The editorial system gives us complete control over our daily workflow.
                From uploading pages to publishing and distributing &mdash; everything in one place.&rdquo;
              </p>
              <div className="auth-testimonial-author">
                <div className="auth-testimonial-avatar">NE</div>
                <div>
                  <div className="auth-testimonial-name">NewEra Editorial Team</div>
                  <div className="auth-testimonial-role">Windhoek, Namibia</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
