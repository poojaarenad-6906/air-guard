/**
 * GUARDRAIL 2 — OUTPUT GUARDRAILS
 * Validates AI-generated responses before displaying them to users.
 * Covers: hallucination detection, factual accuracy, toxicity filtering,
 *         sensitive information filtering, response format validation.
 */

// ── Toxicity & Harmful Content ───────────────────────────────────────────────
const TOXIC_PATTERNS = [
  /\b(fuck|shit|bitch|asshole|bastard|cunt|dick|pussy)\b/i,
  /\b(kill\s+yourself|kys|go\s+die)\b/i,
  /\bhate\s+(you|them|all)\b/i,
  /you\s+(are\s+)?(stupid|idiot|moron|dumb|worthless)/i,
];

// ── Sensitive Information in outputs ────────────────────────────────────────
const SENSITIVE_OUTPUT_PATTERNS = [
  { name: 'api_key',       pattern: /(?:api[_\s]?key|bearer|token|secret)["\s:=]+[A-Za-z0-9\-_]{16,}/i },
  { name: 'password',      pattern: /(?:password|passwd|pwd)["\s:=]+\S{4,}/i },
  { name: 'email',         pattern: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Z|a-z]{2,}\b/ },
  { name: 'private_key',   pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/ },
  { name: 'connection_str',pattern: /(?:mongodb|mysql|postgres|redis):\/\/[^\s]+/i },
];

// ── Air quality domain: facts the model should NOT fabricate ────────────────
// If the response contradicts these hard facts, it is flagged as a hallucination.
const AQI_FACTS = [
  { rule: 'AQI scale is 1–5 for OWM', test: (t) => {
    // If response claims AQI goes to 500 or uses US EPA scale as if it were OWM
    return /aqi\s+(goes?\s+up\s+to|scale\s+is|ranges?\s+(from\s+)?0\s+to)\s+500/i.test(t);
  }},
  { rule: 'PM2.5 WHO guideline is 15 µg/m³', test: (t) => {
    const m = t.match(/who\s+guideline\s+for\s+pm\s*2\.?5\s+is\s+(\d+)/i);
    return m && parseInt(m[1]) !== 15;
  }},
  { rule: 'PM10 WHO guideline is 45 µg/m³', test: (t) => {
    const m = t.match(/who\s+guideline\s+for\s+pm\s*10\s+is\s+(\d+)/i);
    return m && parseInt(m[1]) !== 45;
  }},
];

// ── Medical advice boundary ──────────────────────────────────────────────────
const MEDICAL_ADVICE_PATTERNS = [
  /you\s+(should|must|need\s+to)\s+(take|use|stop\s+taking)\s+(?:the\s+)?(?:medication|medicine|drug|pill|inhaler|dose)/i,
  /prescribe|prescription|diagnos/i,
  /this\s+(is|will\s+cure|treats?)\s+(your\s+)?(condition|disease|illness)/i,
];

// ── Response format validators ───────────────────────────────────────────────
export function validateResponseFormat(text) {
  if (!text || typeof text !== 'string') {
    return { valid: false, type: 'EMPTY_RESPONSE', message: 'AI returned an empty or invalid response.' };
  }
  if (text.trim().length < 5) {
    return { valid: false, type: 'RESPONSE_TOO_SHORT', message: 'AI response is too short to be meaningful.' };
  }
  if (text.trim().length > 4000) {
    return { valid: false, type: 'RESPONSE_TOO_LONG', message: 'AI response exceeds safe length.' };
  }
  return { valid: true };
}

export function detectToxicOutput(text) {
  for (const pattern of TOXIC_PATTERNS) {
    if (pattern.test(text)) {
      return {
        detected: true,
        type: 'TOXIC_OUTPUT',
        message: 'Response contains inappropriate language and has been blocked.',
      };
    }
  }
  return { detected: false };
}

export function detectSensitiveOutputInfo(text) {
  const found = [];
  for (const { name, pattern } of SENSITIVE_OUTPUT_PATTERNS) {
    if (pattern.test(text)) found.push(name);
  }
  if (found.length > 0) {
    return {
      detected: true,
      type: 'SENSITIVE_INFO_LEAK',
      message: `Response contains sensitive information (${found.join(', ')}) and has been blocked.`,
      fields: found,
    };
  }
  return { detected: false };
}

export function detectHallucination(text) {
  for (const fact of AQI_FACTS) {
    if (fact.test(text)) {
      return {
        detected: true,
        type: 'HALLUCINATION_DETECTED',
        message: `Response may contain incorrect information: "${fact.rule}". Displaying with a warning.`,
        rule: fact.rule,
      };
    }
  }
  return { detected: false };
}

export function detectMedicalAdvice(text) {
  for (const pattern of MEDICAL_ADVICE_PATTERNS) {
    if (pattern.test(text)) {
      return {
        detected: true,
        type: 'MEDICAL_ADVICE_WARNING',
        message: 'Response may contain specific medical advice. Adding required disclaimer.',
        severity: 'warning',
      };
    }
  }
  return { detected: false };
}

/**
 * Redacts sensitive fields from a string before display.
 */
export function redactSensitiveOutput(text) {
  let result = text;
  for (const { pattern } of SENSITIVE_OUTPUT_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

/**
 * Master output guardrail — runs all checks on AI-generated text.
 * @param {string} text — raw AI response
 * @returns {{ passed: boolean, violations: Array, text: string, disclaimer: string|null }}
 */
export function runOutputGuardrails(text) {
  const violations   = [];
  let   outputText   = text;
  let   disclaimer   = null;

  // 1. Format validation
  const fmt = validateResponseFormat(text);
  if (!fmt.valid) violations.push(fmt);

  // 2. Toxic content — hard block
  const tox = detectToxicOutput(text);
  if (tox.detected) {
    violations.push(tox);
    outputText = 'I was unable to generate a suitable response. Please try rephrasing your question.';
  }

  // 3. Sensitive info leak — redact and warn
  const sens = detectSensitiveOutputInfo(text);
  if (sens.detected) {
    violations.push(sens);
    outputText = redactSensitiveOutput(outputText);
  }

  // 4. Hallucination — warn but allow
  const hall = detectHallucination(text);
  if (hall.detected) violations.push({ ...hall, severity: 'warning' });

  // 5. Medical advice boundary — attach disclaimer
  const med = detectMedicalAdvice(text);
  if (med.detected) {
    violations.push({ ...med, severity: 'warning' });
    disclaimer = '⚕️ Note: This is general guidance only, not medical advice. Consult a qualified healthcare professional.';
  }

  const blocking = violations.filter((v) => !v.severity || v.severity === 'error');
  return {
    passed:    blocking.length === 0,
    violations,
    text:      outputText,
    disclaimer,
    timestamp: new Date().toISOString(),
  };
}
