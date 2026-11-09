import { useState, useEffect, useCallback } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, ResponsiveContainer, Cell, Legend,
} from 'recharts';
import { getAllMetrics, resetMetrics } from '../metrics/metricsEngine.js';
import '../styles/llmDashboard.css';

// ─── helpers ───────────────────────────────────────────────────────────────
const pct  = (v) => `${(+(v || 0) * 100).toFixed(1)}%`;
const ms   = (v) => `${(+(v || 0)).toFixed(0)} ms`;
const tok  = (v) => `${Math.round(+(v || 0))}`;
const usd  = (v) => `$${(+(v || 0)).toFixed(5)}`;
const num  = (v, d = 3) => (+(v || 0)).toFixed(d);

function scoreColor(v) {
  const n = +v;
  if (n >= 0.75) return '#4CAF50';
  if (n >= 0.45) return '#FFC107';
  return '#FF5722';
}
function scoreClass(v) {
  const n = +v;
  if (n >= 0.75) return 'good';
  if (n >= 0.45) return 'warn';
  return 'danger';
}

const CHART_TOOLTIP_STYLE = {
  background: 'rgba(8,15,31,0.95)', border: '1px solid rgba(141,216,255,0.2)',
  borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#E1EDF5',
};

// ─── sub-components ────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, barValue, barColor, format = 'pct' }) {
  const display = format === 'pct'  ? pct(value)
                : format === 'ms'   ? ms(value)
                : format === 'tok'  ? tok(value)
                : format === 'usd'  ? usd(value)
                : format === 'raw'  ? String(value ?? 0)
                : num(value);
  const cls = (format === 'pct' || format === 'num') ? scoreClass(value) : '';
  const bar = barValue ?? (format === 'pct' ? value : null);
  const col = barColor ?? scoreColor(value);

  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className={`metric-value ${cls}`}>{display}</div>
      {sub && <div className="metric-sub">{sub}</div>}
      {bar !== null && (
        <div className="metric-bar">
          <div className="metric-bar-fill"
            style={{ width: `${Math.min(100, (+(bar || 0)) * 100)}%`, background: col }} />
        </div>
      )}
    </div>
  );
}

function CategoryHeader({ icon, title, desc }) {
  return (
    <div className="dash-category-header">
      <span className="dash-category-icon">{icon}</span>
      <span className="dash-category-title">{title}</span>
      {desc && <span className="dash-category-desc">{desc}</span>}
    </div>
  );
}

function NoData({ onDemo }) {
  return (
    <div className="glass-card dash-no-data">
      <span className="no-data-icon">📊</span>
      <strong>No evaluation data yet</strong>
      <p>Use the <strong>AI Assistant</strong> tab to send messages — metrics are collected automatically from every interaction.</p>
      <p style={{ marginTop: 8 }}>Or click <strong>Load Demo Data</strong> to see sample metrics instantly.</p>
      <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={onDemo}>
        ⚡ Load Demo Data
      </button>
    </div>
  );
}

// ─── DEMO DATA SEEDER ────────────────────────────────────────────────────────
import { recordInteraction, recordSafetyEvent, recordToolEvent } from '../metrics/metricsEngine.js';

