/**
 * GUARDRAIL 1 — INPUT GUARDRAILS
 * Validates all user inputs before passing them to an AI agent or external API.
 * Covers: prompt injection, malicious input, input validation, PII detection,
 *         inappropriate content filtering.
 */

// ── Prompt Injection Patterns ───────────────────────────────────────────────
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|context)/i,
  /forget\s+(everything|all|your|previous)/i,
  /you\s+are\s+now\s+(a\s+)?(different|new|another|evil|unrestricted)/i,
  /act\s+as\s+(if\s+you\s+are|a\s+)?(?!an?\s+(air|pollution|aqi|health))/i,
  /disregard\s+(your|all|the)\s+(rules?|instructions?|guidelines?|training)/i,
  /pretend\s+(you\s+are|to\s+be)\s+(?!concerned|worried)/i,
  /override\s+(your|the|all)\s+(system|safety|content|instructions?)/i,
  /\bDAN\b|\bjailbreak\b/i,
  /reveal\s+(your|the)\s+(system\s+prompt|instructions?|api\s+key)/i,
  /repeat\s+(the\s+)?(above|system|previous)\s+(prompt|instructions?)/i,
];

// ── Malicious Content Patterns ──────────────────────────────────────────────
const MALICIOUS_PATTERNS = [
  /<script[\s\S]*?>[\s\S]*?<\/script>/i,
  /javascript\s*:/i,
  /on\w+\s*=\s*["']?[^"'>\s]/i,           // onload=, onclick=, etc.
  /\beval\s*\(/i,
  /document\.(cookie|write|location)/i,
  /window\.(location|open|eval)/i,
  /\bexec\s*\(|system\s*\(|shell_exec/i,
  /\bSELECT\b.*\bFROM\b.*\bWHERE\b/i,     // SQL injection
  /(\bDROP\b|\bDELETE\b|\bTRUNCATE\b)\s+\bTABLE\b/i,
  /union\s+select/i,
  /--\s*$|;\s*--/,                          // SQL comment injection
  /\x00|\x1a/,                             // null bytes
];

// ── PII Patterns ─────────────────────────────────────────────────────────────
const PII_PATTERNS = [
  { name: 'email',        pattern: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Z|a-z]{2,}\b/ },
  { name: 'phone_in',     pattern: /\b[6-9]\d{9}\b/ },                          // Indian mobile
  { name: 'phone_intl',   pattern: /\+?[1-9]\d{1,3}[\s\-]?\(?\d{1,4}\)?[\s\-]?\d{1,4}[\s\-]?\d{1,9}/ },
  { name: 'credit_card',  pattern: /\b(?:\d[ \-]?){13,16}\b/ },
  { name: 'aadhaar',      pattern: /\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/ },      // Indian Aadhaar
  { name: 'pan',          pattern: /\b[A-Z]{5}\d{4}[A-Z]\b/ },                  // Indian PAN
  { name: 'passport',     pattern: /\b[A-Z]{1,2}\d{6,7}\b/ },
  { name: 'ssn',          pattern: /\b\d{3}-\d{2}-\d{4}\b/ },                   // US SSN
  { name: 'ip_address',   pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/ },
];

// ── Inappropriate Content Keywords ──────────────────────────────────────────
const INAPPROPRIATE_KEYWORDS = [
  'hate', 'kill', 'murder', 'suicide', 'self-harm', 'bomb', 'weapon',
  'drug synthesis', 'how to make poison', 'exploit', 'hack into',
  'nude', 'pornography', 'sexual content',
];

// ── Input Length & Format Rules ──────────────────────────────────────────────
const INPUT_RULES = {
  chat: { minLength: 1, maxLength: 1000 },
  citySearch: { minLength: 2, maxLength: 100, pattern: /^[a-zA-Z\s\u00C0-\u024F\u1E00-\u1EFF,.\-']+$/ },
};

// ── Core detection functions ─────────────────────────────────────────────────

export function detectPromptInjection(text) {
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return {
        detected: true,
        type: 'PROMPT_INJECTION',
        message: 'Input contains a prompt injection attempt.',
        pattern: pattern.source,
      };
    }
  }
  return { detected: false };
}

export function detectMaliciousInput(text) {
  for (const pattern of MALICIOUS_PATTERNS) {
    if (pattern.test(text)) {
      return {
        detected: true,
        type: 'MALICIOUS_INPUT',
        message: 'Input contains potentially malicious content (XSS, SQL injection, or script injection).',
        pattern: pattern.source,
      };
    }
  }
  return { detected: false };
}

export function detectPII(text) {
  const found = [];
  for (const { name, pattern } of PII_PATTERNS) {
    if (pattern.test(text)) {
      found.push(name);
    }
  }
  if (found.length > 0) {
    return {
      detected: true,
      type: 'PII_DETECTED',
      message: `Input appears to contain personal information: ${found.join(', ')}. Please do not share personal data.`,
      fields: found,
    };
  }
  return { detected: false };
}

export function detectInappropriateContent(text) {
  const lower = text.toLowerCase();
  for (const keyword of INAPPROPRIATE_KEYWORDS) {
    if (lower.includes(keyword)) {
      return {
        detected: true,
        type: 'INAPPROPRIATE_CONTENT',
        message: 'Input contains inappropriate or off-topic content. This assistant only answers air quality questions.',
      };
    }
  }
  return { detected: false };
}

export function validateInputFormat(text, context = 'chat') {
  const rules = INPUT_RULES[context] || INPUT_RULES.chat;
  const trimmed = text.trim();

  if (trimmed.length < rules.minLength) {
    return { valid: false, type: 'INPUT_TOO_SHORT', message: 'Input is too short. Please enter a valid query.' };
  }
  if (trimmed.length > rules.maxLength) {
    return { valid: false, type: 'INPUT_TOO_LONG', message: `Input exceeds ${rules.maxLength} characters. Please shorten your message.` };
  }
  if (rules.pattern && !rules.pattern.test(trimmed)) {
    return { valid: false, type: 'INVALID_FORMAT', message: 'Input contains invalid characters.' };
  }
  return { valid: true };
}

/**
 * Master input guardrail — runs all checks and returns a unified result.
 * @param {string} text — raw user input
 * @param {'chat'|'citySearch'} context — which input field
 * @returns {{ passed: boolean, violations: Array, sanitized: string }}
 */
export function runInputGuardrails(text, context = 'chat') {
  const violations = [];
  const sanitized  = text.trim().slice(0, INPUT_RULES[context]?.maxLength || 1000);

  // 1. Format validation
  const fmt = validateInputFormat(sanitized, context);
  if (!fmt.valid) violations.push(fmt);

  // 2. Malicious input
  const mal = detectMaliciousInput(sanitized);
  if (mal.detected) violations.push(mal);

  // 3. Prompt injection (chat only)
  if (context === 'chat') {
    const inj = detectPromptInjection(sanitized);
    if (inj.detected) violations.push(inj);
  }

  // 4. PII detection (warn, not block)
  const pii = detectPII(sanitized);
  if (pii.detected) violations.push({ ...pii, severity: 'warning' });

  // 5. Inappropriate content
  const inap = detectInappropriateContent(sanitized);
  if (inap.detected) violations.push(inap);

  const blocking = violations.filter((v) => v.severity !== 'warning');
  return {
    passed:     blocking.length === 0,
    violations,
    sanitized,
    timestamp:  new Date().toISOString(),
    context,
  };
}
