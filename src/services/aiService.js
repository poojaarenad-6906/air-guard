/**
 * AI AirGuard — Multi-Provider AI Service
 *
 * Supported providers (checked in priority order):
 *   1. IBM watsonx.ai  — VITE_WATSONX_API_KEY + VITE_WATSONX_PROJECT_ID
 *   2. Google Gemini   — VITE_GEMINI_API_KEY
 *   3. Groq            — VITE_GROQ_API_KEY
 *   4. Demo            — built-in rule-based fallback (no key required)
 *
 * Each provider exports a single async `generate(messages, cityContext)` function
 * that returns a plain text string.  The active provider is exported as
 * `activeProvider` so the UI can display which backend is in use.
 */

// ── Read env vars (Vite exposes only VITE_* prefixed vars) ─────────────────

function envStr(key) {
  const v = import.meta.env[key] || '';
  // Treat blank / placeholder strings as "not set"
  return v.trim().length > 6 && !v.includes('your_') ? v.trim() : '';
}

// IBM watsonx.ai
const WX_API_KEY    = envStr('VITE_WATSONX_API_KEY');
const WX_PROJECT_ID = envStr('VITE_WATSONX_PROJECT_ID');
const WX_BASE_URL   = (import.meta.env.VITE_WATSONX_URL || 'https://us-south.ml.cloud.ibm.com').trim();
const WX_MODEL      = (import.meta.env.VITE_WATSONX_MODEL_ID || 'ibm/granite-13b-instruct-v2').trim();

// Google Gemini
const GEMINI_KEY    = envStr('VITE_GEMINI_API_KEY');
const GEMINI_MODEL  = (import.meta.env.VITE_GEMINI_MODEL_ID || 'gemini-1.5-flash').trim();

// Groq
const GROQ_KEY      = envStr('VITE_GROQ_API_KEY');
const GROQ_MODEL    = (import.meta.env.VITE_GROQ_MODEL_ID || 'llama3-8b-8192').trim();
const GROQ_URL      = 'https://api.groq.com/openai/v1/chat/completions';

// ── Provider detection ──────────────────────────────────────────────────────

export const PROVIDERS = {
  WATSONX: 'watsonx',
  GEMINI:  'gemini',
  GROQ:    'groq',
  DEMO:    'demo',
};

/** Which provider is active right now (evaluated once at module load). */
export const activeProvider =
  (WX_API_KEY && WX_PROJECT_ID) ? PROVIDERS.WATSONX :
  GEMINI_KEY                     ? PROVIDERS.GEMINI  :
  GROQ_KEY                       ? PROVIDERS.GROQ    :
                                   PROVIDERS.DEMO;

/** Human-readable label + icon for the active provider. */
export const providerMeta = {
  [PROVIDERS.WATSONX]: { label: 'IBM watsonx.ai',   icon: '🔵', model: WX_MODEL,     color: '#4CAF50' },
  [PROVIDERS.GEMINI]:  { label: 'Google Gemini',    icon: '💎', model: GEMINI_MODEL,  color: '#4CAF50' },
  [PROVIDERS.GROQ]:    { label: 'Groq AI',          icon: '⚡', model: GROQ_MODEL,    color: '#4CAF50' },
  [PROVIDERS.DEMO]:    { label: 'Demo (rule-based)', icon: '🔧', model: 'built-in',   color: '#FFCA28' },
};

// ── Shared system prompt builder ────────────────────────────────────────────

function buildSystemPrompt(cityContext) {
  return `You are AI AirGuard, an expert air quality assistant. You help people understand air pollution, AQI levels, health precautions, and make informed daily decisions.${
    cityContext
      ? ` The user is currently viewing data for ${cityContext.city} (AQI ${cityContext.aqi} — ${cityContext.aqiLabel}).`
      : ''
  }
Keep answers concise (2–4 sentences or a short list). Always note that health recommendations are general guidance only, not medical advice.`;
}