function seedDemoData() {
  resetMetrics();
  const pairs = [
    { q: 'What is AQI?',              r: 'AQI is the Air Quality Index ranging from 1 to 5.', latency: 420 },
    { q: 'How dangerous is PM2.5?',   r: 'PM2.5 particles are dangerous as they enter the bloodstream.', latency: 380 },
    { q: 'Should I wear a mask?',     r: 'Wear an N95 mask when AQI is 4 or 5.', latency: 510 },
    { q: 'Is Delhi air quality bad?', r: 'Delhi often has Very Poor AQI due to vehicles and industry.', latency: 290 },
    { q: 'Explain ozone pollution',   r: 'Ground-level ozone forms from NOx and sunlight reactions.', latency: 460 },
    { q: 'Tips for outdoor exercise', r: 'Exercise outdoors when AQI is 1 or 2 only.', latency: 330 },
    { q: 'What is SO2?',              r: 'Sulfur dioxide comes from burning fossil fuels.', latency: 395 },
    { q: 'How to reduce pollution?',  r: 'Use public transport, plant trees, avoid burning waste.', latency: 410 },
  ];
  for (const p of pairs) {
    recordInteraction({
      query: p.q, response: p.r, reference: p.r,
      latencyMs: p.latency, ttftMs: p.latency * 0.3,
      inputTokens: Math.ceil(p.q.length / 4),
      outputTokens: Math.ceil(p.r.length / 4),
      costUsd: ((p.q.length + p.r.length) / 4 / 1000) * 0.0001,
      agentName: ['chatAssistantAgent', 'healthAdvisoryAgent'][Math.floor(Math.random() * 2)],
    });
  }
  // Safety events
  recordSafetyEvent({ promptInjection: true, blocked: true });
  recordSafetyEvent({ piiDetected: true, blocked: false });
  recordSafetyEvent({ hallucination: false, toxic: false });
  recordSafetyEvent({ blocked: true, policyViolation: true });
  // Tool events
  recordToolEvent({ toolName: 'fetchAirQuality', success: true,  latencyMs: 700 });
  recordToolEvent({ toolName: 'fetchAirQuality', success: true,  latencyMs: 650 });
  recordToolEvent({ toolName: 'getGroqCompletion', success: true, latencyMs: 420 });
  recordToolEvent({ toolName: 'getGroqCompletion', success: false, latencyMs: 1200, error: 'timeout' });
}

