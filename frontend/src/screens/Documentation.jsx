import React, { useState, useEffect, useRef } from 'react';
import './Documentation.css';

const NAV_SECTIONS = [
  { id: 'overview',       label: 'Overview',              icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4' },
  { id: 'architecture',   label: 'Architecture',          icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
  { id: 'setup',          label: 'Setup & Installation',  icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  { id: 'roles',          label: 'User Roles',            icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
  { id: 'upload',         label: 'Uploading Pages',       icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12' },
  { id: 'pipeline',       label: 'Publish Pipeline',      icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { id: 'ai',             label: 'AI Classification',     icon: 'M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082' },
  { id: 'epaper',         label: 'E-Paper Viewer',        icon: 'M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z' },
  { id: 'whatsapp',       label: 'WhatsApp Delivery',     icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { id: 'agent',          label: 'AI Agent',              icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
  { id: 'subscribers',    label: 'Subscribers',           icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { id: 'env',            label: 'Environment Variables', icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z' },
  { id: 'troubleshoot',   label: 'Troubleshooting',       icon: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
];

function NavIcon({ d }) {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function Badge({ color, children }) {
  const map = {
    green:  { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' },
    blue:   { bg: '#dbeafe', text: '#1d4ed8', border: '#bfdbfe' },
    purple: { bg: '#ede9fe', text: '#5b21b6', border: '#ddd6fe' },
    yellow: { bg: '#fef9c3', text: '#854d0e', border: '#fef08a' },
    pink:   { bg: '#fce7f3', text: '#9d174d', border: '#fbcfe8' },
    gray:   { bg: '#f3f4f6', text: '#374151', border: '#e5e7eb' },
    red:    { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' },
  };
  const s = map[color] || map.gray;
  return (
    <span className="doc-badge" style={{ background: s.bg, color: s.text, borderColor: s.border }}>
      {children}
    </span>
  );
}

function Section({ id, title, children }) {
  return (
    <section id={id} className="doc-section">
      <h2 className="doc-section-title">{title}</h2>
      <div className="doc-section-body">{children}</div>
    </section>
  );
}

function CodeBlock({ children, lang = 'bash' }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(children.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="doc-code-wrap">
      <div className="doc-code-header">
        <span className="doc-code-lang">{lang}</span>
        <button className="doc-copy-btn" onClick={copy} title="Copy">{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <pre className="doc-code"><code>{children.trim()}</code></pre>
    </div>
  );
}

function Step({ num, title, children }) {
  return (
    <div className="doc-step">
      <div className="doc-step-num">{num}</div>
      <div className="doc-step-body">
        <strong className="doc-step-title">{title}</strong>
        {children}
      </div>
    </div>
  );
}

function InfoBox({ type = 'info', children }) {
  const cfg = {
    info:    { cls: 'doc-info--info',    label: 'Note' },
    warn:    { cls: 'doc-info--warn',    label: 'Warning' },
    success: { cls: 'doc-info--success', label: 'Tip' },
    danger:  { cls: 'doc-info--danger',  label: 'Caution' },
  };
  const c = cfg[type];
  return (
    <div className={`doc-info ${c.cls}`}>
      <span className="doc-info-label">{c.label}</span>
      <span className="doc-info-text">{children}</span>
    </div>
  );
}

function Table({ headers, rows }) {
  return (
    <div className="doc-table-wrap">
      <table className="doc-table">
        <thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i}>{row.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function FlowStep({ num, label, color, last }) {
  return (
    <div className="doc-flow-item">
      <div className="doc-flow-line-col">
        <div className="doc-flow-dot" style={{ background: color }} />
        {!last && <div className="doc-flow-connector" />}
      </div>
      <div className="doc-flow-content">
        <span className="doc-flow-num">{num}</span>
        <span className="doc-flow-text">{label}</span>
      </div>
    </div>
  );
}

export default function Documentation() {
  const [activeSection, setActiveSection] = useState('overview');
  const sectionRefs = useRef({});

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0.1 }
    );
    NAV_SECTIONS.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) {
        sectionRefs.current[s.id] = el;
        observer.observe(el);
      }
    });
    return () => observer.disconnect();
  }, []);

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="doc-root">
      {/* ─── Sidebar Navigation ─────────────────────────── */}
      <nav className="doc-nav">
        <div className="doc-nav-header">
          <div className="doc-nav-logo-mark">NE</div>
          <div>
            <div className="doc-nav-title">NewEra Docs</div>
            <div className="doc-nav-subtitle">System Documentation</div>
          </div>
        </div>
        <div className="doc-nav-divider" />
        <ul className="doc-nav-list">
          {NAV_SECTIONS.map(s => (
            <li key={s.id}>
              <button
                className={`doc-nav-btn ${activeSection === s.id ? 'doc-nav-btn--active' : ''}`}
                onClick={() => scrollTo(s.id)}
              >
                <NavIcon d={s.icon} />
                <span>{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="doc-nav-footer">
          <span>v1.0</span>
          <span className="doc-nav-footer-sep" />
          <span>New Era Newspaper</span>
        </div>
      </nav>

      {/* ─── Main Content ───────────────────────────────── */}
      <main className="doc-main">
        {/* Hero */}
        <header className="doc-hero">
          <div className="doc-hero-badges">
            <Badge color="green">v1.0</Badge>
            <Badge color="blue">Production</Badge>
          </div>
          <h1 className="doc-hero-title">NewEra Editorial<br/>Automation System</h1>
          <p className="doc-hero-sub">
            Complete documentation for the AI-powered newspaper production, distribution,
            and subscriber management platform built for New Era Newspaper, Namibia.
          </p>
          <div className="doc-hero-links">
            <button className="doc-hero-btn doc-hero-btn--primary" onClick={() => scrollTo('setup')}>Get Started</button>
            <button className="doc-hero-btn doc-hero-btn--secondary" onClick={() => scrollTo('architecture')}>Architecture</button>
          </div>
        </header>

        {/* ── OVERVIEW ──────────────────────────────────── */}
        <Section id="overview" title="Overview">
          <p>
            The <strong>NewEra Editorial Automation System</strong> is a full-stack web platform that automates
            the end-to-end production workflow of New Era Newspaper &mdash; from page uploads by designers to
            AI-powered section classification, PDF merging, subscriber distribution via WhatsApp, and
            digital e-paper publishing.
          </p>
          <h3>Core features</h3>
          <Table
            headers={['Feature', 'Description']}
            rows={[
              ['PDF Upload Portal', 'Designers upload individual newspaper pages (PDF). Files are stored in Supabase and auto-classified by section.'],
              ['AI Section Detection', 'Pages are automatically assigned to News, Business, Sport, Vibez!, or AgriToday using header detection and AI fallback.'],
              ['Publish Pipeline', 'Merges all pages into a full newspaper, splits by section, deduplicates, and publishes to the E-Paper viewer.'],
              ['E-Paper Viewer', 'Subscribers and admins browse published editions with thumbnails and downloadable PDFs.'],
              ['WhatsApp Delivery', 'Automatically sends OTP-protected section PDFs to subscribers via free WhatsApp Web integration.'],
              ['AI Agent', 'Conversational AI assistant powered by Ollama (local) with OpenRouter / Gemini fallback for editorial queries.'],
              ['Subscriber Management', 'Add/remove subscribers, set per-subscriber section preferences, manage payments and subscriptions.'],
              ['Archive', 'Past editions are archived automatically for historical reference.'],
            ]}
          />
          <h3>Technology stack</h3>
          <Table
            headers={['Layer', 'Technology', 'Purpose']}
            rows={[
              ['Frontend', 'React 19, React Router 7, Axios', 'Web UI'],
              ['Backend', 'FastAPI (Python), Uvicorn', 'REST API, PDF processing, AI orchestration'],
              ['Database', 'Supabase (PostgreSQL)', 'Pages, editions, subscribers, auth'],
              ['Storage', 'Supabase Storage', 'PDF files (uploads + outputs buckets)'],
              ['Auth', 'Supabase Auth + Row-Level Security', 'Admin and Designer role separation'],
              ['PDF Processing', 'pdf2image, pypdf, Pillow', 'Convert, merge, split, encrypt PDFs'],
              ['AI Text', 'DeepSeek via OpenRouter (free)', 'Classify digital PDF pages by content'],
              ['AI Vision', 'Qwen VL 72B via OpenRouter (free)', 'Classify scanned/image pages'],
              ['AI Fallback', 'Google Gemini 2.0 Flash', 'Ultimate fallback for analysis'],
              ['AI Agent', 'Ollama llama3.2:1b (local, free)', 'Editorial assistant chat'],
              ['WhatsApp', 'whatsapp-web.js (free, local)', 'Send PDFs via WhatsApp Web'],
            ]}
          />
        </Section>

        {/* ── ARCHITECTURE ──────────────────────────────── */}
        <Section id="architecture" title="Architecture">
          <p>The system is a <strong>monorepo</strong> with three services that run concurrently:</p>
          <CodeBlock lang="text">{`
newera-system/
  frontend/          React app       localhost:3001
  backend/           FastAPI          localhost:8001
  whatsapp-agent/    Node.js          localhost:5000
          `}</CodeBlock>

          <h3>Data flow</h3>
          <div className="doc-flow">
            {[
              { label: 'Designer uploads PDF page',                                      color: '#3b82f6' },
              { label: 'File stored in Supabase Storage (uploads bucket)',                color: '#8b5cf6' },
              { label: '"Select X" header detected \u2192 section locked instantly',      color: '#22c55e' },
              { label: 'Admin runs Publish Pipeline',                                    color: '#eab308' },
              { label: 'Pages merged \u2192 full PDF, then split by section',             color: '#ec4899' },
              { label: 'Section PDFs uploaded to outputs bucket',                        color: '#3b82f6' },
              { label: 'WhatsApp agent sends OTP-protected PDFs to subscribers',         color: '#22c55e' },
            ].map((step, i, arr) => (
              <FlowStep key={i} num={i + 1} label={step.label} color={step.color} last={i === arr.length - 1} />
            ))}
          </div>

          <h3>Database tables</h3>
          <Table
            headers={['Table', 'Purpose', 'Key columns']}
            rows={[
              ['editions', 'One row per publication date', 'date, status, expected_pages, deadline, storage_paths'],
              ['pages', 'Individual uploaded PDF pages', 'edition_date, filename, storage_path, section, page_number, uploaded_by'],
              ['admins', 'Admin user registry', 'email, name, created_at'],
              ['designers', 'Designer user registry', 'email, name, created_at'],
              ['sections', 'Available newspaper sections', 'name, slug, color'],
              ['customers', 'Subscriber profiles', 'name, email, phone, status'],
              ['subscriptions', 'Active subscriptions', 'customer_id, section_key, start_date, end_date'],
              ['payments', 'Payment history', 'customer_id, amount, date, method'],
              ['periods', 'Subscription period definitions', 'name, duration_days, price'],
            ]}
          />
        </Section>

        {/* ── SETUP ─────────────────────────────────────── */}
        <Section id="setup" title="Setup & Installation">
          <InfoBox type="info">
            Prerequisites: <strong>Node.js 18+</strong>, <strong>Python 3.11+</strong>,
            <strong> Poppler</strong> (for PDF conversion), and a <strong>Supabase</strong> project.
          </InfoBox>
          <h3>1. Clone and install dependencies</h3>
          <CodeBlock>{`
git clone https://github.com/gotlieb-mupandela/ai-hackathon.git
cd ai-hackathon/newera-system

cd backend && pip install -r requirements.txt && cd ..
cd frontend && npm install && cd ..
cd whatsapp-agent && npm install && cd ..
          `}</CodeBlock>
          <h3>2. Install Poppler (required for PDF processing)</h3>
          <Table
            headers={['OS', 'Command']}
            rows={[
              ['Windows', 'Download from github.com/oschwartz10612/poppler-windows/releases, extract, add bin/ to PATH'],
              ['macOS', 'brew install poppler'],
              ['Ubuntu / Debian', 'sudo apt install poppler-utils'],
            ]}
          />
          <h3>3. Configure environment variables</h3>
          <p>Create <code>backend/.env</code>:</p>
          <CodeBlock lang="env">{`
GEMINI_API_KEY=your_gemini_api_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_JWT_SECRET=your_jwt_secret
OPENROUTER_API_KEY=your_openrouter_key
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free
OPENROUTER_VISION_MODEL=qwen/qwen2.5-vl-72b-instruct:free
DEEPSEEK_MODEL=deepseek/deepseek-chat-v3-0324:free
OLLAMA_MODEL=llama3.2:1b
          `}</CodeBlock>
          <p>Create <code>frontend/.env</code>:</p>
          <CodeBlock lang="env">{`
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your_anon_key
PORT=3001
          `}</CodeBlock>
          <h3>4. Set up Supabase database</h3>
          <p>Run SQL files in Supabase SQL Editor in this order:</p>
          <CodeBlock lang="sql">{`
-- 1. Main schema
backend/supabase_schema.sql
-- 2. Pages table + RLS
backend/create_pages_and_rls.sql
-- 3. Editions RLS policies
backend/fix_editions_rls.sql
-- 4. Storage bucket policies
backend/fix_storage_rls.sql
-- 5. Allow designer uploads
backend/allow_anon_upload.sql
          `}</CodeBlock>
          <h3>5. Start all three services</h3>
          <CodeBlock>{`
# Terminal 1 - Backend API
cd backend
uvicorn main:app --host 127.0.0.1 --port 8001 --reload

# Terminal 2 - Frontend
cd frontend
npm start

# Terminal 3 - WhatsApp agent (optional)
cd whatsapp-agent
node server.js
          `}</CodeBlock>
          <h3>6. Install Ollama for the AI Agent (optional)</h3>
          <CodeBlock>{`
# Download from https://ollama.ai, then:
ollama pull llama3.2:1b
          `}</CodeBlock>
        </Section>

        {/* ── USER ROLES ────────────────────────────────── */}
        <Section id="roles" title="User Roles">
          <p>The system uses <strong>Supabase Row-Level Security</strong> to enforce two distinct roles:</p>
          <Table
            headers={['Role', 'Access', 'Capabilities']}
            rows={[
              ['Admin', 'Full system access', 'Upload pages, run pipeline, manage subscribers, create designers, view all editions, manage payments'],
              ['Designer', 'Restricted access', 'Upload their own pages, view their own uploads, check deadline and settings'],
            ]}
          />
          <InfoBox type="info">
            Admins create Designer accounts from the <strong>Designers</strong> screen. Designers log in at
            the same URL with their assigned email and password.
          </InfoBox>
          <h3>Creating a Designer account</h3>
          <Step num={1} title="Go to Designers screen"><p>Navigate to <strong>Designers</strong> in the sidebar.</p></Step>
          <Step num={2} title="Fill in the form"><p>Enter the designer name, email, and a temporary password.</p></Step>
          <Step num={3} title="Share credentials"><p>Share the login URL and credentials. No email confirmation is required.</p></Step>
        </Section>

        {/* ── UPLOAD ────────────────────────────────────── */}
        <Section id="upload" title="Uploading Pages">
          <p>
            Designers upload individual newspaper pages as PDF files. The system auto-classifies
            each page into the correct section using a strict priority chain.
          </p>
          <h3>How to upload</h3>
          <Step num={1} title="Navigate to Upload"><p>Click <strong>Upload</strong> in the sidebar.</p></Step>
          <Step num={2} title="Drag and drop or browse"><p>Drag PDF files onto the drop zone or click to browse. Multiple files supported.</p></Step>
          <Step num={3} title="Auto-classification runs">
            <p>Section is detected in this priority order:</p>
            <ol style={{ margin: '8px 0 0 20px', lineHeight: 2 }}>
              <li><strong>Filename check</strong> &mdash; if filename contains "Select News", "Select Business", etc.</li>
              <li><strong>"Select X" header in PDF text</strong> &mdash; the authoritative signal. No AI call needed.</li>
              <li><strong>Keyword scan</strong> &mdash; general keywords like "tenders", "football", "harvest".</li>
            </ol>
          </Step>
          <Step num={4} title="Manual correction"><p>Click any section badge to open a dropdown and reassign the section.</p></Step>
          <h3>Section naming convention</h3>
          <Table
            headers={['Section', 'Header on page', 'Badge']}
            rows={[
              ['News', 'Select News', <Badge color="purple">News</Badge>],
              ['Business', 'Select Business', <Badge color="green">Business</Badge>],
              ['Sport', 'Select Sport', <Badge color="blue">Sport</Badge>],
              ['Vibez!', 'Select Vibez', <Badge color="pink">Vibez!</Badge>],
              ['AgriToday', 'Select AgriToday', <Badge color="yellow">AgriToday</Badge>],
            ]}
          />
          <h3>Deduplication</h3>
          <p>
            Files with the same name uploaded on the same day are automatically skipped.
            The pipeline also deduplicates by page number before merging.
          </p>
        </Section>

        {/* ── PIPELINE ──────────────────────────────────── */}
        <Section id="pipeline" title="Publish Pipeline">
          <p>The pipeline takes all uploaded pages, processes them, and publishes the final PDFs.</p>
          <h3>Pipeline steps</h3>
          {[
            { n: 1, t: 'Deduplicate', d: 'Removes duplicate pages by filename and page number.' },
            { n: 2, t: 'Download pages', d: 'Downloads all unique PDFs from Supabase Storage.' },
            { n: 3, t: 'Sort by page number', d: 'Orders pages numerically (from filename or embedded text).' },
            { n: 4, t: 'Merge full newspaper', d: 'Combines all pages into a single full_paper.pdf.' },
            { n: 5, t: 'AI section analysis', d: 'Each page is classified using Select-header detection, DeepSeek text, Qwen VL vision, or Gemini fallback.' },
            { n: 6, t: 'Split by section', d: 'Creates separate PDFs: news.pdf, business.pdf, sport.pdf, vibez.pdf, agritoday.pdf.' },
            { n: 7, t: 'Upload to outputs', d: 'All PDFs are uploaded to Supabase Storage under outputs/YYYY-MM-DD/.' },
            { n: 8, t: 'Publish edition', d: 'Edition record is updated to "published" status in the database.' },
            { n: 9, t: 'WhatsApp notification', d: 'OTP-protected PDFs are sent to all subscribers in the background.' },
          ].map(s => <Step key={s.n} num={s.n} title={s.t}><p>{s.d}</p></Step>)}
          <InfoBox type="success">
            The pipeline can be triggered manually from the Pipeline screen, or it auto-runs at the configured publication deadline.
          </InfoBox>
        </Section>

        {/* ── AI CLASSIFICATION ─────────────────────────── */}
        <Section id="ai" title="AI Classification">
          <p>Section classification uses a <strong>multi-layer decision tree</strong>. Faster, more reliable methods fire first.</p>
          <h3>Decision tree</h3>
          <Table
            headers={['Priority', 'Method', 'How it works', 'Speed']}
            rows={[
              ['1 (highest)', '"Select X" header', 'Scans embedded PDF text for "Select News", "Select Business", etc. Returns immediately.', '< 5 ms'],
              ['2', 'Filename keyword', 'Checks if filename contains a section name.', '< 1 ms'],
              ['3', 'DeepSeek text AI', 'Sends page text to DeepSeek via OpenRouter. Highly accurate for digital PDFs.', '2 - 5 s'],
              ['4', 'Qwen VL 72B vision', 'Converts page to image, sends to vision model. For scanned/printed pages.', '5 - 10 s'],
              ['5 (fallback)', 'Google Gemini', 'Ultimate fallback using Gemini 2.0 Flash if all other methods fail.', '3 - 8 s'],
            ]}
          />
          <InfoBox type="warn">
            The "Select X" header is authoritative &mdash; it <strong>cannot be overridden</strong> by
            any AI model. A page with "Select Business" at the top is always classified as Business.
          </InfoBox>
          <h3>AI models</h3>
          <Table
            headers={['Model', 'Provider', 'Cost', 'Used for']}
            rows={[
              ['deepseek-chat-v3-0324', 'OpenRouter', 'Free', 'Text classification of digital PDFs'],
              ['qwen2.5-vl-72b-instruct', 'OpenRouter', 'Free', 'Vision classification of scanned PDFs'],
              ['gemini-2.0-flash-lite / flash', 'Google AI', 'Free tier', 'Fallback analysis'],
              ['llama3.2:1b', 'Ollama (local)', 'Free / offline', 'AI Agent chat'],
            ]}
          />
        </Section>

        {/* ── E-PAPER ───────────────────────────────────── */}
        <Section id="epaper" title="E-Paper Viewer">
          <p>Displays all published editions with thumbnails, section breakdowns, and downloadable PDFs.</p>
          <h3>Subscriber view</h3>
          <ul className="doc-list">
            <li>Edition cards sorted by date (newest first)</li>
            <li>Thumbnail of the first page</li>
            <li>Download buttons for each section PDF</li>
          </ul>
          <h3>Admin view</h3>
          <ul className="doc-list">
            <li>All of the above, plus a Delete PDF button on each card</li>
            <li>Remove a specific section PDF or full paper if a mistake was made</li>
            <li>Deleting full_paper reverts the edition to "draft" status</li>
          </ul>
          <h3>Storage structure</h3>
          <CodeBlock lang="text">{`
Supabase Storage: outputs/
  YYYY-MM-DD/
    full_paper.pdf
    news.pdf
    business.pdf
    sport.pdf
    vibez.pdf
    agritoday.pdf
          `}</CodeBlock>
        </Section>

        {/* ── WHATSAPP ──────────────────────────────────── */}
        <Section id="whatsapp" title="WhatsApp Delivery">
          <p>
            Uses a <strong>free local WhatsApp Web agent</strong> &mdash; no API keys,
            no monthly fees. Connects to your real WhatsApp by scanning a QR code once.
          </p>
          <h3>One-time setup</h3>
          <Step num={1} title="Start the agent"><CodeBlock>{`cd whatsapp-agent\nnode server.js`}</CodeBlock></Step>
          <Step num={2} title="Scan QR code"><p>Open WhatsApp on your phone, go to Linked Devices, and scan the QR code displayed in the terminal.</p></Step>
          <Step num={3} title="Session saved"><p>The session is saved locally. Future restarts reconnect automatically.</p></Step>
          <h3>Delivery process</h3>
          <ol className="doc-list">
            <li>After publish, the backend triggers the WhatsApp agent in the background (non-blocking).</li>
            <li>A unique 6-digit one-time PIN (OTP) is generated per subscriber.</li>
            <li>The OTP is sent as a plain text message first.</li>
            <li>Each subscribed section PDF is encrypted with the OTP and sent as a file.</li>
            <li>The subscriber enters the PIN to open the PDF.</li>
          </ol>
          <InfoBox type="info">
            PIN-protected PDFs prevent casual forwarding &mdash; anyone who receives the file needs the PIN.
          </InfoBox>
          <h3>Agent endpoints</h3>
          <Table
            headers={['Method', 'Endpoint', 'Description']}
            rows={[
              ['GET', 'localhost:5000/health', 'Returns status: "ready" when authenticated'],
              ['POST', 'localhost:5000/send', 'Triggers delivery. Body: {edition_date, supabase_url}'],
            ]}
          />
        </Section>

        {/* ── AI AGENT ──────────────────────────────────── */}
        <Section id="agent" title="AI Agent">
          <p>
            A conversational assistant accessible from the sidebar. It has live access to today{"\u2019"}s
            edition data and answers editorial operations questions.
          </p>
          <h3>Example queries</h3>
          <ul className="doc-list">
            <li>How many pages have been uploaded today?</li>
            <li>Which sections are ready for publishing?</li>
            <li>How many subscribers do we have?</li>
            <li>What is the current pipeline status?</li>
            <li>Summarise today{"\u2019"}s edition progress.</li>
          </ul>
          <h3>Model fallback chain</h3>
          <Table
            headers={['Priority', 'Model', 'Requires']}
            rows={[
              ['1', 'Ollama llama3.2:1b (local)', 'Ollama installed + model pulled'],
              ['2', 'OpenRouter llama-3.3-70b-instruct:free', 'OPENROUTER_API_KEY in .env'],
              ['3', 'Google Gemini 2.0 Flash Lite', 'GEMINI_API_KEY in .env'],
            ]}
          />
        </Section>

        {/* ── SUBSCRIBERS ───────────────────────────────── */}
        <Section id="subscribers" title="Subscriber Management">
          <p>Managed from the Subscribers panel (admin only). Each subscriber can choose which sections they receive.</p>
          <Table
            headers={['Action', 'How']}
            rows={[
              ['Add subscriber', 'Enter phone number with country code (e.g. +264812345678) and click Add'],
              ['Remove subscriber', 'Click the remove button next to any subscriber'],
              ['Set section preferences', 'Click a subscriber to edit which sections they receive'],
              ['Toggle auto-send', 'Controls whether WhatsApp messages are sent automatically on publish'],
            ]}
          />
          <h3>Data file</h3>
          <CodeBlock lang="json">{`
{
  "numbers": ["+264812345678"],
  "auto_send": true,
  "preferences": { "+264812345678": ["full_paper", "business"] },
  "passwords": { "+264812345678": "837261" }
}
          `}</CodeBlock>
        </Section>

        {/* ── ENV VARIABLES ─────────────────────────────── */}
        <Section id="env" title="Environment Variables">
          <h3>backend/.env</h3>
          <Table
            headers={['Variable', 'Status', 'Description']}
            rows={[
              ['GEMINI_API_KEY', <Badge color="red">Required</Badge>, 'Google Gemini API key (aistudio.google.com/apikey)'],
              ['SUPABASE_URL', <Badge color="red">Required</Badge>, 'Supabase project URL'],
              ['SUPABASE_SERVICE_ROLE_KEY', <Badge color="red">Required</Badge>, 'Service role key (bypasses RLS)'],
              ['SUPABASE_JWT_SECRET', <Badge color="red">Required</Badge>, 'JWT secret from Supabase project settings'],
              ['OPENROUTER_API_KEY', <Badge color="yellow">Recommended</Badge>, 'OpenRouter key for DeepSeek + Qwen VL (free tier)'],
              ['OPENROUTER_VISION_MODEL', <Badge color="gray">Optional</Badge>, 'Default: qwen/qwen2.5-vl-72b-instruct:free'],
              ['DEEPSEEK_MODEL', <Badge color="gray">Optional</Badge>, 'Default: deepseek/deepseek-chat-v3-0324:free'],
              ['OPENROUTER_MODEL', <Badge color="gray">Optional</Badge>, 'Default: meta-llama/llama-3.3-70b-instruct:free'],
              ['OLLAMA_MODEL', <Badge color="gray">Optional</Badge>, 'Default: llama3.2:1b'],
            ]}
          />
          <h3>frontend/.env</h3>
          <Table
            headers={['Variable', 'Status', 'Description']}
            rows={[
              ['REACT_APP_SUPABASE_URL', <Badge color="red">Required</Badge>, 'Same as backend SUPABASE_URL'],
              ['REACT_APP_SUPABASE_ANON_KEY', <Badge color="red">Required</Badge>, 'Supabase anon key (safe for frontend)'],
              ['PORT', <Badge color="gray">Optional</Badge>, 'Dev server port (default 3000, set to 3001)'],
            ]}
          />
        </Section>

        {/* ── TROUBLESHOOTING ───────────────────────────── */}
        <Section id="troubleshoot" title="Troubleshooting">
          <Table
            headers={['Problem', 'Cause', 'Fix']}
            rows={[
              ['AI reading failed / 403', 'Gemini API key invalid or quota exhausted', 'Generate a new key at aistudio.google.com/apikey'],
              ['OpenRouter 401', 'API key expired or invalid', 'Generate a new key at openrouter.ai'],
              ['Wrong section assigned', 'AI guessed instead of reading the header', 'Ensure the page has "Select Business" (or equivalent) printed at the top'],
              ['WhatsApp agent not reachable', 'Agent not started or QR not scanned', 'Run: cd whatsapp-agent && node server.js, then scan QR'],
              ['Poppler not found', 'pdf2image cannot locate Poppler', 'Install Poppler and add bin/ to system PATH'],
              ['Port 8000 in use', 'Another app occupies the port', 'Backend uses port 8001. Check api.js points to 8001.'],
              ['Supabase lock warning', 'React Strict Mode double init', 'Safe to ignore. Already mitigated with singleton pattern.'],
              ['Pages show Unclassified', 'No header found and AI unavailable', 'Click the section badge to manually assign from dropdown.'],
              ['Designer cannot see uploads', 'RLS email mismatch', 'Ensure email in designers table matches auth email exactly.'],
            ]}
          />
        </Section>

        <footer className="doc-footer">
          <div className="doc-footer-line" />
          <p className="doc-footer-text">NewEra Editorial Automation System</p>
          <p className="doc-footer-sub">Built for New Era Newspaper, Windhoek, Namibia &middot; 2026</p>
        </footer>
      </main>
    </div>
  );
}
