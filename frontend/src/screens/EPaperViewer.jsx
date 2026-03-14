import React, { useEffect, useState } from 'react';
import { getEditions, getStorageUrl } from '../api';
import PdfThumbnail from '../components/PdfThumbnail';
import PdfViewer from '../components/PdfViewer';
import './EPaperViewer.css';

const CATEGORIES = [
  { key: 'full_paper', label: 'FullPaper' },
  { key: 'sport', label: 'NewEra Sport' },
  { key: 'business', label: 'NewEra Business' },
  { key: 'vibez', label: 'NewEra Vibez' },
  { key: 'agritoday', label: 'NewEra AgriToday' },
  { key: 'magazines', label: 'Magazines' },
];

function buildEditionCards(editions) {
  const cards = [];
  for (const edition of editions) {
    const paths = edition.storage_paths || edition.outputs;
    if (!paths) continue;
    for (const [key, path] of Object.entries(paths)) {
      if (!path) continue;
      const filename = path.split('/').pop();
      cards.push({
        date: edition.date,
        category: key,
        filename,
        path,
        publishedAt: edition.published_at,
        pageCount: key === 'full_paper'
          ? edition.expected_pages
          : (edition.sections?.[capitaliseKey(key)]?.length || '—'),
        url: getStorageUrl('outputs', path),
      });
    }
  }
  return cards;
}

function capitaliseKey(key) {
  const map = {
    news: 'News',
    sport: 'Sport',
    business: 'Business',
    vibez: 'Vibez',
    agritoday: 'AgriToday',
    full_paper: 'Full Paper',
  };
  return map[key] || key;
}

export default function EPaperViewer() {
  const [activeTab, setActiveTab] = useState('full_paper');
  const [cards, setCards] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const editionData = await getEditions();
        setCards(buildEditionCards(editionData));
      } catch (err) {
        setError('Could not load editions.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filteredCards = activeTab === 'all' 
    ? cards 
    : cards.filter((c) => c.category === activeTab);

  return (
    <div className="epaper-page">
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
          {filteredCards.map((card, idx) => (
            <div
              key={idx}
              className="edition-card"
              onClick={() => setSelectedCard(card)}
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
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PDF Viewer Modal */}
      {selectedCard && (
        <div className="pdf-modal-overlay" onClick={() => setSelectedCard(null)}>
          <div className="pdf-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pdf-modal-header">
              <div>
                <div className="pdf-modal-title">{capitaliseKey(selectedCard.category)}</div>
                <div className="pdf-modal-sub">{selectedCard.date} · {selectedCard.filename}</div>
              </div>
              <div className="pdf-modal-actions">
                <a
                  href={selectedCard.url}
                  download
                  className="pdf-download-btn"
                  onClick={(e) => e.stopPropagation()}
                >
                  Download PDF
                </a>
                <button className="pdf-close-btn" onClick={() => setSelectedCard(null)}>
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="pdf-viewer-frame">
              <PdfViewer url={selectedCard.url} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
