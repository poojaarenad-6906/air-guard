/**
 * GUARDRAIL 8 — MULTI-AGENT GUARDRAILS
 * Ensures safe coordination between multiple specialized agents.
 * Covers: agent access control, task assignment validation,
 *         cross-agent output verification, loop prevention, conflict resolution.
 */

// ── Agent registry ────────────────────────────────────────────────────────────
export const AGENT_REGISTRY = {
  airQualityAgent: {
    description:    'Fetches and processes air quality data from external APIs.',
    allowedTasks:   ['fetchAirQuality', 'parsePollutantData', 'generateTrendData'],
    canCallAgents:  [],          // this agent does not spawn sub-agents
    maxIterations:  3,
    trustedSources: ['openweathermap.org'],
  },
  chatAssistantAgent: {
    description:    'Answers user questions about air quality.',
    allowedTasks:   ['answerQuestion', 'provideSuggestion', 'explainAQI'],
    canCallAgents:  ['airQualityAgent'],
    maxIterations:  5,
    trustedSources: ['groq.com'],
  },
  healthAdvisoryAgent: {
    description:    'Generates health recommendations based on AQI data.',
    allowedTasks:   ['generateRecommendations', 'classifyRisk', 'personaliseAdvice'],
    canCallAgents:  ['airQualityAgent'],
    maxIterations:  2,
    trustedSources: [],
  },
};

// ── Loop detection state ──────────────────────────────────────────────────────
const agentCallGraph = new Map();  // agentName → [{ calledAgent, timestamp }]
const MAX_DEPTH       = 4;          // maximum agent call chain depth

function recordAgentCall(fromAgent, toAgent) {
  if (!agentCallGraph.has(fromAgent)) agentCallGraph.set(fromAgent, []);
  agentCallGraph.get(fromAgent).push({ calledAgent: toAgent, timestamp: Date.now() });
}

function detectLoop(fromAgent, toAgent, depth = 0) {
  if (depth > MAX_DEPTH) return true;
  const calls = agentCallGraph.get(toAgent) || [];
  return calls.some((c) => c.calledAgent === fromAgent || detectLoop(toAgent, c.calledAgent, depth + 1));
}

export function resetAgentCallGraph() {
  agentCallGraph.clear();
}

// ── Agent validators ──────────────────────────────────────────────────────────

export function validateAgentAccess(agentName) {
  if (!AGENT_REGISTRY[agentName]) {
    return {
      allowed: false,
      type:    'AGENT_NOT_REGISTERED',
      message: `Agent "${agentName}" is not registered in the agent registry.`,
    };
  }
  return { allowed: true, agent: AGENT_REGISTRY[agentName] };
}

export function validateTaskAssignment(agentName, taskName) {
  const agent = AGENT_REGISTRY[agentName];
  if (!agent) {
    return { valid: false, type: 'UNKNOWN_AGENT', message: `Agent "${agentName}" is not registered.` };
  }
  if (!agent.allowedTasks.includes(taskName)) {
    return {
      valid:   false,
      type:    'UNAUTHORIZED_TASK',
      message: `Agent "${agentName}" is not permitted to execute task "${taskName}". Allowed: ${agent.allowedTasks.join(', ')}.`,
    };
  }
  return { valid: true };
}

export function validateAgentCommunication(fromAgent, toAgent) {
  const from = AGENT_REGISTRY[fromAgent];
  if (!from) {
    return { allowed: false, type: 'UNKNOWN_SOURCE_AGENT', message: `Source agent "${fromAgent}" is not registered.` };
  }
  if (!AGENT_REGISTRY[toAgent]) {
    return { allowed: false, type: 'UNKNOWN_TARGET_AGENT', message: `Target agent "${toAgent}" is not registered.` };
  }
  if (!from.canCallAgents.includes(toAgent)) {
    return {
      allowed: false,
      type:    'UNAUTHORIZED_AGENT_CALL',
      message: `Agent "${fromAgent}" is not permitted to call "${toAgent}".`,
    };
  }
  // Loop detection
  if (detectLoop(fromAgent, toAgent)) {
    return {
      allowed: false,
      type:    'AGENT_LOOP_DETECTED',
      message: `Circular agent call detected: "${fromAgent}" → "${toAgent}" would create an infinite loop.`,
    };
  }
  recordAgentCall(fromAgent, toAgent);
  return { allowed: true };
}

export function validateAgentOutput(agentName, output) {
  if (!output || (typeof output !== 'object' && typeof output !== 'string')) {
    return {
      valid:   false,
      type:    'INVALID_AGENT_OUTPUT',
      message: `Agent "${agentName}" returned a null or malformed output.`,
    };
  }
  // Verify air quality agent outputs have required fields
  if (agentName === 'airQualityAgent' && typeof output === 'object') {
    const required = ['city', 'aqi', 'pm25'];
    const missing  = required.filter((f) => output[f] === undefined);
    if (missing.length > 0) {
      return {
        valid:   false,
        type:    'INCOMPLETE_AGENT_OUTPUT',
        message: `airQualityAgent output is missing required fields: ${missing.join(', ')}.`,
      };
    }
  }
  return { valid: true };
}

export function checkIterationLimit(agentName) {
  const agent = AGENT_REGISTRY[agentName];
  const calls = (agentCallGraph.get(agentName) || []).length;
  if (calls >= (agent?.maxIterations || 5)) {
    return {
      allowed: false,
      type:    'AGENT_ITERATION_EXCEEDED',
      message: `Agent "${agentName}" has exceeded its maximum iteration limit of ${agent?.maxIterations}.`,
      iterations: calls,
    };
  }
  return { allowed: true, iterations: calls };
}

/**
 * Master multi-agent guardrail.
 * @param {string} fromAgent  — calling agent
 * @param {string} toAgent    — target agent (or same for self-check)
 * @param {string} taskName   — task being assigned
 * @param {*}      output     — output to validate (optional)
 * @returns {{ passed: boolean, violations: Array }}
 */
export function runMultiAgentGuardrails(fromAgent, toAgent, taskName, output = null) {
  const violations = [];

  // 1. Access control
  const access = validateAgentAccess(toAgent);
  if (!access.allowed) violations.push(access);

  // 2. Task assignment
  if (taskName) {
    const task = validateTaskAssignment(toAgent, taskName);
    if (!task.valid) violations.push(task);
  }

  // 3. Communication permission + loop detection
  if (fromAgent !== toAgent) {
    const comm = validateAgentCommunication(fromAgent, toAgent);
    if (!comm.allowed) violations.push(comm);
  }

  // 4. Iteration limit
  const iter = checkIterationLimit(toAgent);
  if (!iter.allowed) violations.push(iter);

  // 5. Output validation
  if (output !== null) {
    const out = validateAgentOutput(toAgent, output);
    if (!out.valid) violations.push(out);
  }

  return {
    passed:     violations.length === 0,
    violations,
    fromAgent,
    toAgent,
    taskName,
    timestamp:  new Date().toISOString(),
  };
}
