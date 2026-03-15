import React, { useEffect, useState } from 'react';
import { getEditions, getStorageUrl, deleteOutputPdf } from '../api';
import PdfThumbnail from '../components/PdfThumbnail';
import PdfViewer from '../components/PdfViewer';
import './EPaperViewer.css';

const CATEGORIES = [
  { key: 'full_paper', label: 'Full Paper' },
  { key: 'news',       label: 'NewEra News' },
  { key: 'sport',      label: 'NewEra Sport' },
  { key: 'business',   label: 'NewEra Business' },
  { key: 'vibez',      label: 'NewEra Vibez!' },
  { key: 'agritoday',  label: 'NewEra AgriToday' },
];

// Maps storage key → display label
const KEY_LABEL_MAP = {
  full_paper: 'Full Paper',
  news:       'NewEra News',
  sport:      'NewEra Sport',
  business:   'NewEra Business',
  vibez:      'NewEra Vibez!',
  agritoday:  'NewEra AgriToday',
};

// Maps storage key → sections map key (as saved by pipeline)
const KEY_SECTION_MAP = {
  news:      'News',
  sport:     'Sport',
  business:  'Business',
  vibez:     'Vibez!',
  agritoday: 'AgriToday',
};

function buildEditionCards(editions) {
  const cards = [];
  for (const edition of editions) {
    const paths = edition.storage_paths || edition.outputs;
    if (!paths) continue;

    for (const [key, path] of Object.entries(paths)) {
      if (!path) continue;
      const filename = path.split('/').pop();

      let pageCount = '—';
      if (key === 'full_paper') {
        // Use actual page count from the pipeline pages array
        pageCount = Array.isArray(edition.pages) ? edition.pages.length : (edition.expected_pages || '—');
      } else {
        const sectionKey = KEY_SECTION_MAP[key];
        const sectionPages = sectionKey && edition.sections?.[sectionKey];
        pageCount = Array.isArray(sectionPages) ? sectionPages.length : '—';
      }

      const pdfUrl = getStorageUrl('outputs', path);

      cards.push({
        date: edition.date,
        category: key,
        label: KEY_LABEL_MAP[key] || key,
        filename,
        path,
        publishedAt: edition.published_at,
        pageCount,
        // Each card shows page 1 of its own PDF as the thumbnail
        url: pdfUrl,
      });
    }
  }
  return cards;
}

export default function EPaperViewer() {
  const [activeTab, setActiveTab] = useState('full_paper');
  const [cards, setCards] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deletingKey, setDeletingKey] = useState(null); // "date::category" while deleting
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadEditions = async () => {
    try {
      setLoading(true);
      const editionData = await getEditions();
      setCards(buildEditionCards(editionData));
    } catch {
      setError('Could not load editions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadEditions(); }, []); // eslint-disable-line

  const handleDelete = async (e, card) => {
    e.stopPropagation(); // Don't open the viewer
    if (!window.confirm(`Delete "${card.label}" (${card.date})?\n\nThis permanently removes the PDF from storage and cannot be undone.`)) return;

    const key = `${card.date}::${card.category}`;
    setDeletingKey(key);
    try {
      await deleteOutputPdf(card.date, card.category, card.path);
      showToast(`Deleted ${card.label} (${card.date})`, 'success');
      await loadEditions(); // Refresh the grid
    } catch (err) {
      showToast(`Delete failed: ${err.message}`, 'error');
    } finally {
      setDeletingKey(null);
    }
  };

  const filteredCards = activeTab === 'all' 
    ? cards 
    : cards.filter((c) => c.category === activeTab);

  return (
    <div className="epaper-page">
      {/* Toast */}
      {toast && (
        <div className={`epaper-toast epaper-toast--${toast.type}`}>{toast.message}</div>
      )}

      {/* Banner */}
      <div className="epaper-banner">
        <div className="banner-content">
          <div className="banner-logo-text">
            <span className="era">ERA</span> <span className="select">SELECT</span><span className="dash">—</span>
          </div>
          <div className="banner-icon">
            <div className="red-circle">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v2m0 12v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M4 12h2m12 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" />
              </svg>
            </div>
          </div>
          <div className="banner-powered">
            powered by <span className="new-era-text">New Era</span>
          </div>
        </div>
      </div>

      {/* Header and Tabs */}
      <div className="epaper-header">
        <h2 className="epaper-title">
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
          </svg>
          New Era E-Papers
        </h2>
        <div className="category-tabs">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              className={`category-tab ${activeTab === cat.key ? 'category-tab--active' : ''}`}
              onClick={() => setActiveTab(cat.key)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="loading-state">Loading editions...</div>}
      {error && <div className="error-state">{error}</div>}

      {!loading && !error && filteredCards.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">
            <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
            </svg>
          </div>
          <p>No editions published yet.</p>
          <p className="empty-sub">Upload pages and run the pipeline to see editions here.</p>
        </div>
      )}

      {/* Edition Card Grid */}
      {!loading && filteredCards.length > 0 && (
        <div className="editions-grid">
          {filteredCards.map((card, idx) => {
            const cardKey = `${card.date}::${card.category}`;
            const isDeleting = deletingKey === cardKey;
            return (
              <div
                key={idx}
                className={`edition-card ${isDeleting ? 'edition-card--deleting' : ''}`}
                onClick={() => !isDeleting && setSelectedCard(card)}
              >
                <div className="edition-card-preview">
                  <PdfThumbnail url={card.url} width={240} />
                  <div className="edition-card-overlay">
                    <span className="overlay-btn">Read Edition</span>
                  </div>
                </div>
                <div className="edition-card-body">
                  <div className="edition-date">
                    {new Date(card.date + 'T00:00:00').toLocaleDateString('en-GB', {
                      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                    })}
                  </div>
                  <div className="edition-meta">
                    {card.pageCount !== '—' ? `${card.pageCount} pages` : 'View PDF'}
                  </div>
                  <button
                    className="edition-delete-btn"
                    onClick={(e) => handleDelete(e, card)}
                    disabled={isDeleting}
                    title={`Delete ${card.label} (${card.date})`}
                  >
                    {isDeleting ? (
                      <>
                        <svg className="spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round"/>
                        </svg>
                        Deleting…
                      </>
                    ) : (
                      <>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                          <path d="M10 11v6M14 11v6"/>
                          <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                        </svg>
                        Delete PDF
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PDF Viewer Modal */}
      {selectedCard && (
        <div className="pdf-modal-overlay" onClick={() => setSelectedCard(null)}>
          <div className="pdf-modal" onClick={(e) => e.stopPropagation()}>

            {/* Top bar */}
            <div className="pdf-modal-topbar">
              <div className="pdf-modal-brand">
                <div className="pdf-modal-brand-logo">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                  </svg>
                </div>
                <div>
                  <div className="pdf-modal-title">{selectedCard.label}</div>
                  <div className="pdf-modal-sub">
                    {new Date(selectedCard.date + 'T00:00:00').toLocaleDateString('en-GB', {
                      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                    })}
                    {selectedCard.pageCount !== '—' && ` · ${selectedCard.pageCount} pages`}
                  </div>
                </div>
              </div>

              <div className="pdf-modal-actions">
                <a
                  href={selectedCard.url}
                  download
                  className="pdf-download-btn"
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download PDF
                </a>
                <button className="pdf-close-btn" onClick={() => setSelectedCard(null)} title="Close">
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* PDF content */}
            <div className="pdf-viewer-frame">
              <PdfViewer url={selectedCard.url} />
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
