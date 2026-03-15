import React, { useState } from 'react';
import './Documentation.css';

const SECTIONS = [
  { id: 'overview',       label: 'Overview' },
  { id: 'architecture',   label: 'Architecture' },
  { id: 'setup',          label: 'Setup & Installation' },
  { id: 'roles',          label: 'User Roles' },
  { id: 'upload',         label: 'Uploading Pages' },
  { id: 'pipeline',       label: 'Publish Pipeline' },
  { id: 'ai',             label: 'AI Classification' },
  { id: 'epaper',         label: 'E-Paper Viewer' },
  { id: 'whatsapp',       label: 'WhatsApp Delivery' },
  { id: 'agent',          label: 'AI Agent' },
  { id: 'subscribers',    label: 'Subscribers' },
  { id: 'env',            label: 'Environment Variables' },
  { id: 'troubleshoot',   label: 'Troubleshooting' },
];

function Badge({ color, children }) {
  const colors = {
    green:  { bg: '#dcfce7', text: '#166534' },
    blue:   { bg: '#dbeafe', text: '#1d4ed8' },
    purple: { bg: '#ede9fe', text: '#5b21b6' },
    yellow: { bg: '#fef9c3', text: '#854d0e' },
    pink:   { bg: '#fce7f3', text: '#9d174d' },
    gray:   { bg: '#f3f4f6', text: '#374151' },
    red:    { bg: '#fee2e2', text: '#991b1b' },
  };
  const s = colors[color] || colors.gray;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: '12px',
      fontSize: '12px', fontWeight: 700, background: s.bg, color: s.text,
      marginRight: '6px',
    }}>
      {children}
    </span>
  );
}