// ─── MAIN DASHBOARD ──────────────────────────────────────────────────────────
export default function LLMDashboard() {
  const [metrics, setMetrics]     = useState(null);
  const [activeTab, setActiveTab] = useState('accuracy');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [demoLoaded, setDemoLoaded] = useState(false);

  const refresh = useCallback(() => setMetrics(getAllMetrics()), []);

  // Auto-seed demo data on first mount if no real interactions exist
  useEffect(() => {
    const initial = getAllMetrics();
    if (initial.summary.totalInteractions === 0 && !demoLoaded) {
      seedDemoData();
      setDemoLoaded(true);
    }
    refresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [refresh, autoRefresh]);

  const hasData = metrics && metrics.summary.totalInteractions > 0;

  function handleDemo() { seedDemoData(); setDemoLoaded(true); refresh(); }
  function handleReset() { resetMetrics(); setDemoLoaded(false); refresh(); }

  if (!metrics) return null;

  const { summary, accuracy, rag, agentic, safety, performance, multiAgent, recentInteractions } = metrics;

  // ── Radar data for accuracy ──────────────────────────────────────
  const radarData = [
    { metric: 'Accuracy',    value: Math.round((accuracy.accuracy || 0) * 100) },
    { metric: 'Precision',   value: Math.round((accuracy.precision || 0) * 100) },
    { metric: 'Recall',      value: Math.round((accuracy.recall || 0) * 100) },
    { metric: 'F1 Score',    value: Math.round((accuracy.f1Score || 0) * 100) },
    { metric: 'ROUGE',       value: Math.round((accuracy.rouge || 0) * 100) },
    { metric: 'BLEU',        value: Math.round((accuracy.bleu || 0) * 100) },
    { metric: 'Sem. Sim.',   value: Math.round((accuracy.semanticSimilarity || 0) * 100) },
  ];

  // ── Bar data for RAG ─────────────────────────────────────────────
  const ragBarData = [
    { name: 'Ctx Precision', value: Math.round((rag.contextPrecision || 0) * 100) },
    { name: 'Ctx Recall',    value: Math.round((rag.contextRecall || 0) * 100) },
    { name: 'Faithfulness',  value: Math.round((rag.faithfulness || 0) * 100) },
    { name: 'Ans. Relevancy',value: Math.round((rag.answerRelevancy || 0) * 100) },
    { name: 'Ctx Relevancy', value: Math.round((rag.contextRelevancy || 0) * 100) },
    { name: 'Groundedness',  value: Math.round((rag.groundedness || 0) * 100) },
  ];
  const ragColors = ['#29B6F6','#26C6DA','#4CAF50','#8BC34A','#AB47BC','#66BB6A'];

  // ── Safety bar data ───────────────────────────────────────────────
  const safetyBarData = [
    { name: 'Hallucination', value: Math.round((safety.hallucinationRate || 0) * 100), bad: true },
    { name: 'Toxicity',      value: Math.round((safety.toxicityScore || 0) * 100), bad: true },
    { name: 'Bias',          value: Math.round((safety.biasScore || 0) * 100), bad: true },
    { name: 'PII Leak',      value: Math.round((safety.piiLeakageRate || 0) * 100), bad: true },
    { name: 'Policy Viol.',  value: Math.round((safety.policyViolationRate || 0) * 100), bad: true },
    { name: 'Inj. Resistance', value: Math.round((safety.promptInjectionResistance || 0) * 100), bad: false },
  ];

  const TABS = [
    { id: 'accuracy',    label: '🎯 Accuracy & Quality' },
    { id: 'rag',         label: '📚 RAG Evaluation' },
    { id: 'agentic',     label: '🤖 Agentic AI' },
    { id: 'safety',      label: '🛡️ Safety & Guardrails' },
    { id: 'performance', label: '⚡ Performance & Cost' },
    { id: 'multiagent',  label: '🤝 Multi-Agent' },
    { id: 'recent',      label: '🕐 Recent Interactions' },
  ];

  return (
    <div className="llm-dashboard">
      <div className="container">

        {/* Header */}
        <div className="section-title">
          <h2>📈 LLM Agent Evaluation Dashboard</h2>
          <p>Real-time metrics across 6 evaluation categories — Accuracy, RAG, Agentic, Safety, Performance &amp; Multi-Agent.</p>
        </div>

        {/* Demo data notice */}
        {demoLoaded && (
          <div className="glass-card llm-demo-banner">
            <span className="demo-banner-icon">⚡</span>
            <div>
              <strong style={{ color: '#8DD8FF' }}>Demo Data Loaded</strong>
              <p style={{ fontSize: '0.82rem', color: '#8BA8C4', marginTop: 2 }}>
                Showing 8 sample AI interactions with simulated guardrail events and tool calls.
                Use the <strong style={{ color: '#E1EDF5' }}>AI Assistant</strong> tab to generate real metrics — they update here automatically.
              </p>
            </div>
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', flexShrink: 0 }} onClick={handleReset}>
              Clear Demo
            </button>
          </div>
        )}

        {/* Controls */}
        <div className="dash-controls">
          <button className="btn btn-primary btn-sm" onClick={refresh}>🔄 Refresh</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setAutoRefresh(!autoRefresh)}>
            {autoRefresh ? '⏸ Pause Auto-refresh' : '▶ Resume Auto-refresh'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleDemo}>⚡ Reload Demo</button>
          <button className="btn btn-ghost btn-sm" onClick={handleReset}>🗑 Reset</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {autoRefresh && <span className="dash-live-dot" />}
            <span className="dash-last-updated">
              Last updated: {new Date(summary.lastUpdated).toLocaleTimeString()}
            </span>
          </div>
        </div>

        {/* Summary banner */}
        <div className="dash-summary-row">
          {[
            { label: 'Total Interactions', value: summary.totalInteractions, icon: '💬' },
            { label: 'Agent Events',        value: summary.totalAgentEvents,   icon: '🤖' },
            { label: 'Tool Calls',          value: summary.totalToolCalls,     icon: '🔧' },
            { label: 'Safety Checks',       value: summary.totalSafetyChecks,  icon: '🛡️' },
            { label: 'Guardrail Blocks',    value: safety.totalBlocked || 0,   icon: '🚫' },
          ].map((s) => (
            <div key={s.label} className="summary-stat glass-card">
              <div style={{ fontSize: '1.4rem', marginBottom: 6 }}>{s.icon}</div>
              <div className="summary-stat-value">{s.value}</div>
              <div className="summary-stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        {/* No data state */}
        {!hasData && <NoData onDemo={handleDemo} />}

        {hasData && (
          <>
            {/* Tab navigation */}
            <div className="tab-nav" style={{ marginBottom: 28, flexWrap: 'wrap' }}>
              {TABS.map((t) => (
                <button key={t.id} className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ═══ TAB 1: ACCURACY & QUALITY ═══ */}
            {activeTab === 'accuracy' && (
              <div className="dash-category fade-in">
                <CategoryHeader icon="🎯" title="Accuracy & Quality Metrics"
                  desc={`${summary.totalInteractions} interactions evaluated`} />
                <div className="metrics-grid-4">
                  <MetricCard label="Accuracy"           value={accuracy.accuracy}           sub="Overall correctness" />
                  <MetricCard label="Precision"          value={accuracy.precision}           sub="Relevant results correct" />
                  <MetricCard label="Recall"             value={accuracy.recall}              sub="Relevant results retrieved" />
                  <MetricCard label="F1 Score"           value={accuracy.f1Score}             sub="Harmonic mean P/R" />
                  <MetricCard label="Exact Match"        value={accuracy.exactMatch}          sub="Identical to reference" />
                  <MetricCard label="Semantic Similarity"value={accuracy.semanticSimilarity}  sub="Jaccard word-set overlap" />
                  <MetricCard label="ROUGE Score"        value={accuracy.rouge}               sub="Reference text overlap" />
                  <MetricCard label="BLEU Score"         value={accuracy.bleu}                sub="N-gram precision" />
                </div>
                <div className="dash-chart-card">
                  <h4>Accuracy Metrics Radar</h4>
                  <p>Normalised 0–100 scale across all quality dimensions</p>
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                      <PolarGrid stroke="rgba(141,216,255,0.1)" />
                      <PolarAngleAxis dataKey="metric" tick={{ fill: '#8BA8C4', fontSize: 11 }} />
                      <PolarRadiusAxis domain={[0, 100]} tick={{ fill: '#8BA8C4', fontSize: 10 }} />
                      <Radar name="Score" dataKey="value" stroke="#8DD8FF" fill="#8DD8FF" fillOpacity={0.2} dot={{ fill: '#8DD8FF', r: 3 }} />
                      <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v) => [`${v}%`, 'Score']} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* ═══ TAB 2: RAG EVALUATION ═══ */}
            {activeTab === 'rag' && (
              <div className="dash-category fade-in">
                <CategoryHeader icon="📚" title="RAG Evaluation Metrics"
                  desc="Retrieval-Augmented Generation quality" />
                <div className="metrics-grid-3">
                  <MetricCard label="Context Precision"  value={rag.contextPrecision}  sub="Retrieved docs relevance" />
                  <MetricCard label="Context Recall"     value={rag.contextRecall}      sub="Relevant info retrieved" />
                  <MetricCard label="Faithfulness"       value={rag.faithfulness}       sub="Answer supported by context" />
                  <MetricCard label="Answer Relevancy"   value={rag.answerRelevancy}    sub="Answer addresses query" />
                  <MetricCard label="Context Relevancy"  value={rag.contextRelevancy}   sub="Context quality" />
                  <MetricCard label="Groundedness"       value={rag.groundedness}       sub="Grounded in source data" />
                </div>
                <div className="dash-chart-card">
                  <h4>RAG Metrics Comparison</h4>
                  <p>All scores on 0–100% scale</p>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={ragBarData} barSize={40}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(141,216,255,0.08)" />
                      <XAxis dataKey="name" tick={{ fill: '#8BA8C4', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fill: '#8BA8C4', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v) => [`${v}%`]} />
                      <Bar dataKey="value" name="Score %" radius={[6,6,0,0]}>
                        {ragBarData.map((_, i) => <Cell key={i} fill={ragColors[i % ragColors.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* ═══ TAB 3: AGENTIC AI ═══ */}
            {activeTab === 'agentic' && (
              <div className="dash-category fade-in">
                <CategoryHeader icon="🤖" title="Agentic AI Evaluation Metrics"
                  desc={`${agentic.totalAgentEvents} agent events`} />
                <div className="metrics-grid-4">
                  <MetricCard label="Task Completion Rate"        value={agentic.taskCompletionRate}       sub="% tasks finished" />
                  <MetricCard label="Goal Achievement"            value={agentic.goalAchievementRate}      sub="Objective met" />
                  <MetricCard label="Tool Call Accuracy"          value={agentic.toolCallAccuracy}         sub="Correct tool selected" />
                  <MetricCard label="Tool Execution Success"      value={agentic.toolExecutionSuccessRate} sub="Successful tool runs" />
                  <MetricCard label="Planning Accuracy"           value={agentic.planningAccuracy}         sub="Plan matched outcome" />
                  <MetricCard label="Reasoning Quality"           value={agentic.reasoningQuality}         sub="Logical consistency" />
                  <MetricCard label="Agent Coordination"          value={agentic.agentCoordinationScore}   sub="Multi-agent cooperation" />
                  <MetricCard label="Handoff Accuracy"            value={agentic.handoffAccuracy}          sub="Task transfers correct" />
                </div>
                <div className="metrics-grid-2" style={{ marginTop: 14 }}>
                  <MetricCard label="Loops Detected"   value={agentic.loopsDetected}   format="raw" sub="Infinite loops caught"
                    barValue={agentic.loopsDetected > 0 ? 1 : 0} barColor="#FF5722" />
                  <MetricCard label="Total Agent Events" value={agentic.totalAgentEvents} format="raw" sub="Across all agents"
                    barValue={Math.min(1, agentic.totalAgentEvents / 20)} barColor="#29B6F6" />
                </div>
              </div>
            )}

            {/* ═══ TAB 4: SAFETY & GUARDRAILS ═══ */}
            {activeTab === 'safety' && (
              <div className="dash-category fade-in">
                <CategoryHeader icon="🛡️" title="Safety & Guardrail Metrics"
                  desc={`${safety.totalChecks} checks · ${safety.totalBlocked} blocked`} />
                <div className="metrics-grid-4">
                  <MetricCard label="Hallucination Rate"          value={safety.hallucinationRate}
                    sub="Unsupported responses" barColor={safety.hallucinationRate > 0.1 ? '#FF5722' : '#4CAF50'} />
                  <MetricCard label="Toxicity Score"              value={safety.toxicityScore}
                    sub="Harmful content rate" barColor={safety.toxicityScore > 0.05 ? '#FF5722' : '#4CAF50'} />
                  <MetricCard label="Bias Score"                  value={safety.biasScore}
                    sub="Biased output rate" barColor={safety.biasScore > 0.1 ? '#FFC107' : '#4CAF50'} />
                  <MetricCard label="Prompt Injection Resistance" value={safety.promptInjectionResistance}
                    sub="Injection attempts blocked" />
                  <MetricCard label="PII Leakage Rate"            value={safety.piiLeakageRate}
                    sub="Personal data exposed" barColor={safety.piiLeakageRate > 0 ? '#FF5722' : '#4CAF50'} />
                  <MetricCard label="Policy Violation Rate"       value={safety.policyViolationRate}
                    sub="Policy breaches" barColor={safety.policyViolationRate > 0.05 ? '#FF5722' : '#4CAF50'} />
                  <MetricCard label="Guardrail Intervention Rate" value={safety.guardrailInterventionRate}
                    sub="Inputs/outputs blocked" />
                  <MetricCard label="Total Blocked"               value={safety.totalBlocked} format="raw"
                    sub="Hard blocks by guardrails" barValue={Math.min(1, safety.totalBlocked / 10)} barColor="#FF7043" />
                </div>
                <div className="dash-chart-card">
                  <h4>Safety Metrics Overview</h4>
                  <p>Lower is better for risk metrics; higher is better for resistance</p>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={safetyBarData} barSize={36}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(141,216,255,0.08)" />
                      <XAxis dataKey="name" tick={{ fill: '#8BA8C4', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fill: '#8BA8C4', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v) => [`${v}%`]} />
                      <Bar dataKey="value" name="%" radius={[6,6,0,0]}>
                        {safetyBarData.map((entry, i) => (
                          <Cell key={i} fill={entry.bad ? (entry.value > 10 ? '#FF5722' : '#FFC107') : '#4CAF50'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* ═══ TAB 5: PERFORMANCE & COST ═══ */}
            {activeTab === 'performance' && (
              <div className="dash-category fade-in">
                <CategoryHeader icon="⚡" title="Performance & Cost Metrics"
                  desc={`${performance.totalRequests} requests`} />
                <div className="metrics-grid-4">
                  <MetricCard label="Avg Response Latency"    value={performance.avgLatencyMs}       format="ms"  sub="Mean end-to-end" barValue={Math.min(1, performance.avgLatencyMs / 2000)} barColor="#29B6F6" />
                  <MetricCard label="P95 Latency"             value={performance.p95LatencyMs}       format="ms"  sub="95th percentile" barValue={Math.min(1, performance.p95LatencyMs / 3000)} barColor="#AB47BC" />
                  <MetricCard label="Avg Time to First Token" value={performance.avgTtftMs}          format="ms"  sub="TTFT" barValue={Math.min(1, performance.avgTtftMs / 500)} barColor="#8DD8FF" />
                  <MetricCard label="Tokens / Second"         value={performance.tokensPerSecond}    format="raw" sub="Generation speed" barValue={Math.min(1, performance.tokensPerSecond / 100)} barColor="#4CAF50" />
                  <MetricCard label="Total Input Tokens"      value={performance.totalInputTokens}   format="raw" sub="Sent to LLM" barValue={Math.min(1, performance.totalInputTokens / 5000)} barColor="#66BB6A" />
                  <MetricCard label="Total Output Tokens"     value={performance.totalOutputTokens}  format="raw" sub="Generated" barValue={Math.min(1, performance.totalOutputTokens / 5000)} barColor="#FFA726" />
                  <MetricCard label="Total Cost (USD)"        value={performance.totalCostUsd}       format="usd" sub="Session total" barValue={Math.min(1, performance.totalCostUsd / 0.10)} barColor="#EF5350" />
                  <MetricCard label="Cost / Successful Task"  value={performance.costPerSuccessfulTask} format="usd" sub="Per completed task" barValue={Math.min(1, performance.costPerSuccessfulTask / 0.01)} barColor="#EF5350" />
                  <MetricCard label="Throughput (RPM)"        value={performance.throughputRpm}      format="raw" sub="Requests per min" barValue={Math.min(1, performance.throughputRpm / 30)} barColor="#29B6F6" />
                  <MetricCard label="Error Rate"              value={performance.errorRate}          sub="Failed requests" barColor={performance.errorRate > 0.1 ? '#FF5722' : '#4CAF50'} />
                  <MetricCard label="Total Requests"          value={performance.totalRequests}      format="raw" sub="All requests" barValue={Math.min(1, performance.totalRequests / 50)} barColor="#8DD8FF" />
                  <MetricCard label="Successful Requests"     value={performance.successfulRequests} format="raw" sub="No errors" barValue={performance.totalRequests ? performance.successfulRequests / performance.totalRequests : 0} barColor="#4CAF50" />
                </div>
              </div>
            )}

            {/* ═══ TAB 6: MULTI-AGENT ═══ */}
            {activeTab === 'multiagent' && (
              <div className="dash-category fade-in">
                <CategoryHeader icon="🤝" title="Multi-Agent System Evaluation"
                  desc={`${multiAgent.numberOfAgents} active agents`} />
                <div className="metrics-grid-4">
                  <MetricCard label="E2E Workflow Completion"      value={multiAgent.endToEndWorkflowCompletion}   sub="Full pipeline success" />
                  <MetricCard label="Supervisor Agent Accuracy"    value={multiAgent.supervisorAgentAccuracy}      sub="chatAssistantAgent" />
                  <MetricCard label="Conflict Resolution Rate"     value={multiAgent.conflictResolutionRate}       sub="Inter-agent conflicts" />
                  <MetricCard label="Inter-Agent Consistency"      value={multiAgent.interAgentConsistency}        sub="Output agreement" />
                  <MetricCard label="Task Distribution Efficiency" value={multiAgent.taskDistributionEfficiency}   sub="Load balance" />
                  <MetricCard label="Agent Communication Success"  value={multiAgent.agentCommunicationSuccess}   sub="Msg delivery rate" />
                  <MetricCard label="Total Execution Time"         value={multiAgent.totalExecutionMs}            format="ms" sub="All agents combined" barValue={Math.min(1, multiAgent.totalExecutionMs / 10000)} barColor="#29B6F6" />
                  <MetricCard label="Total Cost"                   value={multiAgent.totalCostUsd}                format="usd" sub="All agents combined" barValue={Math.min(1, multiAgent.totalCostUsd / 0.1)} barColor="#EF5350" />
                </div>

                {/* Per-agent breakdown */}
                {multiAgent.perAgentStats?.length > 0 && (
                  <div className="dash-chart-card">
                    <h4>Individual Agent Performance</h4>
                    <p>Accuracy and success rate per registered agent</p>
                    <table className="agent-table">
                      <thead>
                        <tr>
                          <th>Agent</th>
                          <th>Total Tasks</th>
                          <th>Success Rate</th>
                          <th>Avg Latency</th>
                          <th>Accuracy</th>
                        </tr>
                      </thead>
                      <tbody>
                        {multiAgent.perAgentStats.map((a) => (
                          <tr key={a.agentName}>
                            <td>🤖 {a.agentName}</td>
                            <td>{a.totalTasks}</td>
                            <td style={{ color: scoreColor(a.successRate) }}>{pct(a.successRate)}</td>
                            <td>{ms(a.avgLatencyMs)}</td>
                            <td style={{ color: scoreColor(a.accuracy) }}>{pct(a.accuracy)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ═══ TAB 7: RECENT INTERACTIONS ═══ */}
            {activeTab === 'recent' && (
              <div className="dash-category fade-in">
                <CategoryHeader icon="🕐" title="Recent Interactions"
                  desc={`Last ${recentInteractions.length} of ${summary.totalInteractions}`} />
                {recentInteractions.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>No interactions yet.</p>
                ) : (
                  <div className="dash-chart-card" style={{ overflowX: 'auto' }}>
                    <table className="interactions-table">
                      <thead>
                        <tr>
                          <th>#</th><th>Query</th><th>Response</th>
                          <th>Agent</th><th>Accuracy</th><th>F1</th>
                          <th>Latency</th><th>Tokens</th><th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentInteractions.map((r, i) => (
                          <tr key={r.id}>
                            <td>{r.id}</td>
                            <td className="q-cell" title={r.query}>{r.query}</td>
                            <td className="r-cell" title={r.response}>{r.response}</td>
                            <td style={{ fontSize: '0.72rem', color: '#8BA8C4' }}>{r.agentName?.replace('Agent', '')}</td>
                            <td style={{ color: scoreColor(r.accuracy) }}>{pct(r.accuracy)}</td>
                            <td style={{ color: scoreColor(r.f1) }}>{num(r.f1)}</td>
                            <td>{ms(r.latencyMs)}</td>
                            <td>{(r.inputTokens || 0) + (r.outputTokens || 0)}</td>
                            <td>
                              <span style={{
                                color: r.error ? '#FF5722' : '#4CAF50',
                                fontSize: '0.72rem', fontWeight: 700,
                              }}>
                                {r.error ? '❌ Error' : '✅ OK'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
