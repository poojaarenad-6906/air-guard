/**
 * GUARDRAIL 6 — OPERATIONAL GUARDRAILS
 * Controls agent execution and resource consumption.
 * Covers: execution timeouts, token limits, API rate limiting,
 *         max iterations, cost monitoring, retry/failure handling.
 */

// ── Operational limits ────────────────────────────────────────────────────────
export const OPERATIONAL_LIMITS = {
  maxExecutionMs:       10000,   // 10 seconds per agent call
  maxTokensPerCall:     500,     // max tokens sent to AI per request
  maxTokensPerSession:  5000,    // total tokens across session
  maxApiCallsPerMin:    20,      // across all tools
  maxChatMessages:      50,      // max messages in one chat session
  maxRetries:           3,       // retry attempts on failure
  retryDelayMs:         1000,    // base delay between retries
  maxAgentIterations:   5,       // multi-step agent reasoning loops
  budgetUsdPerSession:  0.10,    // estimated cost ceiling (Groq is nearly free)
  tokenCostPer1k:       0.0001,  // USD per 1k tokens (Groq llama3-8b estimate)
};

// ── Session state tracker ─────────────────────────────────────────────────────
const sessionState = {
  tokensUsed:       0,
  apiCallsThisMin:  0,
  apiCallWindowStart: Date.now(),
  chatMessageCount: 0,
  agentIterations:  0,
  estimatedCostUsd: 0,
  retryCount:       0,
};

export function getSessionStats() {
  return { ...sessionState };
}

export function resetSessionState() {
  Object.assign(sessionState, {
    tokensUsed: 0, apiCallsThisMin: 0,
    apiCallWindowStart: Date.now(),
    chatMessageCount: 0, agentIterations: 0,
    estimatedCostUsd: 0, retryCount: 0,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function refreshRateWindow() {
  const now = Date.now();
  if (now - sessionState.apiCallWindowStart > 60_000) {
    sessionState.apiCallsThisMin = 0;
    sessionState.apiCallWindowStart = now;
  }
}

/**
 * Rough token estimator — 1 token ≈ 4 characters.
 */
export function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

/**
 * Wrap any async function in an execution-time guardrail.
 */
export async function withTimeout(fn, ms = OPERATIONAL_LIMITS.maxExecutionMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Execution timed out after ${ms}ms`)), ms);
    fn().then((v) => { clearTimeout(timer); resolve(v); })
       .catch((e) => { clearTimeout(timer); reject(e); });
  });
}

/**
 * Retry wrapper with exponential back-off.
 */
export async function withRetry(fn, maxRetries = OPERATIONAL_LIMITS.maxRetries) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      sessionState.retryCount = attempt - 1;
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = OPERATIONAL_LIMITS.retryDelayMs * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ── Limit checks ──────────────────────────────────────────────────────────────

export function checkTokenLimit(inputText, outputTokenEstimate = 300) {
  const inputTokens = estimateTokens(inputText);
  const totalCall   = inputTokens + outputTokenEstimate;

  if (totalCall > OPERATIONAL_LIMITS.maxTokensPerCall) {
    return {
      allowed: false,
      type:    'TOKEN_LIMIT_PER_CALL',
      message: `Request would use ~${totalCall} tokens, exceeding the per-call limit of ${OPERATIONAL_LIMITS.maxTokensPerCall}.`,
      tokens:  totalCall,
    };
  }

  const projectedTotal = sessionState.tokensUsed + totalCall;
  if (projectedTotal > OPERATIONAL_LIMITS.maxTokensPerSession) {
    return {
      allowed: false,
      type:    'TOKEN_LIMIT_SESSION',
      message: `Session token budget of ${OPERATIONAL_LIMITS.maxTokensPerSession} would be exceeded.`,
      tokensUsed: sessionState.tokensUsed,
    };
  }

  return { allowed: true, inputTokens, totalCall };
}

export function checkApiRateLimit() {
  refreshRateWindow();
  if (sessionState.apiCallsThisMin >= OPERATIONAL_LIMITS.maxApiCallsPerMin) {
    return {
      allowed: false,
      type:    'API_RATE_LIMIT',
      message: `API rate limit of ${OPERATIONAL_LIMITS.maxApiCallsPerMin} calls/minute reached. Please wait.`,
      callsThisMin: sessionState.apiCallsThisMin,
    };
  }
  return { allowed: true, callsThisMin: sessionState.apiCallsThisMin };
}

export function checkChatMessageLimit() {
  if (sessionState.chatMessageCount >= OPERATIONAL_LIMITS.maxChatMessages) {
    return {
      allowed: false,
      type:    'CHAT_MESSAGE_LIMIT',
      message: `Chat session limit of ${OPERATIONAL_LIMITS.maxChatMessages} messages reached. Please start a new session.`,
    };
  }
  return { allowed: true };
}

export function checkAgentIterationLimit() {
  if (sessionState.agentIterations >= OPERATIONAL_LIMITS.maxAgentIterations) {
    return {
      allowed: false,
      type:    'AGENT_ITERATION_LIMIT',
      message: `Maximum agent reasoning iterations (${OPERATIONAL_LIMITS.maxAgentIterations}) reached.`,
    };
  }
  return { allowed: true };
}

export function checkBudgetLimit(additionalTokens = 0) {
  const additionalCost = (additionalTokens / 1000) * OPERATIONAL_LIMITS.tokenCostPer1k;
  const projected      = sessionState.estimatedCostUsd + additionalCost;
  if (projected > OPERATIONAL_LIMITS.budgetUsdPerSession) {
    return {
      allowed:        false,
      type:           'BUDGET_EXCEEDED',
      message:        `Estimated session cost $${projected.toFixed(4)} would exceed budget of $${OPERATIONAL_LIMITS.budgetUsdPerSession}.`,
      estimatedCost:  projected,
    };
  }
  return { allowed: true, estimatedCost: projected };
}

/**
 * Record a completed API call — updates session counters.
 */
export function recordApiCall(tokensUsed = 0) {
  refreshRateWindow();
  sessionState.apiCallsThisMin += 1;
  sessionState.tokensUsed      += tokensUsed;
  sessionState.agentIterations += 1;
  sessionState.estimatedCostUsd += (tokensUsed / 1000) * OPERATIONAL_LIMITS.tokenCostPer1k;
}

export function recordChatMessage() {
  sessionState.chatMessageCount += 1;
}

/**
 * Master operational guardrail.
 * @param {string} inputText — the text about to be sent to the AI
 * @returns {{ passed: boolean, violations: Array }}
 */
export function runOperationalGuardrails(inputText = '') {
  const violations = [];

  const rate    = checkApiRateLimit();
  if (!rate.allowed) violations.push(rate);

  const tokens  = checkTokenLimit(inputText);
  if (!tokens.allowed) violations.push(tokens);

  const chat    = checkChatMessageLimit();
  if (!chat.allowed) violations.push(chat);

  const iter    = checkAgentIterationLimit();
  if (!iter.allowed) violations.push(iter);

  const budget  = checkBudgetLimit(estimateTokens(inputText) + 300);
  if (!budget.allowed) violations.push(budget);

  return {
    passed:       violations.length === 0,
    violations,
    sessionStats: getSessionStats(),
    timestamp:    new Date().toISOString(),
  };
}
