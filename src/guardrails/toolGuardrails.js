/**
 * GUARDRAIL 3 — TOOL EXECUTION GUARDRAILS
 * Controls how AI agents interact with external tools and APIs.
 * Covers: tool access permissions, API authorization, function-call validation,
 *         restricted tool execution, prevention of unauthorized actions.
 */

// ── Allowed tool registry ────────────────────────────────────────────────────
// Each tool declares what it is permitted to do.
export const TOOL_REGISTRY = {
  fetchAirQuality: {
    description:   'Fetch air quality data for a city',
    allowedParams: ['cityName'],
    requiredParams:['cityName'],
    allowedDomains:['api.openweathermap.org'],
    maxCallsPerSession: 50,
    requiresAuth:  false,   // key handled server-side in production
  },
  getGroqCompletion: {
    description:    'Send a chat prompt to Groq AI',
    allowedParams:  ['messages', 'model', 'max_tokens', 'temperature'],
    requiredParams: ['messages'],
    allowedDomains: ['api.groq.com'],
    maxCallsPerSession: 100,
    requiresAuth:   true,
    maxTokens:      500,    // hard ceiling regardless of caller request
  },
};

// ── Call counters (in-memory, per session) ───────────────────────────────────
const callCounters = {};

export function getCallCount(toolName) {
  return callCounters[toolName] || 0;
}

function incrementCallCount(toolName) {
  callCounters[toolName] = (callCounters[toolName] || 0) + 1;
}

export function resetCallCounts() {
  Object.keys(callCounters).forEach((k) => delete callCounters[k]);
}

// ── Validators ────────────────────────────────────────────────────────────────

/**
 * Check that the tool exists in the registry (access control).
 */
export function validateToolAccess(toolName) {
  if (!TOOL_REGISTRY[toolName]) {
    return {
      allowed: false,
      type: 'TOOL_NOT_REGISTERED',
      message: `Tool "${toolName}" is not in the allowed tool registry. Access denied.`,
    };
  }
  return { allowed: true };
}

/**
 * Validate that only declared parameters are passed to a tool.
 */
export function validateToolParams(toolName, params = {}) {
  const tool = TOOL_REGISTRY[toolName];
  if (!tool) return { valid: false, type: 'UNKNOWN_TOOL', message: 'Unknown tool.' };

  // Check required params are present
  for (const req of tool.requiredParams) {
    if (params[req] === undefined || params[req] === null || params[req] === '') {
      return { valid: false, type: 'MISSING_REQUIRED_PARAM', message: `Required parameter "${req}" is missing for tool "${toolName}".` };
    }
  }

  // Check no undeclared params are passed
  for (const key of Object.keys(params)) {
    if (!tool.allowedParams.includes(key)) {
      return { valid: false, type: 'UNAUTHORIZED_PARAM', message: `Parameter "${key}" is not permitted for tool "${toolName}".` };
    }
  }

  // Enforce token limit for AI tools
  if (toolName === 'getGroqCompletion' && params.max_tokens > tool.maxTokens) {
    return { valid: false, type: 'TOKEN_LIMIT_EXCEEDED', message: `max_tokens ${params.max_tokens} exceeds the allowed limit of ${tool.maxTokens}.` };
  }

  return { valid: true };
}

/**
 * Check that the URL being called belongs to an allowed domain.
 */
export function validateApiDomain(toolName, url) {
  const tool = TOOL_REGISTRY[toolName];
  if (!tool) return { allowed: false, type: 'UNKNOWN_TOOL', message: 'Unknown tool.' };

  try {
    const hostname = new URL(url).hostname;
    const allowed  = tool.allowedDomains.some((d) => hostname === d || hostname.endsWith('.' + d));
    if (!allowed) {
      return {
        allowed: false,
        type:    'UNAUTHORIZED_DOMAIN',
        message: `API call to "${hostname}" is not permitted. Allowed: ${tool.allowedDomains.join(', ')}.`,
      };
    }
    return { allowed: true };
  } catch {
    return { allowed: false, type: 'INVALID_URL', message: 'Cannot parse the API URL.' };
  }
}

/**
 * Enforce per-session call rate limits.
 */
export function checkRateLimit(toolName) {
  const tool = TOOL_REGISTRY[toolName];
  if (!tool) return { allowed: true };

  const count = getCallCount(toolName);
  if (count >= tool.maxCallsPerSession) {
    return {
      allowed: false,
      type:    'RATE_LIMIT_EXCEEDED',
      message: `Tool "${toolName}" has reached its limit of ${tool.maxCallsPerSession} calls per session.`,
      count,
      limit:   tool.maxCallsPerSession,
    };
  }
  return { allowed: true, count, limit: tool.maxCallsPerSession };
}

/**
 * Master tool guardrail — call before every tool/API invocation.
 * @param {string} toolName  — name from TOOL_REGISTRY
 * @param {object} params    — parameters being passed
 * @param {string} url       — full URL being called (optional)
 * @returns {{ passed: boolean, violations: Array }}
 */
export function runToolGuardrails(toolName, params = {}, url = '') {
  const violations = [];

  // 1. Access control
  const access = validateToolAccess(toolName);
  if (!access.allowed) violations.push(access);

  // 2. Rate limit
  const rate = checkRateLimit(toolName);
  if (!rate.allowed) violations.push(rate);

  // 3. Parameter validation
  const paramCheck = validateToolParams(toolName, params);
  if (!paramCheck.valid) violations.push(paramCheck);

  // 4. Domain validation
  if (url) {
    const domain = validateApiDomain(toolName, url);
    if (!domain.allowed) violations.push(domain);
  }

  if (violations.length === 0) {
    // Record the call
    incrementCallCount(toolName);
  }

  return {
    passed:    violations.length === 0,
    violations,
    toolName,
    callCount: getCallCount(toolName),
    timestamp: new Date().toISOString(),
  };
}
