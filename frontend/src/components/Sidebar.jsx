import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Sidebar.css';

// ─── Icon helpers ────────────────────────────────────────────────
const DashIcon = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);
const DesignersIcon = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);
const UploadIcon = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);
const PublishIcon = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);
const ViewerIcon = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
  </svg>
);
const ArchiveIcon = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);
const SubsIcon = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);
const SectionsIcon = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h8m-8 6h16" />
  </svg>
);
const PeriodsIcon = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const PaymentsIcon = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
  </svg>
);
const ChevronIcon = ({ open }) => (
  <svg
    width="14" height="14" fill="none" viewBox="0 0 24 24"
    stroke="currentColor" strokeWidth="2"
    style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.25s ease', flexShrink: 0 }}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);
const ManagementIcon = () => (
  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

// ─── Management dropdown sub-items ──────────────────────────────
const MANAGEMENT_ITEMS = [
  { path: '/management/epapers',      label: 'E-Papers',      icon: <ViewerIcon /> },
  { path: '/management/users',        label: 'Users',         icon: <DesignersIcon /> },
  { path: '/management/subscriptions',label: 'Subscriptions', icon: <SubsIcon /> },
  { path: '/management/sections',     label: 'Sections',      icon: <SectionsIcon /> },
  { path: '/management/periods',      label: 'Periods',       icon: <PeriodsIcon /> },
];

function NavItem({ path, label, icon }) {
  return (
    <li>
      <NavLink
        to={path}
        className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link--active' : ''}`}
      >
        <span className="sidebar-icon">{icon}</span>
        <span className="sidebar-label">{label}</span>
      </NavLink>
    </li>
  );
}

function ManagementGroup() {
  const location = useLocation();
  const isAnyActive = MANAGEMENT_ITEMS.some((item) => location.pathname.startsWith(item.path));
  const [open, setOpen] = useState(isAnyActive);

  return (
    <li>
      <button
        type="button"
        className={`sidebar-link sidebar-group-btn ${isAnyActive ? 'sidebar-link--active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="sidebar-icon"><ManagementIcon /></span>
        <span className="sidebar-label">Management</span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <ul className="sidebar-sub-nav">
          {MANAGEMENT_ITEMS.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) => `sidebar-link sidebar-sub-link ${isActive ? 'sidebar-link--active' : ''}`}
              >
                <span className="sidebar-icon">{item.icon}</span>
                <span className="sidebar-label">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

const DESIGNER_NAV_ITEMS = [
  { path: '/designer-dashboard', label: 'Dashboard',    icon: <DashIcon /> },
  { path: '/upload',             label: 'My Uploads',   icon: <UploadIcon /> },
  { path: '/viewer',             label: 'ePaper Viewer',icon: <ViewerIcon /> },
  { path: '/archive',            label: 'Archive',      icon: <ArchiveIcon /> },
];

export default function Sidebar() {
  const { isAdmin } = useAuth();

  return (
    <nav className="sidebar">
      <div className="sidebar-section-label">Navigation</div>
      <ul className="sidebar-nav">
        {isAdmin ? (
          <>
            <NavItem path="/dashboard"   label="Dashboard"     icon={<DashIcon />} />
            <NavItem path="/designers"   label="Designers"     icon={<DesignersIcon />} />
            <NavItem path="/upload"      label="Upload Portal" icon={<UploadIcon />} />
            <NavItem path="/pipeline"    label="Publish"       icon={<PublishIcon />} />
            <ManagementGroup />
            <NavItem path="/payments"    label="Payments"      icon={<PaymentsIcon />} />
            <NavItem path="/archive"     label="Archive"       icon={<ArchiveIcon />} />
          </>
        ) : (
          DESIGNER_NAV_ITEMS.map((item) => (
            <NavItem key={item.path} {...item} />
          ))
        )}
      </ul>
      <div className="sidebar-footer">
        <div className="sidebar-footer-logo">Apnium Technology</div>
        <div className="sidebar-footer-sub">Windhoek, Namibia</div>
      </div>
    </nav>
  );
}
