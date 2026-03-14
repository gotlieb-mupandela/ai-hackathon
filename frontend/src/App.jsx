import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { upsertEdition } from './api';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Upload from './screens/Upload';
import Pipeline from './screens/Pipeline';
import EPaperViewer from './screens/EPaperViewer';
import Archive from './screens/Archive';
import Dashboard from './screens/Dashboard';
import Designers from './screens/Designers';
import Login from './screens/Login';
import './App.css';

const STORAGE_KEY_LAST_ARCHIVED = 'newera_last_archived_date';

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function LoginRoute() {
  const { isAuthenticated, loading, isAdmin } = useAuth();
  if (loading) {
    return (
      <div className="app-layout app-loading">
        <div className="loading-spinner" />
        <p>Loading…</p>
      </div>
    );
  }
  if (isAuthenticated) {
    return <Navigate to={isAdmin ? '/dashboard' : '/upload'} replace />;
  }
  return <Login />;
}

function PrivateLayout() {
  const { loading, isAuthenticated, isAdmin } = useAuth();

  // Step 9: At midnight, archive yesterday's edition (runs on first load of a new day)
  useEffect(() => {
    const todayStr = getTodayStr();
    const lastArchived = sessionStorage.getItem(STORAGE_KEY_LAST_ARCHIVED);
    if (lastArchived && lastArchived !== todayStr) {
      upsertEdition({ date: lastArchived, status: 'archived' }).catch(() => {});
    }
    sessionStorage.setItem(STORAGE_KEY_LAST_ARCHIVED, todayStr);
  }, []);

  if (loading) {
    return (
      <div className="app-layout app-loading">
        <div className="loading-spinner" />
        <p>Loading…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const defaultRoute = isAdmin ? '/dashboard' : '/upload';

  return (
    <div className="app-layout">
      <Navbar />
      <div className="app-body">
        <Sidebar />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Navigate to={defaultRoute} replace />} />
            {isAdmin && (
              <>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/designers" element={<Designers />} />
              </>
            )}
            <Route path="/upload" element={<Upload />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/viewer" element={<EPaperViewer />} />
            <Route path="/archive" element={<Archive />} />
            <Route path="*" element={<Navigate to={defaultRoute} replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/*" element={<PrivateLayout />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
