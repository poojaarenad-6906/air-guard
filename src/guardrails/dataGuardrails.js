/**
 * GUARDRAIL 4 — DATA GUARDRAILS
 * Protects data accessed and processed by agents.
 * Covers: data privacy, PII masking/anonymization, role-based access,
 *         database access restrictions, prevention of unauthorized retrieval.
 */

// ── Data sensitivity levels ──────────────────────────────────────────────────
export const DATA_SENSITIVITY = {
  PUBLIC:       'public',       // city names, AQI values — freely shareable
  INTERNAL:     'internal',     // aggregated stats, non-personal data
  CONFIDENTIAL: 'confidential', // user preferences, session data
  RESTRICTED:   'restricted',   // API keys, credentials
};

// ── Role-based access control (RBAC) ────────────────────────────────────────
// In a browser app, roles are session-based. This mirrors enterprise RBAC.
const ROLE_PERMISSIONS = {
  guest: {
    canRead:   [DATA_SENSITIVITY.PUBLIC],
    canWrite:  [],
    canDelete: [],
  },
  user: {
    canRead:   [DATA_SENSITIVITY.PUBLIC, DATA_SENSITIVITY.INTERNAL],
    canWrite:  [DATA_SENSITIVITY.INTERNAL],
    canDelete: [],
  },
  admin: {
    canRead:   Object.values(DATA_SENSITIVITY),
    canWrite:  [DATA_SENSITIVITY.PUBLIC, DATA_SENSITIVITY.INTERNAL, DATA_SENSITIVITY.CONFIDENTIAL],
    canDelete: [DATA_SENSITIVITY.PUBLIC, DATA_SENSITIVITY.INTERNAL],
  },
};

// ── Data field classifications ────────────────────────────────────────────────
export const DATA_CLASSIFICATIONS = {
  city:       DATA_SENSITIVITY.PUBLIC,
  country:    DATA_SENSITIVITY.PUBLIC,
  aqi:        DATA_SENSITIVITY.PUBLIC,
  aqiLabel:   DATA_SENSITIVITY.PUBLIC,
  pm25:       DATA_SENSITIVITY.PUBLIC,
  pm10:       DATA_SENSITIVITY.PUBLIC,
  no2:        DATA_SENSITIVITY.PUBLIC,
  o3:         DATA_SENSITIVITY.PUBLIC,
  co:         DATA_SENSITIVITY.PUBLIC,
  so2:        DATA_SENSITIVITY.PUBLIC,
  nh3:        DATA_SENSITIVITY.PUBLIC,
  updatedAt:  DATA_SENSITIVITY.PUBLIC,
  isDemo:     DATA_SENSITIVITY.INTERNAL,
  apiKey:     DATA_SENSITIVITY.RESTRICTED,
  userEmail:  DATA_SENSITIVITY.CONFIDENTIAL,
  sessionId:  DATA_SENSITIVITY.CONFIDENTIAL,
};

// ── PII masking patterns ─────────────────────────────────────────────────────
const MASKING_RULES = [
  { name: 'email',        pattern: /\b([A-Za-z0-9._%+\-]+)@([A-Za-z0-9.\-]+\.[A-Z|a-z]{2,})\b/g,
    replace: (m, u, d) => `${u[0]}***@${d}` },
  { name: 'phone',        pattern: /\b(\+?\d{1,3}[\s\-]?)(\d{3,5})(\d{4,6})\b/g,
    replace: (m, c, p, s) => `${c}***${s.slice(-2)}` },
  { name: 'aadhaar',      pattern: /\b(\d{4}[\s\-]?)(\d{4}[\s\-]?)(\d{4})\b/g,
    replace: (m, a, b, c) => `XXXX-XXXX-${c}` },
  { name: 'pan',          pattern: /\b([A-Z]{5})(\d{4})([A-Z])\b/g,
    replace: (m, a, b, c) => `${a}XXXX${c}` },
  { name: 'credit_card',  pattern: /\b(\d{4})[\s\-]?(\d{4})[\s\-]?(\d{4})[\s\-]?(\d{4})\b/g,
    replace: (m, a, b, c, d) => `${a}-XXXX-XXXX-${d}` },
  { name: 'api_key',      pattern: /(?:api[_\-]?key|bearer|token|secret)["\s:=]+([A-Za-z0-9\-_]{16,})/gi,
    replace: () => '[API_KEY_REDACTED]' },
];

/**
 * Mask all PII and sensitive fields in a string.
 */
export function maskPII(text) {
  let result = text;
  for (const rule of MASKING_RULES) {
    result = result.replace(rule.pattern, rule.replace);
  }
  return result;
}

/**
 * Anonymize an object by removing or masking sensitive fields.
 */
export function anonymizeData(obj, role = 'guest') {
  if (!obj || typeof obj !== 'object') return obj;
  const perms     = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.guest;
  const sanitized = {};

  for (const [key, value] of Object.entries(obj)) {
    const sensitivity = DATA_CLASSIFICATIONS[key] || DATA_SENSITIVITY.INTERNAL;
    if (perms.canRead.includes(sensitivity)) {
      sanitized[key] = value;
    } else {
      sanitized[key] = '[RESTRICTED]';
    }
  }
  return sanitized;
}

/**
 * Check if a role has permission to access data at a given sensitivity level.
 */
export function checkDataAccess(role, sensitivity, operation = 'canRead') {
  const perms = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.guest;
  const allowed = (perms[operation] || []).includes(sensitivity);
  if (!allowed) {
    return {
      allowed: false,
      type: 'DATA_ACCESS_DENIED',
      message: `Role "${role}" does not have "${operation}" permission for "${sensitivity}" data.`,
    };
  }
  return { allowed: true };
}

/**
 * Prevent retrieval of restricted fields from an air quality data object.
 * Returns a clean copy safe to display in the UI.
 */
export function sanitizeAirQualityData(data, role = 'guest') {
  if (!data) return null;
  // Public fields only for guest/user roles
  const publicFields = ['city', 'country', 'aqi', 'aqiLabel', 'pm25', 'pm10',
                        'no2', 'o3', 'co', 'so2', 'nh3', 'updatedAt', 'isDemo'];
  const result = {};
  for (const field of publicFields) {
    if (data[field] !== undefined) result[field] = data[field];
  }
  return result;
}

/**
 * Master data guardrail.
 * @param {object} data      — data object being processed
 * @param {string} role      — current user role
 * @param {string} operation — 'canRead' | 'canWrite' | 'canDelete'
 * @returns {{ passed: boolean, violations: Array, sanitized: object }}
 */
export function runDataGuardrails(data, role = 'guest', operation = 'canRead') {
  const violations = [];

  // 1. Check each sensitive field
  for (const [key] of Object.entries(data || {})) {
    const sensitivity = DATA_CLASSIFICATIONS[key];
    if (sensitivity && sensitivity !== DATA_SENSITIVITY.PUBLIC) {
      const access = checkDataAccess(role, sensitivity, operation);
      if (!access.allowed) {
        violations.push({ ...access, field: key });
      }
    }
  }

  // 2. Sanitize the output regardless
  const sanitized = sanitizeAirQualityData(data, role);

  return {
    passed:    violations.length === 0,
    violations,
    sanitized,
    role,
    operation,
    timestamp: new Date().toISOString(),
  };
}
