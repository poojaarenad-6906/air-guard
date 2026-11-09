import { useState } from 'react';
import '../styles/guardrails.css';
import { getAuditLog, getSessionStats, OPERATIONAL_LIMITS } from '../guardrails/index.js';

const CATEGORY_META = [
  { id: 1, key: 'input',       icon: '🛡️',  label: 'Input',         desc: 'Injection, PII, malicious content' },
  { id: 2, key: 'output',      icon: '📤',  label: 'Output',        desc: 'Toxicity, hallucination, sensitive info' },
  { id: 3, key: 'tool',        icon: '🔧',  label: 'Tool Execution', desc: 'API auth, rate limits, domain control' },
  { id: 4, key: 'data',        icon: '🗄️',  label: 'Data',          desc: 'PII masking, role access, privacy' },
  { id: 5, key: 'security',    icon: '🔒',  label: 'Security',      desc: 'Jailbreak, SQLi, XSS, credentials' },
  { id: 6, key: 'operational', icon: '⚙️',  label: 'Operational',   desc: 'Timeouts, tokens, rate limits, cost' },
  { id: 7, key: 'human',       icon: '👤',  label: 'Human-in-Loop', desc: 'Approval workflows, escalation' },
  { id: 8, key: 'multiagent',  icon: '🤝',  label: 'Multi-Agent',   desc: 'Agent coordination, loop prevention' },
  { id: 9, key: 'ethics',      icon: '⚖️',  label: 'Ethics',        desc: 'Bias, fairness, compliance, audit' },
];

