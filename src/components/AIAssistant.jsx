zzzzzzzzzzimport { useState, useRef, useEffect } from 'react';
import '../styles/assistant.css';
import GuardrailStatus from './GuardrailStatus.jsx';
import { GuardrailEngine } from '../guardrails/index.js';
import { metricsEngine } from '../metrics/metricsEngine.js';
import { generate, activeProvider, providerMeta, PROVIDERS } from '../services/aiService.js';

// ── Rule-based fallback (demo mode & error recovery) ───────────────────────
const RULES = [
  { patterns: [/aqi/i, /air quality index/i],
    response: 'The **Air Quality Index (AQI)** is a scale from 1 (Good) to 5 (Very Poor) used to measure air cleanliness. Higher values indicate worse air quality and greater health risks.' },
  { patterns: [/pm\s*2\.?5/i],
    response: '**PM2.5** are fine particles ≤2.5 μm that penetrate deep into lungs and bloodstream. WHO safe guideline: 15 μg/m³ annual mean.' },
  { patterns: [/pm\s*10/i],
    response: '**PM10** are particles ≤10 μm including dust and pollen. They irritate the respiratory tract. WHO guideline: 45 μg/m³ annual mean.' },
  { patterns: [/no2|nitrogen/i],
    response: '**NO₂** is emitted by vehicles and power plants. It irritates airways and contributes to smog and asthma.' },
  { patterns: [/o3|ozone/i],
    response: '**Ground-level Ozone (O₃)** forms from sunlight reacting with NO₂ and VOCs. It can trigger respiratory problems even at low concentrations.' },
  { patterns: [/co\b|carbon monoxide/i],
    response: '**Carbon Monoxide (CO)** is odourless and produced by incomplete combustion. It reduces the blood\'s ability to carry oxygen.' },
  { patterns: [/so2|sulfur|sulphur/i],
    response: '**SO₂** comes from burning sulphur-containing fuels. It causes breathing difficulties and contributes to acid rain.' },
  { patterns: [/mask|n95/i],
    response: 'For AQI 4–5, wear an **N95 or KN95 respirator** — they filter 95%+ of fine particles. Surgical masks offer limited protection.' },
  { patterns: [/outdoor|exercise|run|walk|sport/i],
    response: 'Outdoor exercise guide:\n- **AQI 1–2:** Exercise freely.\n- **AQI 3:** Sensitive groups limit vigorous exercise.\n- **AQI 4:** Reduce duration and intensity.\n- **AQI 5:** Avoid all outdoor exercise.' },
  { patterns: [/child|children|kid/i],
    response: 'Children\'s lungs are still developing — they\'re more vulnerable to pollution. On Poor/Very Poor AQI days, keep children indoors and avoid roads.' },
  { patterns: [/asthma|respiratory|lung|breathing/i],
    response: 'People with respiratory conditions should carry prescribed inhalers, use air purifiers, and avoid peak traffic hours (7–9 AM, 5–7 PM).' },
  { patterns: [/air purifier|purifier|indoor air/i],
    response: '**HEPA filter air purifiers** remove PM2.5 and PM10 effectively. Place them in bedrooms and living areas; run continuously on bad air days.' },
  { patterns: [/reduce|prevent|protect|tips/i],
    response: '1. Check AQI daily.\n2. Use indoor air purifiers.\n3. Wear N95 masks outdoors.\n4. Use public transport.\n5. Avoid burning waste.' },
  { patterns: [/source|cause|reason|why/i],
    response: 'Main urban pollution sources:\n- **Vehicles** (PM2.5, NO₂, CO)\n- **Industry** (SO₂, PM10)\n- **Construction** (PM10)\n- **Agriculture** (NH₃, PM2.5)\n- **Wildfires** (CO, PM2.5)' },
  { patterns: [/watsonx|ibm|granite/i],
    response: 'This assistant can be powered by **IBM watsonx.ai** using Granite models. Set `VITE_WATSONX_API_KEY` and `VITE_WATSONX_PROJECT_ID` in your `.env` file to activate it.' },
  { patterns: [/gemini|google/i],
    response: 'This assistant supports **Google Gemini** (gemini-1.5-flash / pro). Set `VITE_GEMINI_API_KEY` in your `.env` file to activate it.' },
  { patterns: [/groq|llama/i],
    response: 'This assistant supports **Groq** running llama3-8b-8192. Set `VITE_GROQ_API_KEY` in your `.env` file to activate it.' },
  { patterns: [/hello|hi|hey|greet/i],
    response: 'Hello! I\'m the **AI AirGuard Assistant** 🌬️. Ask me about AQI, PM2.5, PM10, health precautions, or outdoor safety.' },
  { patterns: [/thank|thanks/i],
    response: 'You\'re welcome! Stay safe and breathe clean air. 🌿' },
];

