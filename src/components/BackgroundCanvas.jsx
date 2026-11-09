import { useEffect, useRef } from 'react';
import '../styles/background.css';

const PARTICLE_COUNT = 24;

export default function BackgroundCanvas() {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const left     = Math.random() * 100;
      const duration = 9 + Math.random() * 18;
      const delay    = Math.random() * 16;
      const size     = 1 + Math.random() * 2.5;
      p.style.cssText = `left:${left}%;width:${size}px;height:${size}px;animation-duration:${duration}s;animation-delay:-${delay}s;`;
      container.appendChild(p);
      particles.push(p);
    }
    return () => particles.forEach((p) => p.remove());
  }, []);

  return (
    <div className="bg-canvas">
      {/* Glowing orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />
      <div className="orb orb-4" />
      <div className="orb orb-5" />
      <div className="orb orb-6" />

      {/* Subtle scan line */}
      <div className="scan-line" />

      {/* Grid overlay */}
      <div className="grid-overlay" />

      {/* Vertical lightning streaks */}
      <div className="lightning-container">
        <div className="lightning" />
        <div className="lightning" />
        <div className="lightning" />
        <div className="lightning" />
        <div className="lightning" />
        <div className="lightning" />
        <div className="lightning" />
        <div className="lightning" />
      </div>

      {/* Diagonal lightning arcs */}
      <div className="lightning-container">
        <div className="lightning-arc" />
        <div className="lightning-arc" />
        <div className="lightning-arc" />
      </div>

      {/* Particle host */}
      <div ref={containerRef} />
    </div>
  );
}