function StatusBadge({ status }) {
  const map = {
    active:  { color: '#4CAF50', label: 'Active' },
    warning: { color: '#FFC107', label: 'Warning' },
    blocked: { color: '#FF5722', label: 'Blocked' },
    idle:    { color: '#8BA8C4', label: 'Idle' },
  };
  const s = map[status] || map.idle;
  return (
    <span className="gr-badge" style={{ background: `${s.color}22`, color: s.color, border: `1px solid ${s.color}55` }}>
      <span className="gr-dot" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

function AuditLogPanel({ log }) {
  if (!log.length) return <p className="gr-empty">No audit events yet. Send a message to generate events.</p>;
  return (
    <div className="gr-audit-list">
      {[...log].reverse().slice(0, 20).map((entry) => (
        <div key={entry.id} className={`gr-audit-row ${entry.passed ? 'pass' : 'fail'}`}>
          <span className="gr-audit-icon">{entry.passed ? '✅' : '🚫'}</span>
          <div className="gr-audit-body">
            <span className="gr-audit-cat">{entry.category}</span>
            {entry.textPreview && <span className="gr-audit-text">"{entry.textPreview}…"</span>}
            {entry.violations > 0 && <span className="gr-audit-v">{entry.violations} violation{entry.violations > 1 ? 's' : ''}</span>}
          </div>
          <span className="gr-audit-time">{new Date(entry.timestamp).toLocaleTimeString()}</span>
        </div>
      ))}
    </div>
  );
}

function SessionStatsPanel({ stats }) {
  const tokenPct = Math.min(100, Math.round((stats.tokensUsed / OPERATIONAL_LIMITS.maxTokensPerSession) * 100));
  const costPct  = Math.min(100, Math.round((stats.estimatedCostUsd / OPERATIONAL_LIMITS.budgetUsdPerSession) * 100));
  return (
    <div className="gr-stats-grid">
      {[
        { label: 'Messages',      value: stats.chatMessageCount, max: OPERATIONAL_LIMITS.maxChatMessages },
        { label: 'API Calls/min', value: stats.apiCallsThisMin,  max: OPERATIONAL_LIMITS.maxApiCallsPerMin },
        { label: 'Iterations',    value: stats.agentIterations,  max: OPERATIONAL_LIMITS.maxAgentIterations },
      ].map(({ label, value, max }) => (
        <div key={label} className="gr-stat-item">
          <div className="gr-stat-label">{label}</div>
          <div className="gr-stat-value">{value} <span className="gr-stat-max">/ {max}</span></div>
          <div className="gr-stat-bar">
            <div className="gr-stat-fill" style={{ width: `${Math.min(100, Math.round((value / max) * 100))}%`,
              background: value / max > 0.8 ? '#FF5722' : value / max > 0.5 ? '#FFC107' : '#4CAF50' }} />
          </div>
        </div>
      ))}
      <div className="gr-stat-item">
        <div className="gr-stat-label">Tokens Used</div>
        <div className="gr-stat-value">{stats.tokensUsed} <span className="gr-stat-max">/ {OPERATIONAL_LIMITS.maxTokensPerSession}</span></div>
        <div className="gr-stat-bar">
          <div className="gr-stat-fill" style={{ width: `${tokenPct}%`, background: tokenPct > 80 ? '#FF5722' : '#29B6F6' }} />
        </div>
      </div>
      <div className="gr-stat-item">
        <div className="gr-stat-label">Est. Cost (USD)</div>
        <div className="gr-stat-value">${stats.estimatedCostUsd.toFixed(5)} <span className="gr-stat-max">/ ${OPERATIONAL_LIMITS.budgetUsdPerSession}</span></div>
        <div className="gr-stat-bar">
          <div className="gr-stat-fill" style={{ width: `${costPct}%`, background: costPct > 80 ? '#FF5722' : '#4CAF50' }} />
        </div>
      </div>
    </div>
  );
}

export default function GuardrailStatus({ lastResult }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [expanded, setExpanded]   = useState(false);
  const auditLog    = getAuditLog();
  const sessionStats = getSessionStats();

  // Determine category statuses from last guardrail result
  function getCategoryStatus(key) {
    if (!lastResult) return 'idle';
    const details = lastResult.details || {};
    if (key === 'input'       && details.input)   return details.input.passed ? 'active' : 'blocked';
    if (key === 'security'    && details.security) return details.security.passed ? 'active' : 'blocked';
    if (key === 'output'      && details.output)  return details.output.passed ? 'active' : 'blocked';
    if (key === 'operational' && details.ops)     return details.ops.passed ? 'active' : 'blocked';
    return 'active';   // not triggered = idle/active
  }

  const totalViolations = auditLog.filter((e) => !e.passed).length;
  const totalEvents     = auditLog.length;

  return (
    <div className={`gr-panel glass-card ${expanded ? 'expanded' : ''}`}>
      {/* Header */}
      <button className="gr-header" onClick={() => setExpanded(!expanded)}>
        <div className="gr-header-left">
          <span className="gr-header-icon">🛡️</span>
          <div>
            <span className="gr-header-title">Guardrail Engine</span>
            <span className="gr-header-sub">9 Active Guardrail Categories</span>
          </div>
        </div>
        <div className="gr-header-right">
          {totalViolations > 0 && (
            <span className="gr-violation-count">{totalViolations} violation{totalViolations > 1 ? 's' : ''}</span>
          )}
          <StatusBadge status={lastResult ? (lastResult.passed ? 'active' : 'blocked') : 'idle'} />
          <span className="gr-chevron">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="gr-body">
          {/* Tab nav */}
          <div className="tab-nav gr-tabs">
            {['overview', 'audit', 'stats'].map((t) => (
              <button key={t} className={`tab-btn ${activeTab === t ? 'active' : ''}`}
                onClick={() => setActiveTab(t)}>
                {t === 'overview' ? '🗂️ Overview' : t === 'audit' ? '📋 Audit Log' : '📊 Session Stats'}
              </button>
            ))}
          </div>

          {/* Overview tab */}
          {activeTab === 'overview' && (
            <div className="gr-categories">
              {CATEGORY_META.map((cat) => {
                const status = getCategoryStatus(cat.key);
                return (
                  <div key={cat.id} className={`gr-category-row status-${status}`}>
                    <span className="gr-cat-num">{cat.id}</span>
                    <span className="gr-cat-icon">{cat.icon}</span>
                    <div className="gr-cat-info">
                      <span className="gr-cat-label">{cat.label}</span>
                      <span className="gr-cat-desc">{cat.desc}</span>
                    </div>
                    <StatusBadge status={status} />
                  </div>
                );
              })}

              {/* Last result violations */}
              {lastResult && lastResult.allViolations?.length > 0 && (
                <div className="gr-violations-box">
                  <div className="gr-violations-title">⚠️ Violations Detected</div>
                  {lastResult.allViolations.map((v, i) => (
                    <div key={i} className={`gr-violation-item severity-${v.severity || 'error'}`}>
                      <strong>{v.type}</strong>: {v.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Audit log tab */}
          {activeTab === 'audit' && (
            <div className="gr-tab-content">
              <div className="gr-audit-header">
                <span>{totalEvents} events · {totalViolations} blocked</span>
              </div>
              <AuditLogPanel log={auditLog} />
            </div>
          )}

          {/* Session stats tab */}
          {activeTab === 'stats' && (
            <div className="gr-tab-content">
              <SessionStatsPanel stats={sessionStats} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