// ── IBM watsonx.ai ──────────────────────────────────────────────────────────

/**
 * watsonx.ai uses a two-step flow:
 *   1. Exchange IBM Cloud API key for a short-lived IAM bearer token.
 *   2. POST to the text-generation endpoint.
 *
 * NOTE: The IAM token endpoint does NOT support CORS from a browser, so in
 * a production deployment this call must be proxied through a backend (e.g.
 * a Netlify/Vercel function).  In development, Vite's proxy config or a
 * local CORS proxy can be used.  If the token fetch fails we throw clearly
 * so the caller can fall back to the next provider.
 */
async function getWatsonxToken() {
  const res = await fetch('https://iam.cloud.ibm.com/identity/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aibm%3Aparams%3Aoauth%3Agrant-type%3Aapikey&apikey=${encodeURIComponent(WX_API_KEY)}`,
  });
  if (!res.ok) throw new Error(`watsonx IAM token error ${res.status}`);
  const d = await res.json();
  return d.access_token;
}

async function getWatsonxResponse(messages, cityContext) {
  const token = await getWatsonxToken();

  // Flatten chat history into a single prompt string (Granite instruction format)
  const systemPrompt = buildSystemPrompt(cityContext);
  const history = messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
    .join('\n');
  const prompt = `${systemPrompt}\n\n${history}\nAssistant:`;

  const url = `${WX_BASE_URL}/ml/v1/text/generation?version=2023-05-29`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model_id: WX_MODEL,
      input: prompt,
      parameters: {
        decoding_method: 'greedy',
        max_new_tokens: 300,
        stop_sequences: ['\nUser:'],
      },
      project_id: WX_PROJECT_ID,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.errors?.[0]?.message || `watsonx API error ${res.status}`);
  }
  const d = await res.json();
  return (d.results?.[0]?.generated_text || '').trim();
}

// ── Google Gemini ───────────────────────────────────────────────────────────

async function getGeminiResponse(messages, cityContext) {
  const systemPrompt = buildSystemPrompt(cityContext);

  // Gemini uses a contents array; we prepend the system prompt as the first
  // user turn followed by a model acknowledgement, then the real history.
  const contents = [
    { role: 'user',  parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: 'Understood. I am ready to help.' }] },
    ...messages.map((m) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }],
    })),
  ];

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: { maxOutputTokens: 300, temperature: 0.7 },
      safetySettings: [
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Gemini API error ${res.status}`);
  }
  const d = await res.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    || 'Sorry, Gemini did not return a response.';
}

// ── Groq ────────────────────────────────────────────────────────────────────

async function getGroqResponse(messages, cityContext) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: buildSystemPrompt(cityContext) },
        ...messages.map((m) => ({ role: m.role, content: m.text })),
      ],
      max_tokens: 300,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq API error ${res.status}`);
  }
  const d = await res.json();
  return d.choices?.[0]?.message?.content || 'Sorry, Groq did not return a response.';
}

// ── Main entry-point ────────────────────────────────────────────────────────

/**
 * Call the active AI provider with the full chat history and optional city
 * context.  Returns a plain text string.  Throws on hard API errors so the
 * caller can catch and fall back to the rule-based demo.
 *
 * @param {Array<{role: 'user'|'assistant', text: string}>} messages
 * @param {{ city: string, aqi: number, aqiLabel: string } | null} cityContext
 * @returns {Promise<string>}
 */
export async function generate(messages, cityContext) {
  switch (activeProvider) {
    case PROVIDERS.WATSONX:
      return getWatsonxResponse(messages, cityContext);
    case PROVIDERS.GEMINI:
      return getGeminiResponse(messages, cityContext);
    case PROVIDERS.GROQ:
      return getGroqResponse(messages, cityContext);
    default:
      // Demo — simulate network delay and return null so caller uses rules
      await new Promise((r) => setTimeout(r, 500 + Math.random() * 400));
      return null;
  }
}