function Section({ id, title, children }) {
  return (
    <section id={id} className="doc-section">
      <h2 className="doc-section-title">{title}</h2>
      {children}
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
      <button className="doc-copy-btn" onClick={copy} title="Copy">
        {copied ? '✓ Copied' : 'Copy'}
      </button>
      <pre className="doc-code"><code className={`lang-${lang}`}>{children.trim()}</code></pre>
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
  const map = {
    info:    { icon: 'ℹ', bg: '#eff6ff', border: '#3b82f6', color: '#1d4ed8' },
    warn:    { icon: '⚠', bg: '#fffbeb', border: '#f59e0b', color: '#92400e' },
    success: { icon: '✓', bg: '#f0fdf4', border: '#22c55e', color: '#166534' },
    danger:  { icon: '✕', bg: '#fef2f2', border: '#ef4444', color: '#991b1b' },
  };
  const s = map[type];
  return (
    <div style={{
      background: s.bg, border: `1px solid ${s.border}`, borderLeft: `4px solid ${s.border}`,
      borderRadius: '8px', padding: '12px 16px', margin: '14px 0',
      display: 'flex', gap: '10px', alignItems: 'flex-start',
    }}>
      <span style={{ color: s.color, fontWeight: 700, fontSize: '16px', marginTop: '1px' }}>{s.icon}</span>
      <span style={{ color: '#374151', fontSize: '14px', lineHeight: 1.6 }}>{children}</span>
    </div>
  );
}

function Table({ headers, rows }) {
  return (
    <div className="doc-table-wrap">
      <table className="doc-table">
        <thead>
          <tr>{headers.map(h => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Documentation() {
  const [activeSection, setActiveSection] = useState('overview');

  const scrollTo = (id) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="doc-root">
      {/* Sidebar nav */}
      <nav className="doc-nav">
        <div className="doc-nav-header">
          <div className="doc-nav-logo">
            <span className="doc-nav-logo-icon">📰</span>
            <div>
              <div className="doc-nav-logo-title">NewEra Docs</div>
              <div className="doc-nav-logo-sub">Editorial Automation System</div>
            </div>
          </div>
        </div>
        <ul className="doc-nav-list">
          {SECTIONS.map(s => (
            <li key={s.id}>
              <button
                className={`doc-nav-item ${activeSection === s.id ? 'active' : ''}`}
                onClick={() => scrollTo(s.id)}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
        <div className="doc-nav-footer">
          <span>v1.0 · New Era Newspaper</span>
        </div>
      </nav>

      {/* Main content */}
      <main className="doc-main">
        <div className="doc-hero">
          <Badge color="green">v1.0</Badge>
          <Badge color="blue">Production Ready</Badge>
          <h1 className="doc-hero-title">NewEra Editorial Automation System</h1>
          <p className="doc-hero-sub">
            Complete documentation for the AI-powered newspaper production, distribution,
            and subscriber management platform built for New Era Newspaper, Namibia.
          </p>
        </div>

        {/* ── OVERVIEW ─────────────────────────────────────────── */}
        <Section id="overview" title="Overview">
          <p>
            The <strong>NewEra Editorial Automation System</strong> is a full-stack web platform that automates
            the end-to-end production workflow of New Era Newspaper — from page uploads by designers to
            AI-powered section classification, PDF merging, subscriber distribution via WhatsApp, and
            digital e-paper publishing.
          </p>

          <h3>What the system does</h3>
          <Table
            headers={['Feature', 'Description']}
            rows={[
              ['PDF Upload Portal', 'Designers upload individual newspaper pages (PDF). Files are stored in Supabase and auto-classified by section.'],
              ['AI Section Detection', 'Pages are automatically assigned to News, Business, Sport, Vibez!, or AgriToday using "Select X" header detection and AI fallback.'],
              ['Publish Pipeline', 'Merges all pages into a full newspaper, splits by section, deduplicates, and publishes to the E-Paper viewer.'],
              ['E-Paper Viewer', 'Subscribers and admins browse published editions with thumbnails and downloadable PDFs.'],
              ['WhatsApp Delivery', 'Automatically sends OTP-protected section PDFs to subscribers via free WhatsApp Web integration.'],
              ['AI Agent', 'Conversational AI assistant powered by Ollama (local) with OpenRouter/Gemini fallback for editorial operations queries.'],
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
              ['Storage', 'Supabase Storage', 'PDF files (uploads bucket + outputs bucket)'],
              ['Auth', 'Supabase Auth + Row-Level Security', 'Admin and Designer role separation'],
              ['PDF Processing', 'pdf2image, pypdf, Pillow', 'Convert, merge, split, encrypt PDFs'],
              ['AI — Text', 'DeepSeek via OpenRouter (free)', 'Classify digital PDF pages by text content'],
              ['AI — Vision', 'Qwen VL 72B via OpenRouter (free)', 'Classify scanned/image PDF pages'],
              ['AI — Fallback', 'Google Gemini 2.0 Flash', 'Ultimate fallback for page analysis'],
              ['AI Agent', 'Ollama llama3.2:1b (local, free)', 'Editorial assistant chat'],
              ['WhatsApp', 'whatsapp-web.js (free, local)', 'Send PDFs to subscribers via WhatsApp Web'],
            ]}
          />
        </Section>

        {/* ── ARCHITECTURE ─────────────────────────────────────── */}
        <Section id="architecture" title="Architecture">
          <p>The system is a <strong>monorepo</strong> with three services that run concurrently:</p>

          <CodeBlock lang="text">{`
newera-system/
├── frontend/          React app  →  http://localhost:3001
├── backend/           FastAPI    →  http://localhost:8001
└── whatsapp-agent/    Node.js    →  http://localhost:5000
          `}</CodeBlock>

          <h3>Data flow</h3>
          <div className="doc-flow">
            {[
              { icon: '📁', label: 'Designer uploads PDF page', color: '#dbeafe' },
              { icon: '☁', label: 'File stored in Supabase Storage (uploads bucket)', color: '#ede9fe' },
              { icon: '🤖', label: '"Select X" header detected → section locked instantly', color: '#dcfce7' },
              { icon: '📰', label: 'Admin runs Publish Pipeline', color: '#fef9c3' },
              { icon: '🔀', label: 'Pages merged → full PDF, then split by section', color: '#fce7f3' },
              { icon: '📤', label: 'Section PDFs uploaded to outputs bucket', color: '#dbeafe' },
              { icon: '📲', label: 'WhatsApp agent sends OTP-protected PDFs to subscribers', color: '#dcfce7' },
            ].map((step, i) => (
              <div key={i} className="doc-flow-step" style={{ background: step.color }}>
                <span className="doc-flow-icon">{step.icon}</span>
                <span className="doc-flow-label">{step.label}</span>
                {i < 6 && <span className="doc-flow-arrow">↓</span>}
              </div>
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

        {/* ── SETUP ────────────────────────────────────────────── */}
        <Section id="setup" title="Setup & Installation">
          <InfoBox type="info">
            Prerequisites: <strong>Node.js 18+</strong>, <strong>Python 3.11+</strong>,
            <strong> Poppler</strong> (for PDF conversion), and a <strong>Supabase</strong> project.
          </InfoBox>

          <h3>1. Clone and install dependencies</h3>
          <CodeBlock>{`
# Clone the repository
git clone https://github.com/gotlieb-mupandela/ai-hackathon.git
cd ai-hackathon/newera-system

# Install backend Python dependencies
cd backend
pip install -r requirements.txt
cd ..

# Install frontend dependencies
cd frontend
npm install
cd ..

# Install WhatsApp agent dependencies
cd whatsapp-agent
npm install
cd ..
          `}</CodeBlock>

          <h3>2. Install Poppler (required for PDF processing)</h3>
          <Table
            headers={['OS', 'Command']}
            rows={[
              ['Windows', 'Download from https://github.com/oschwartz10612/poppler-windows/releases → extract → add bin/ to PATH'],
              ['macOS', 'brew install poppler'],
              ['Ubuntu / Debian', 'sudo apt install poppler-utils'],
            ]}
          />

          <h3>3. Configure environment variables</h3>
          <p>Create <code>backend/.env</code> with the following values:</p>
          <CodeBlock lang="env">{`
# Google Gemini — get free key at https://aistudio.google.com/apikey
GEMINI_API_KEY=your_gemini_api_key

# Supabase — from your project Settings → API
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_JWT_SECRET=your_jwt_secret

# OpenRouter — free tier at https://openrouter.ai
OPENROUTER_API_KEY=your_openrouter_key
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free
OPENROUTER_VISION_MODEL=qwen/qwen2.5-vl-72b-instruct:free
DEEPSEEK_MODEL=deepseek/deepseek-chat-v3-0324:free

# Ollama local model (install via https://ollama.ai)
OLLAMA_MODEL=llama3.2:1b
          `}</CodeBlock>

          <p>Create <code>frontend/.env</code>:</p>
          <CodeBlock lang="env">{`
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your_anon_key
PORT=3001
          `}</CodeBlock>

          <h3>4. Set up Supabase database</h3>
          <p>Run the SQL files in your Supabase SQL editor in this order:</p>
          <CodeBlock lang="sql">{`
-- Run each file in Supabase SQL Editor (Settings → SQL Editor)
backend/supabase_schema.sql          -- Main schema
backend/create_pages_and_rls.sql     -- Pages table + RLS
backend/fix_editions_rls.sql         -- Editions RLS policies
backend/fix_storage_rls.sql          -- Storage bucket policies
backend/allow_anon_upload.sql        -- Allow designer uploads
          `}</CodeBlock>

          <h3>5. Start all three services</h3>
          <CodeBlock>{`
# Terminal 1 — Backend API
cd backend
uvicorn main:app --host 127.0.0.1 --port 8001 --reload

# Terminal 2 — Frontend
cd frontend
npm start        # Opens http://localhost:3001

# Terminal 3 — WhatsApp agent (optional, for auto-sending)
cd whatsapp-agent
node server.js   # Displays QR code to scan once
          `}</CodeBlock>

          <h3>6. Install Ollama for the AI Agent (optional)</h3>
          <CodeBlock>{`
# Download Ollama from https://ollama.ai
# Then pull the lightweight model
ollama pull llama3.2:1b
          `}</CodeBlock>
        </Section>

        {/* ── USER ROLES ───────────────────────────────────────── */}
        <Section id="roles" title="User Roles">
          <p>The system uses <strong>Supabase Row-Level Security</strong> to enforce two distinct roles:</p>

          <Table
            headers={['Role', 'Access', 'Can do']}
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
          <Step num={1} title="Go to Designers screen">
            <p>Navigate to <strong>Designers</strong> in the sidebar.</p>
          </Step>
          <Step num={2} title="Fill in the form">
            <p>Enter the designer's name, email, and a temporary password.</p>
          </Step>
          <Step num={3} title="Share credentials">
            <p>Share the login URL (<code>localhost:3001</code> or your deployed URL) and credentials. No email confirmation is required.</p>
          </Step>
        </Section>

        {/* ── UPLOAD ───────────────────────────────────────────── */}
        <Section id="upload" title="Uploading Pages">
          <p>
            Designers upload individual newspaper pages as PDF files. The system auto-classifies
            each page into the correct section.
          </p>

          <h3>How to upload</h3>
          <Step num={1} title="Navigate to Upload">
            <p>Click <strong>Upload</strong> in the sidebar.</p>
          </Step>
          <Step num={2} title="Drag and drop or browse">
            <p>Drag PDF files onto the drop zone or click to browse. Multiple files can be uploaded at once.</p>
          </Step>
          <Step num={3} title="Auto-classification runs">
            <p>The system detects the section automatically in this priority order:</p>
            <ol style={{ margin: '8px 0 0 20px', lineHeight: 2 }}>
              <li><strong>Filename check</strong> — if the filename contains "Select News", "Select Business", etc., that section is used immediately.</li>
              <li><strong>"Select X" header in PDF text</strong> — the most reliable signal. If the PDF text contains a "Select Business" header, it is classified as Business without any AI call.</li>
              <li><strong>Keyword scan</strong> — general keywords (e.g. "tenders", "football", "harvest") are matched.</li>
            </ol>
          </Step>
          <Step num={4} title="Correct if needed">
            <p>If a section badge is wrong, click it to open a dropdown and select the correct section manually.</p>
          </Step>

          <h3>Section naming convention</h3>
          <Table
            headers={['Section', 'Header on page', 'Badge colour']}
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
            If a file with the same name is uploaded more than once on the same day, it is automatically
            skipped with a toast notification. The pipeline also deduplicates by page number before merging.
          </p>

          <h3>Admin settings</h3>
          <p>
            Admins can set a <strong>Publication Deadline</strong> — the time at which the pipeline
            auto-triggers even if not all pages are ready.
          </p>
        </Section>

        {/* ── PIPELINE ─────────────────────────────────────────── */}
        <Section id="pipeline" title="Publish Pipeline">
          <p>
            The pipeline is the core automation step. It takes all uploaded pages for today's edition,
            processes them, and publishes the final PDFs.
          </p>

          <h3>Pipeline steps</h3>
          {[
            { n: 1, title: 'Deduplicate', desc: 'Removes duplicate pages by filename and page number. Keeps only unique pages.' },
            { n: 2, title: 'Download pages', desc: 'Downloads all unique PDFs from Supabase Storage.' },
            { n: 3, title: 'Sort by page number', desc: 'Orders pages numerically (extracted from filename or embedded text).' },
            { n: 4, title: 'Merge full newspaper', desc: 'Combines all pages into a single full_paper.pdf.' },
            { n: 5, title: 'AI section analysis', desc: 'Each page is classified by section using "Select X" header detection → DeepSeek text → Qwen VL vision → Gemini fallback.' },
            { n: 6, title: 'Split by section', desc: 'Creates separate PDFs: news.pdf, business.pdf, sport.pdf, vibez.pdf, agritoday.pdf.' },
            { n: 7, title: 'Upload to outputs bucket', desc: 'All PDFs are uploaded to Supabase Storage under the outputs/YYYY-MM-DD/ path.' },
            { n: 8, title: 'Publish edition', desc: 'Edition record is updated to "published" status in the database.' },
            { n: 9, title: 'WhatsApp notification', desc: 'OTP-protected PDFs are sent to all subscribers in the background.' },
          ].map(s => (
            <Step key={s.n} num={s.n} title={s.title}>
              <p>{s.desc}</p>
            </Step>
          ))}

          <InfoBox type="success">
            The pipeline can be triggered manually at any time from the <strong>Pipeline</strong> screen,
            or it auto-runs at the configured publication deadline.
          </InfoBox>
        </Section>

        {/* ── AI CLASSIFICATION ────────────────────────────────── */}
        <Section id="ai" title="AI Classification">
          <p>
            Section classification uses a <strong>4-layer decision tree</strong>. Each layer is tried
            in order — faster and more reliable methods first.
          </p>

          <h3>Classification decision tree</h3>
          <Table
            headers={['Priority', 'Method', 'How it works', 'Speed']}
            rows={[
              ['1 (highest)', '"Select X" header', 'Reads embedded PDF text, looks for exact phrases: "Select News", "Select Business", "Select Sport", "Select Vibez", "Select AgriToday". Returns immediately — AI never called.', '< 5 ms'],
              ['2', 'Filename keyword', 'Checks if filename contains a section name (e.g. "Select Business p3.pdf" → Business).', '< 1 ms'],
              ['3', 'DeepSeek text AI', 'Sends full page text to DeepSeek (free via OpenRouter). Highly accurate for digital PDFs.', '2–5 s'],
              ['4', 'Qwen VL 72B vision', 'Converts page to image, sends to Qwen VL 72B vision model. Used for scanned/printed pages.', '5–10 s'],
              ['5 (fallback)', 'Google Gemini', 'Ultimate fallback using Gemini 2.0 Flash vision if all other methods fail.', '3–8 s'],
            ]}
          />

          <InfoBox type="warn">
            The "Select X" header check is authoritative — it <strong>cannot be overridden</strong> by
            any AI model. If a page has "Select Business" printed at the top, it will always be
            classified as Business regardless of content.
          </InfoBox>

          <h3>AI models used</h3>
          <Table
            headers={['Model', 'Provider', 'Cost', 'Used for']}
            rows={[
              ['deepseek/deepseek-chat-v3-0324', 'OpenRouter', 'Free', 'Text classification of digital PDFs'],
              ['qwen/qwen2.5-vl-72b-instruct', 'OpenRouter', 'Free', 'Vision classification of scanned PDFs'],
              ['gemini-2.0-flash-lite / flash', 'Google AI', 'Free tier', 'Ultimate fallback'],
              ['llama3.2:1b', 'Ollama (local)', 'Free / offline', 'AI Agent chat'],
            ]}
          />
        </Section>

        {/* ── E-PAPER ──────────────────────────────────────────── */}
        <Section id="epaper" title="E-Paper Viewer">
          <p>
            The E-Paper Viewer displays all published editions with thumbnails, section breakdowns,
            and downloadable PDFs.
          </p>

          <h3>What subscribers see</h3>
          <ul className="doc-list">
            <li>Edition cards sorted by date (newest first)</li>
            <li>Thumbnail of the first page</li>
            <li>Available section PDFs with download buttons</li>
          </ul>

          <h3>What admins see</h3>
          <ul className="doc-list">
            <li>All of the above, plus a <strong>Delete PDF</strong> button on each card</li>
            <li>Ability to remove a specific section PDF or the full paper if a mistake was made</li>
            <li>Deleting the full_paper reverts the edition to "draft" status</li>
          </ul>

          <h3>Storage paths</h3>
          <CodeBlock lang="text">{`
Supabase Storage bucket: outputs
  └── YYYY-MM-DD/
        ├── full_paper.pdf      ← complete merged newspaper
        ├── news.pdf
        ├── business.pdf
        ├── sport.pdf
        ├── vibez.pdf
        └── agritoday.pdf
          `}</CodeBlock>
        </Section>

        {/* ── WHATSAPP ─────────────────────────────────────────── */}
        <Section id="whatsapp" title="WhatsApp Delivery">
          <p>
            The system uses a <strong>free local WhatsApp Web agent</strong> — no API keys,
            no monthly fees. It connects to your real WhatsApp account by scanning a QR code.
          </p>

          <h3>Setup (one-time)</h3>
          <Step num={1} title="Start the agent">
            <CodeBlock>{`cd whatsapp-agent
node server.js`}</CodeBlock>
          </Step>
          <Step num={2} title="Scan the QR code">
            <p>
              A QR code will appear in the terminal. Open WhatsApp on your phone →
              tap <strong>⋮ Menu</strong> → <strong>Linked Devices</strong> →
              <strong> Link a Device</strong> → scan the QR.
            </p>
          </Step>
          <Step num={3} title="Done — session saved">
            <p>
              The session is saved in <code>whatsapp-agent/.wwebjs_auth/</code>.
              Future restarts reconnect automatically — no re-scanning needed.
            </p>
          </Step>

          <h3>How delivery works</h3>
          <ol className="doc-list">
            <li>After the pipeline publishes, the backend triggers the WhatsApp agent in the <strong>background</strong> (non-blocking).</li>
            <li>For each subscriber, a unique <strong>6-digit one-time PIN (OTP)</strong> is generated.</li>
            <li>The OTP is sent as a plain text message first.</li>
            <li>Each subscribed section PDF is downloaded, encrypted with the OTP, and sent as a file attachment.</li>
            <li>The subscriber opens the PDF in any PDF reader and enters their PIN when prompted.</li>
          </ol>

          <InfoBox type="info">
            The PIN-protected PDF prevents casual forwarding — anyone who receives the file
            needs the PIN to open it.
          </InfoBox>

          <h3>Agent HTTP endpoints</h3>
          <Table
            headers={['Method', 'Endpoint', 'Description']}
            rows={[
              ['GET', 'http://localhost:5000/health', 'Returns {status: "ready"} when WhatsApp is authenticated'],
              ['POST', 'http://localhost:5000/send', 'Triggers sending for all subscribers. Body: {edition_date, supabase_url}'],
            ]}
          />
        </Section>

        {/* ── AI AGENT ─────────────────────────────────────────── */}
        <Section id="agent" title="AI Agent">
          <p>
            The <strong>AI Agent</strong> is a conversational assistant accessible from the sidebar.
            It has live access to today's edition data and answers editorial operations questions.
          </p>

          <h3>What you can ask</h3>
          <ul className="doc-list">
            <li>How many pages have been uploaded today?</li>
            <li>Which sections are ready for publishing?</li>
            <li>How many subscribers do we have?</li>
            <li>What is the current pipeline status?</li>
            <li>Summarise today's edition progress.</li>
          </ul>

          <h3>Model fallback chain</h3>
          <Table
            headers={['Priority', 'Model', 'Requires']}
            rows={[
              ['1', 'Ollama llama3.2:1b (local)', 'Ollama installed + model pulled'],
              ['2', 'OpenRouter meta-llama/llama-3.3-70b-instruct:free', 'OPENROUTER_API_KEY in .env'],
              ['3', 'Google Gemini 2.0 Flash Lite', 'GEMINI_API_KEY in .env'],
            ]}
          />
        </Section>

        {/* ── SUBSCRIBERS ──────────────────────────────────────── */}
        <Section id="subscribers" title="Subscriber Management">
          <p>
            Subscribers are managed from the <strong>Subscribers</strong> panel (admin only).
            Each subscriber can choose which sections they receive.
          </p>

          <h3>Managing subscribers</h3>
          <Table
            headers={['Action', 'How']}
            rows={[
              ['Add subscriber', 'Enter phone number (with country code e.g. +264812345678) and click Add'],
              ['Remove subscriber', 'Click the remove button next to any subscriber'],
              ['Set section preferences', 'Click on a subscriber to edit which sections they receive'],
              ['Toggle auto-send', 'The auto-send toggle controls whether WhatsApp messages are sent automatically on publish'],
            ]}
          />

          <InfoBox type="info">
            Phone numbers must include the country code without the "+" sign when stored internally
            (e.g. 264812345678). The input accepts the "+" format and strips it automatically.
          </InfoBox>

          <h3>Subscriber data file</h3>
          <p>Subscriber data is stored in <code>backend/subscribers.json</code>:</p>
          <CodeBlock lang="json">{`
{
  "numbers": ["+264812345678"],
  "auto_send": true,
  "preferences": {
    "+264812345678": ["full_paper", "business"]
  },
  "passwords": {
    "+264812345678": "837261"
  }
}
          `}</CodeBlock>
        </Section>

        {/* ── ENV VARS ─────────────────────────────────────────── */}
        <Section id="env" title="Environment Variables">
          <h3>backend/.env</h3>
          <Table
            headers={['Variable', 'Required', 'Description']}
            rows={[
              ['GEMINI_API_KEY', <Badge color="red">Required</Badge>, 'Google Gemini API key — get free at aistudio.google.com/apikey'],
              ['SUPABASE_URL', <Badge color="red">Required</Badge>, 'Your Supabase project URL'],
              ['SUPABASE_SERVICE_ROLE_KEY', <Badge color="red">Required</Badge>, 'Service role key — bypasses RLS for backend operations'],
              ['SUPABASE_JWT_SECRET', <Badge color="red">Required</Badge>, 'JWT secret from Supabase project settings'],
              ['OPENROUTER_API_KEY', <Badge color="yellow">Recommended</Badge>, 'OpenRouter key for DeepSeek + Qwen VL classification (free tier available)'],
              ['OPENROUTER_VISION_MODEL', <Badge color="gray">Optional</Badge>, 'Vision model name. Default: qwen/qwen2.5-vl-72b-instruct:free'],
              ['DEEPSEEK_MODEL', <Badge color="gray">Optional</Badge>, 'Text model name. Default: deepseek/deepseek-chat-v3-0324:free'],
              ['OPENROUTER_MODEL', <Badge color="gray">Optional</Badge>, 'Agent fallback model. Default: meta-llama/llama-3.3-70b-instruct:free'],
              ['OLLAMA_MODEL', <Badge color="gray">Optional</Badge>, 'Local Ollama model for Agent. Default: llama3.2:1b'],
            ]}
          />

          <h3>frontend/.env</h3>
          <Table
            headers={['Variable', 'Required', 'Description']}
            rows={[
              ['REACT_APP_SUPABASE_URL', <Badge color="red">Required</Badge>, 'Same as backend SUPABASE_URL'],
              ['REACT_APP_SUPABASE_ANON_KEY', <Badge color="red">Required</Badge>, 'Supabase anon key (safe to expose in frontend)'],
              ['PORT', <Badge color="gray">Optional</Badge>, 'Dev server port. Default: 3000. Set to 3001 to avoid conflicts.'],
            ]}
          />
        </Section>

        {/* ── TROUBLESHOOT ─────────────────────────────────────── */}
        <Section id="troubleshoot" title="Troubleshooting">
          <Table
            headers={['Problem', 'Cause', 'Fix']}
            rows={[
              [
                'AI reading failed / 403 PERMISSION_DENIED',
                'Gemini API key is invalid, leaked, or quota exhausted',
                'Generate a new key at aistudio.google.com/apikey and update backend/.env',
              ],
              [
                'OpenRouter 401 Unauthorized',
                'OpenRouter API key is expired or invalid',
                'Generate a new key at openrouter.ai and update OPENROUTER_API_KEY in backend/.env',
              ],
              [
                'Page classified in wrong section',
                'AI guessed based on content instead of the header',
                'Ensure the printed page has "Select Business" (or equivalent) at the top. The system detects this instantly without AI.',
              ],
              [
                'WhatsApp agent not reachable',
                'agent not started or QR not scanned',
                'Run: cd whatsapp-agent && node server.js. Then scan the QR code once with your phone.',
              ],
              [
                'Pipeline fails with "Poppler not found"',
                'pdf2image cannot find Poppler',
                'Install Poppler and add its bin/ folder to your system PATH. Restart the terminal after.',
              ],
              [
                'Port 8000 already in use',
                'Another app occupies port 8000',
                'The backend runs on port 8001 by default. Ensure frontend/.env and api.js both point to port 8001.',
              ],
              [
                'Supabase lock warning in browser console',
                'React Strict Mode causes double client init',
                'Expected behaviour — already mitigated with singleton pattern in supabase.js. Safe to ignore.',
              ],
              [
                'Uploaded pages show "Unclassified"',
                'No "Select X" header found and AI did not run',
                'Click the section badge on the uploaded page to manually assign the correct section from the dropdown.',
              ],
              [
                'Designer cannot see their uploads',
                'RLS filtering by email not matching',
                'Ensure the designer's email in the designers table exactly matches their auth email (case-sensitive).',
              ],
            ]}
          />
        </Section>

        <div className="doc-footer">
          <p>NewEra Editorial Automation System · Built by Apnium Technology · 2026</p>
          <p style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
            For support, contact your system administrator or open an issue on GitHub.
          </p>
        </div>
      </main>
    </div>
  );
}
