import { useState, useEffect, useRef } from 'react';
import '../styles/navbar.css';

const NAV_LINKS = [
  { id: 'home',          label: 'Home',           requiresData: false },
  { id: 'dashboard',     label: 'Dashboard',      requiresData: true  },
  { id: 'charts',        label: 'AQI Charts',     requiresData: true  },
  { id: 'assistant',     label: 'AI Assistant',   requiresData: false },
  { id: 'insights',      label: 'Insights',       requiresData: false },
  { id: 'llmdashboard',  label: '📈 Eval Dashboard', requiresData: false },
];

export default function Navbar({ activeSection, onNavigate, hasData }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef(null);

  // Close mobile menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(e) {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

  // Close menu on Escape key
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <nav className="navbar glass-card" ref={navRef}>
      <div className="navbar-inner container">
        <button className="navbar-logo" onClick={() => { onNavigate('home'); setMenuOpen(false); }}>
          <span className="logo-icon">🌬️</span>
          <span className="logo-text">
            AI <span className="logo-accent">AirGuard</span>
          </span>
        </button>

        <ul className={`nav-links ${menuOpen ? 'open' : ''}`}>
          {NAV_LINKS.map((link) => (
            <li key={link.id}>
              <button
                className={`nav-link ${activeSection === link.id ? 'active' : ''} ${link.requiresData && !hasData ? 'disabled-link' : ''}`}
                onClick={() => { onNavigate(link.id); setMenuOpen(false); }}
                title={link.requiresData && !hasData ? 'Search for a city first' : undefined}
              >
                {link.label}
                {link.requiresData && !hasData && (
                  <span className="nav-lock-icon" title="Search a city first">🔒</span>
                )}
              </button>
            </li>
          ))}
        </ul>

        <button
          className={`hamburger ${menuOpen ? 'open' : ''}`}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
        >
          <span />
          <span />
          <span />
        </button>
      </div>
    </nav>
  );
}