const SUGGESTIONS = [
  'What is AQI?', 'Explain PM2.5', 'When should I wear a mask?',
  'Is it safe to exercise outdoors?', 'How can I improve indoor air quality?', 'What causes air pollution?',
];

function parseMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');
}

function getRuleResponse(input) {
  const lower = input.toLowerCase();
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(lower))) return rule.response;
  }
  return 'I\'m not sure about that. Try asking about **AQI**, **PM2.5**, **masks**, **outdoor exercise**, or **air purifiers**.';
}

// ── Status bar helper ───────────────────────────────────────────────────────

function ProviderBadge({ provider }) {
  const meta = providerMeta[provider];
  const isDemo = provider === PROVIDERS.DEMO;
  return (
    <span
      className="demo-notice"
      style={{
        background: isDemo ? 'rgba(255,202,40,0.10)' : 'rgba(76,175,80,0.10)',
        border: `1px solid ${isDemo ? 'rgba(255,202,40,0.30)' : 'rgba(76,175,80,0.32)'}`,
        color: isDemo ? '#FFCA28' : '#4CAF50',
      }}
    >
      {meta.icon} {meta.label} Active
      {!isDemo && (
        <span style={{ opacity: 0.65, fontWeight: 400, marginLeft: 6 }}>
          · {meta.model}
        </span>
      )}
      &nbsp;· 🛡️ All 9 Guardrails Active
    </span>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export default function AIAssistant({ data }) {
  const meta        = providerMeta[activeProvider];
  const isLive      = activeProvider !== PROVIDERS.DEMO;
  const avatarIcon  = isLive ? meta.icon : '🌬️';

  const welcomeText = isLive
    ? `Hi! I'm the **AI AirGuard Assistant** ${meta.icon} — powered by **${meta.label}** with Guardrails.\n\nAsk me anything about air quality, pollution, or health precautions.${data ? `\n\nCurrently viewing: **${data.city}** (AQI ${data.aqi} — ${data.aqiLabel})` : ''}`
    : `Hi! I'm the **AI AirGuard Assistant** 🌬️ — demo assistant with Guardrails active.\n\nI can answer questions about AQI, PM2.5, health precautions, and outdoor safety.${data ? `\n\nCurrently viewing: **${data.city}** (AQI ${data.aqi} — ${data.aqiLabel})` : ''}`;

  const [messages,        setMessages]        = useState([{ role: 'assistant', text: welcomeText }]);
  const [input,           setInput]           = useState('');
  const [loading,         setLoading]         = useState(false);
  const [aiError,         setAiError]         = useState('');
  const [lastGuardResult, setLastGuardResult] = useState(null);
  const bottomRef  = useRef(null);
  const historyRef = useRef([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(text) {
    const raw = (text || input).trim();
    if (!raw) return;

    const t0 = Date.now();

    // ── GUARDRAIL: validate input ─────────────────────────────────────
    const guardResult = GuardrailEngine.validateInput(raw, 'chat');
    setLastGuardResult(guardResult);

    const hasInjection = guardResult.allViolations.some((v) => v.type === 'PROMPT_INJECTION');
    const hasPII       = guardResult.allViolations.some((v) => v.type === 'PII_DETECTED');
    metricsEngine.recordSafety({
      promptInjection: hasInjection,
      piiDetected:     hasPII,
      blocked:         !guardResult.passed,
      policyViolation: !guardResult.passed,
    });

    if (!guardResult.passed) {
      setMessages((prev) => [
        ...prev,
        { role: 'user', text: raw },
        { role: 'assistant', text: `🛡️ **Guardrail blocked this message**\n\n${guardResult.primaryMessage}`, isGuardrailBlock: true },
      ]);
      setInput('');
      return;
    }

    const piiWarning = guardResult.allViolations.find((v) => v.type === 'PII_DETECTED');

    const userMsg = { role: 'user', text: guardResult.sanitized };
    setMessages((prev) => [...prev, userMsg]);
    historyRef.current = [...historyRef.current, userMsg];
    setInput('');
    setLoading(true);
    setAiError('');

    try {
      const ttft0 = Date.now();

      // ── Call active provider (returns null in demo mode) ──────────
      let rawResponse = await generate(historyRef.current, data);

      // Demo mode → use rule engine
      if (rawResponse === null) {
        rawResponse = getRuleResponse(guardResult.sanitized);
      }

      const ttftMs = Date.now() - ttft0;

      // ── GUARDRAIL: validate output ────────────────────────────────
      const outResult = GuardrailEngine.validateOutput(rawResponse, {
        aqiLevel:        data?.aqi,
        isDemo:          data?.isDemo,
        hasHealthAdvice: /health|mask|exercise|asthma|lung|outdoor/i.test(rawResponse),
      });
      setLastGuardResult(outResult);

      metricsEngine.recordSafety({
        hallucination: outResult.allViolations?.some((v) => v.type === 'HALLUCINATION_DETECTED'),
        toxic:         outResult.allViolations?.some((v) => v.type === 'TOXIC_OUTPUT'),
        blocked:       !outResult.passed,
      });

      const latencyMs    = Date.now() - t0;
      const inputTokens  = Math.ceil(guardResult.sanitized.length / 4);
      const outputTokens = Math.ceil((outResult.text || '').length / 4);

      metricsEngine.record({
        query:        guardResult.sanitized,
        response:     outResult.text,
        latencyMs,
        ttftMs,
        inputTokens,
        outputTokens,
        costUsd:      ((inputTokens + outputTokens) / 1000) * 0.0001,
        error:        false,
        agentName:    activeProvider === PROVIDERS.DEMO ? 'healthAdvisoryAgent' : 'chatAssistantAgent',
      });

      const finalText = outResult.text
        + (outResult.disclaimer ? `\n\n${outResult.disclaimer}` : '')
        + (piiWarning ? '\n\n⚠️ *Note: Your message appeared to contain personal information. Please avoid sharing personal details.*' : '');

      const assistantMsg = { role: 'assistant', text: finalText };
      setMessages((prev) => [...prev, assistantMsg]);
      historyRef.current = [...historyRef.current, assistantMsg];

    } catch (err) {
      metricsEngine.record({
        query: guardResult.sanitized, response: '', latencyMs: Date.now() - t0,
        error: true, agentName: 'chatAssistantAgent',
      });
      setAiError(`${meta.label} error: ${err.message} — showing local answer.`);
      // Always fall back to rule engine so the user never sees a blank response
      const fallback     = getRuleResponse(guardResult.sanitized);
      const assistantMsg = { role: 'assistant', text: fallback };
      setMessages((prev) => [...prev, assistantMsg]);
      historyRef.current = [...historyRef.current, assistantMsg];
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="section fade-in">
      <div className="container">
        <div className="section-title">
          <h2>🤖 AI Pollution Assistant</h2>
          <p>Ask questions about air quality, pollution, health precautions, and more.</p>
        </div>

        {/* ── Guardrail Status Dashboard ── */}
        <GuardrailStatus lastResult={lastGuardResult} />

        <div className="glass-card chat-wrapper">
          {/* Provider status badge */}
          <div className="chat-demo-notice">
            <ProviderBadge provider={activeProvider} />
          </div>

          {/* Messages */}
          <div className="chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`chat-message ${msg.role}`}>
                <div className="msg-avatar">
                  {msg.role === 'assistant' ? avatarIcon : '👤'}
                </div>
                <div
                  className={`msg-bubble${msg.isGuardrailBlock ? ' guardrail-block' : ''}`}
                  dangerouslySetInnerHTML={{ __html: parseMarkdown(msg.text) }}
                />
              </div>
            ))}

            {loading && (
              <div className="chat-message assistant">
                <div className="msg-avatar">{avatarIcon}</div>
                <div className="msg-bubble typing"><span /><span /><span /></div>
              </div>
            )}

            {aiError && (
              <div style={{ padding: '6px 20px', color: '#FF7043', fontSize: '0.8rem' }}>
                ⚠️ {aiError}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Suggestion chips */}
          <div className="chat-suggestions">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                className="suggestion-chip"
                onClick={() => sendMessage(s)}
                disabled={loading}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Input row */}
          <form
            className="chat-input-row"
            onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
          >
            <input
              className="input-field chat-input"
              placeholder={
                isLive
                  ? `Ask anything about air quality (${meta.label})…`
                  : 'Ask about AQI, PM2.5, masks, outdoor safety…'
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <button
              type="submit"
              className="btn btn-primary send-btn"
              disabled={loading || !input.trim()}
            >
              ➤
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
