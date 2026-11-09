/**
 * GUARDRAIL 5 — SECURITY GUARDRAILS
 * Protects the application from security threats.
 * Covers: prompt injection protection, jailbreak detection, SQL injection,
 *         cross-agent communication security, credential management.
 */

// ── Jailbreak Patterns ───────────────────────────────────────────────────────
const JAILBREAK_PATTERNS = [
  // Classic DAN / "do anything now"
  /\b(DAN|do\s+anything\s+now|developer\s+mode|jailbreak)\b/i,
  // Roleplay bypass
  /pretend\s+(you\s+have\s+no\s+)?restrictions/i,
  /simulate\s+(a|an)\s+(unrestricted|evil|hacked|unfiltered)\s+(ai|model|bot)/i,
  /as\s+(an?\s+)?(unethical|evil|unrestricted|uncensored)\s+(ai|assistant|model)/i,
  // Token manipulation tricks
  /base64|rot13|hex\s+encode/i,
  /translate\s+to\s+(another\s+language\s+then\s+)?answer/i,
  // System-level override attempts
  /\[system\]/i,
  /<<SYS>>|<\|system\|>/i,
  /INST\]|\[\/INST\]/,
  // Instruction nesting tricks
  /---+\s*(new\s+)?instruction/i,
  /##\s*(override|system|admin|root)\b/i,
];

// ── SQL Injection Patterns ────────────────────────────────────────────────────
const SQL_INJECTION_PATTERNS = [
  /(\bOR\b|\bAND\b)\s+['"]?\d+['"]?\s*=\s*['"]?\d+['"]?/i,
  /\bUNION\b.*\bSELECT\b/i,
  /\bDROP\b\s+\bTABLE\b/i,
  /\bINSERT\b\s+\bINTO\b/i,
  /\bUPDATE\b.*\bSET\b.*\bWHERE\b/i,
  /\bDELETE\b\s+\bFROM\b/i,
  /';?\s*(--|#|\/\*)/,
  /\bEXEC\s*\(|EXECUTE\s*\(/i,
  /xp_cmdshell/i,
  /information_schema|sysobjects|syscolumns/i,
];

// ── XSS Patterns ──────────────────────────────────────────────────────────────
const XSS_PATTERNS = [
  /<script[\s\S]*?>/i,
  /javascript\s*:/i,
  /vbscript\s*:/i,
  /on(load|error|click|mouseover|focus|blur)\s*=/i,
  /<iframe|<object|<embed|<applet/i,
  /expression\s*\(/i,
  /url\s*\(\s*javascript:/i,
];

// ── Credential exposure patterns ──────────────────────────────────────────────
const CREDENTIAL_PATTERNS = [
  /VITE_[A-Z_]+\s*=\s*[A-Za-z0-9\-_.]{10,}/,   // env variable with value
  /sk-[A-Za-z0-9]{20,}/,                          // OpenAI-style secret key
  /gsk_[A-Za-z0-9]{20,}/,                         // Groq key
  /AIzaSy[A-Za-z0-9\-_]{33}/,                     // Google API key
  /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/,
  /(?:password|secret|token)\s*[:=]\s*["']?\S{6,}/i,
];

// ── Content Security Policy validator ────────────────────────────────────────
// Validates that any URLs in input/output are from allowed sources only.
const ALLOWED_EXTERNAL_DOMAINS = [
  'openweathermap.org',
  'api.groq.com',
  'openweathermap.org',
];

export function detectJailbreak(text) {
  for (const pattern of JAILBREAK_PATTERNS) {
    if (pattern.test(text)) {
      return {
        detected: true,
        type:     'JAILBREAK_ATTEMPT',
        message:  'Input contains a jailbreak attempt and has been blocked.',
        severity: 'critical',
      };
    }
  }
  return { detected: false };
}

export function detectSQLInjection(text) {
  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return {
        detected: true,
        type:     'SQL_INJECTION',
        message:  'Input contains a SQL injection pattern.',
        severity: 'critical',
      };
    }
  }
  return { detected: false };
}

export function detectXSS(text) {
  for (const pattern of XSS_PATTERNS) {
    if (pattern.test(text)) {
      return {
        detected: true,
        type:     'XSS_ATTEMPT',
        message:  'Input contains a cross-site scripting (XSS) pattern.',
        severity: 'critical',
      };
    }
  }
  return { detected: false };
}

export function detectCredentialExposure(text) {
  for (const pattern of CREDENTIAL_PATTERNS) {
    if (pattern.test(text)) {
      return {
        detected: true,
        type:     'CREDENTIAL_EXPOSURE',
        message:  'Potential credential or API key detected in content.',
        severity: 'critical',
      };
    }
  }
  return { detected: false };
}

export function validateExternalUrl(url) {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    const allowed  = ALLOWED_EXTERNAL_DOMAINS.some((d) => hostname === d || hostname.endsWith('.' + d));
    if (!allowed) {
      return {
        allowed:  false,
        type:     'UNAUTHORIZED_EXTERNAL_URL',
        message:  `External URL "${hostname}" is not in the security allowlist.`,
        severity: 'critical',
      };
    }
    return { allowed: true };
  } catch {
    return { allowed: false, type: 'INVALID_URL', message: 'Malformed URL detected.' };
  }
}

/**
 * Sanitize text by stripping HTML/script tags for safe rendering.
 */
export function sanitizeForDisplay(text) {
  return text
    .replace(/<[^>]*>/g, '')             // strip all HTML tags
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim();
}

/**
 * Master security guardrail — deepest security layer, runs on all inputs.
 * @param {string} text — input text to check
 * @returns {{ passed: boolean, violations: Array, sanitized: string }}
 */
export function runSecurityGuardrails(text) {
  const violations = [];

  const jailbreak   = detectJailbreak(text);
  if (jailbreak.detected) violations.push(jailbreak);

  const sql         = detectSQLInjection(text);
  if (sql.detected) violations.push(sql);

  const xss         = detectXSS(text);
  if (xss.detected) violations.push(xss);

  const cred        = detectCredentialExposure(text);
  if (cred.detected) violations.push(cred);

  return {
    passed:    violations.length === 0,
    violations,
    sanitized: sanitizeForDisplay(text),
    timestamp: new Date().toISOString(),
  };
}
