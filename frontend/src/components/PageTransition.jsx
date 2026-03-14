import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import './PageTransition.css';

/**
 * PageTransition
 * Wraps page content and plays a fade+slide-up animation
 * every time the route changes.
 */
export default function PageTransition({ children }) {
  const location = useLocation();
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Remove, force reflow, then re-add to restart animation
    el.classList.remove('page-enter');
    void el.offsetWidth; // trigger reflow
    el.classList.add('page-enter');
  }, [location.pathname]);

  return (
    <div ref={ref} className="page-transition page-enter">
      {children}
    </div>
  );
}
