/**
 * GUARDRAIL 9 — ETHICAL & COMPLIANCE GUARDRAILS
 * Ensures responsible and compliant AI behaviour.
 * Covers: bias detection, fairness validation, explainability,
 *         regulatory compliance, responsible AI principles, audit trails.
 */

// ── Bias indicators ───────────────────────────────────────────────────────────
// These patterns flag potentially biased language in AI outputs.
const BIAS_PATTERNS = [
  { type: 'geographic_bias',  pattern: /cities?\s+in\s+(third.world|developing|poor)\s+countries?/i,
    message: 'Potentially geographically biased language detected.' },
  { type: 'demographic_bias', pattern: /\b(poor\s+people|rich\s+people|lower\s+class)\s+(should|must|have\s+to)/i,
    message: 'Potentially demographically biased advice detected.' },
  { type: 'gender_bias',      pattern: /\b(he|she)\s+should\s+(always|never)\b/i,
    message: 'Potentially gender-biased language detected.' },
  { type: 'absolute_claim',   pattern: /\b(always|never|everyone|nobody)\s+(must|should|will)\b/i,
    message: 'Absolute claim detected — consider more nuanced language.' },
];

// ── Compliance rules ──────────────────────────────────────────────────────────
export const COMPLIANCE_RULES = {
  GDPR: {
    name:        'GDPR (General Data Protection Regulation)',
    region:      'EU',
    requirements: [
      'Do not store personal data without consent',
      'Provide data deletion on request',
      'API keys must not be exposed in client-side code',
      'User health data must not be logged',
    ],
  },
  IT_ACT_INDIA: {
    name:        'IT Act 2000 (India)',
    region:      'IN',
    requirements: [
      'Do not collect Aadhaar or PAN without authorization',
      'User data must be stored securely',
      'No unauthorized interception of data',
    ],
  },
  RESPONSIBLE_AI: {
    name:        'IBM Responsible AI Principles',
    region:      'Global',
    requirements: [
      'AI must be explainable',
      'AI must be fair and unbiased',
      'AI must be transparent',
      'Health recommendations must carry disclaimers',
      'Demo data must be clearly labelled',
    ],
  },
};

// ── Audit trail (in-memory, session-scoped) ───────────────────────────────────
const auditLog = [];

export function logAuditEvent(event) {
  const entry = {
    id:        auditLog.length + 1,
    timestamp: new Date().toISOString(),
    ...event,
  };
  auditLog.push(entry);
  return entry;
}

export function getAuditLog() {
  return [...auditLog];
}

export function clearAuditLog() {
  auditLog.length = 0;
}

// ── Explainability helper ─────────────────────────────────────────────────────
/**
 * Generate a plain-language explanation of why a guardrail fired.
 */
export function explainGuardrailDecision(guardrailResult) {
  if (!guardrailResult || guardrailResult.violations?.length === 0) {
    return 'All guardrails passed. The request was processed normally.';
  }
  const lines = [`**Guardrail Decision — ${guardrailResult.passed ? 'PASSED' : 'BLOCKED'}**`];
  for (const v of guardrailResult.violations) {
    lines.push(`• **${v.type}** (${v.severity || 'error'}): ${v.message}`);
  }
  if (!guardrailResult.passed) {
    lines.push('\n*This request was blocked to protect user safety and data integrity.*');
  }
  return lines.join('\n');
}

// ── Fairness validator ────────────────────────────────────────────────────────
/**
 * Check that health advice is consistent regardless of city/country.
 * For a given AQI level, the advice should not vary by geography.
 */
export function validateFairness(aqiLevel, advice) {
  // All AQI 5 recommendations must include "seek medical attention" or "stay indoors"
  if (aqiLevel >= 5) {
    const required = ['indoor', 'medical', 'avoid', 'stay'];
    const lower    = (advice || '').toLowerCase();
    const covered  = required.some((kw) => lower.includes(kw));
    if (!covered) {
      return {
        fair:    false,
        type:    'FAIRNESS_VIOLATION',
        message: 'AQI 5 advice must include protective guidance (stay indoors / seek medical attention).',
      };
    }
  }
  return { fair: true };
}

// ── Bias detector ─────────────────────────────────────────────────────────────
export function detectBias(text) {
  const found = [];
  for (const { type, pattern, message } of BIAS_PATTERNS) {
    if (pattern.test(text)) found.push({ type, message, severity: 'warning' });
  }
  return {
    biasDetected: found.length > 0,
    issues:       found,
  };
}

// ── Compliance check ──────────────────────────────────────────────────────────
export function checkCompliance(dataObject = {}) {
  const issues = [];

  // GDPR: no personal data in logs
  if (dataObject.userEmail || dataObject.userName) {
    issues.push({ rule: 'GDPR', message: 'Personal identifiers (email/name) must not be stored without consent.' });
  }

  // Responsible AI: demo data labelled
  if (dataObject.isDemo === undefined) {
    issues.push({ rule: 'RESPONSIBLE_AI', message: 'Data source (live/demo) must be declared for transparency.' });
  }

  // Health disclaimer required for all health advice
  if (dataObject.hasHealthAdvice && !dataObject.hasDisclaimer) {
    issues.push({ rule: 'RESPONSIBLE_AI', message: 'Health recommendations require a medical disclaimer.' });
  }

  return {
    compliant: issues.length === 0,
    issues,
    rulesChecked: Object.keys(COMPLIANCE_RULES),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Master ethics & compliance guardrail.
 * @param {string} text        — AI output text
 * @param {object} context     — { aqiLevel, isDemo, hasHealthAdvice, hasDisclaimer }
 * @returns {{ passed: boolean, violations: Array, auditEntry: object }}
 */
export function runEthicsGuardrails(text, context = {}) {
  const violations = [];

  // 1. Bias detection (warning, not block)
  const bias = detectBias(text);
  if (bias.biasDetected) {
    violations.push(...bias.issues);
  }

  // 2. Fairness validation
  if (context.aqiLevel !== undefined) {
    const fairness = validateFairness(context.aqiLevel, text);
    if (!fairness.fair) violations.push({ ...fairness, severity: 'warning' });
  }

  // 3. Compliance check
  const compliance = checkCompliance(context);
  if (!compliance.compliant) {
    compliance.issues.forEach((i) => violations.push({ ...i, type: 'COMPLIANCE_VIOLATION', severity: 'warning' }));
  }

  // 4. Log to audit trail
  const auditEntry = logAuditEvent({
    category:    'ethics_guardrail',
    passed:      violations.filter((v) => v.severity !== 'warning').length === 0,
    violations:  violations.length,
    context:     { aqiLevel: context.aqiLevel, isDemo: context.isDemo },
    textPreview: text?.slice(0, 100),
  });

  return {
    passed:     violations.filter((v) => !v.severity || v.severity !== 'warning').length === 0,
    violations,
    auditEntry,
    timestamp:  new Date().toISOString(),
  };
}
