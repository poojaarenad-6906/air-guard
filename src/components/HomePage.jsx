import { useState, useEffect } from 'react';
import '../styles/home.css';

// Rotating live-feel AQI preview cities shown on the hero
const PREVIEW_CITIES = [
  { city: 'Delhi',     aqi: 5, label: 'Very Poor', color: '#B71C1C', pm25: '168.4' },
  { city: 'Sydney',    aqi: 1, label: 'Good',      color: '#4CAF50', pm25: '4.2'   },
  { city: 'Beijing',   aqi: 5, label: 'Very Poor', color: '#B71C1C', pm25: '142.6' },
  { city: 'London',    aqi: 2, label: 'Fair',       color: '#8BC34A', pm25: '12.3' },
  { city: 'Mumbai',    aqi: 3, label: 'Moderate',  color: '#FFC107', pm25: '45.2'  },
  { city: 'New York',  aqi: 2, label: 'Fair',       color: '#8BC34A', pm25: '9.8'  },
];

const STATS = [
  { icon: '🌍', value: '14+', label: 'Cities Covered' },
  { icon: '⚡', value: 'Live', label: 'AQI Updates' },
  { icon: '🛡️', value: '9',   label: 'Guardrail Layers' },
  { icon: '📊', value: '6',   label: 'Metric Categories' },
];

function AqiPreviewCard({ city, aqi, label, color, pm25 }) {
  return (
    <div className="aqi-preview-card glass-card">
      <div className="apc-top">
        <span className="apc-city">📍 {city}</span>
        <span className="apc-badge" style={{ color, background: `${color}22`, border: `1px solid ${color}44` }}>
          {label}
        </span>
      </div>
      <div className="apc-aqi" style={{ color }}>{aqi}</div>
      <div className="apc-label">AQI Index</div>
      <div className="apc-pm">PM2.5 · {pm25} μg/m³</div>
    </div>
  );
}

export default function HomePage({ onSearch, loading }) {
  const [city, setCity]   = useState('');
  const [error, setError] = useState('');
  const [previewIdx, setPreviewIdx] = useState(0);

  // Rotate preview cities every 3 s
  useEffect(() => {
    const id = setInterval(() => {
      setPreviewIdx((i) => (i + 1) % PREVIEW_CITIES.length);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  async function handleSearch(e) {
    e.preventDefault();
    const trimmed = city.trim();
    if (!trimmed) { setError('Please enter a city name.'); return; }
    setError('');
    onSearch(trimmed);
  }

  const prev = PREVIEW_CITIES[previewIdx];

  return (
    <section className="home-section">
      <div className="container home-inner">
        {/* Hero */}
        <div className="hero fade-in">
          <div className="hero-badge">
            <span className="pulse-dot" />
            Live Air Quality Intelligence
          </div>
          <h1 className="hero-title">
            Breathe Smarter.<br />
            <span className="hero-accent">Live Healthier.</span>
          </h1>
          <p className="hero-subtitle">
            AI AirGuard monitors real-time air pollution levels for cities worldwide,
            provides personalised health guidance, and helps you make informed daily
            decisions — powered by live AQI data and AI-driven recommendations.
          </p>

          {/* Search */}
          <form className="search-form" onSubmit={handleSearch}>
            <div className="search-input-wrap">
              <span className="search-icon">🔍</span>
              <input
                className="input-field search-input"
                type="text"
                placeholder="Enter city name (e.g. Mumbai, London, Delhi)"
                value={city}
                onChange={(e) => { setCity(e.target.value); setError(''); }}
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary search-btn"
              disabled={loading}
            >
              {loading
                ? <><span className="spinner-sm" /> Checking…</>
                : <><span>🌍</span> Check Air Quality</>
              }
            </button>
          </form>
          {error && <p className="search-error">{error}</p>}

          {/* Quick city picks */}
          <div className="quick-cities">
            <span className="quick-label">Quick check:</span>
            {['Delhi', 'Mumbai', 'London', 'New York', 'Beijing', 'Sydney'].map((c) => (
              <button
                key={c}
                className="btn btn-ghost btn-sm quick-btn"
                onClick={() => { setCity(c); onSearch(c); }}
                disabled={loading}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Stats banner */}
        <div className="stats-banner fade-in">
          {STATS.map((s) => (
            <div key={s.label} className="stat-banner-item glass-card">
              <span className="stat-banner-icon">{s.icon}</span>
              <span className="stat-banner-value">{s.value}</span>
              <span className="stat-banner-label">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Animated AQI preview + feature cards row */}
        <div className="home-bottom-row fade-in">
          {/* Animated preview card */}
          <div className="aqi-preview-wrap">
            <h3 className="preview-heading">🌐 Live Sample Reading</h3>
            <p className="preview-sub">Rotating through monitored cities</p>
            <AqiPreviewCard key={prev.city} {...prev} />
            <div className="preview-dots">
              {PREVIEW_CITIES.map((_, i) => (
                <span
                  key={i}
                  className={`preview-dot ${i === previewIdx ? 'active' : ''}`}
                  onClick={() => setPreviewIdx(i)}
                />
              ))}
            </div>
          </div>

          {/* Feature grid */}
          <div className="feature-grid">
            {[
              { icon: '📡', title: 'Live AQI Data',     desc: 'Real-time air quality from OpenWeatherMap API' },
              { icon: '🩺', title: 'Health Guidance',    desc: 'Personalised recommendations based on AQI' },
              { icon: '📊', title: 'Trend Charts',       desc: 'Visual pollution analytics and pollutant breakdown' },
              { icon: '🤖', title: 'AI Assistant',       desc: 'Ask questions about air quality and pollution' },
              { icon: '🚨', title: 'Smart Alerts',       desc: 'Colour-coded warnings when air quality deteriorates' },
              { icon: '🌱', title: 'Pollution Insights', desc: 'Learn about AQI, PM2.5, PM10, and more' },
            ].map((f) => (
              <div key={f.title} className="glass-card feature-card">
                <span className="feature-icon">{f.icon}</span>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
