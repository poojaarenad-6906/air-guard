/**
 * GUARDRAIL ENGINE — Unified entry point for all 9 guardrail categories.
 *
 * Usage:
 *   import { GuardrailEngine } from './guardrails';
 *
 *   // Before sending user input to AI:
 *   const result = GuardrailEngine.validateInput(userText, 'chat');
 *   if (!result.passed) { showError(result.primaryMessage); return; }
 *
 *   // After receiving AI response:
 *   const out = GuardrailEngine.validateOutput(aiText, { aqiLevel: 3 });
 *   displayText(out.text);
 */

export { runInputGuardrails,  detectPromptInjection, detectPII, detectMaliciousInput }  from './inputGuardrails.js';
export { runOutputGuardrails, detectToxicOutput, detectHallucination, redactSensitiveOutput } from './outputGuardrails.js';
export { runToolGuardrails,   validateToolAccess, checkRateLimit, TOOL_REGISTRY }       from './toolGuardrails.js';
export { runDataGuardrails,   sanitizeAirQualityData, maskPII, anonymizeData }           from './dataGuardrails.js';
export { runSecurityGuardrails, detectJailbreak, detectSQLInjection, detectXSS, sanitizeForDisplay } from './securityGuardrails.js';
export { runOperationalGuardrails, withTimeout, withRetry, recordApiCall, recordChatMessage,
         getSessionStats, estimateTokens, OPERATIONAL_LIMITS }                           from './operationalGuardrails.js';
export { runHumanLoopGuardrails, checkEscalation, requestHumanApproval, resolveApproval,
         getPendingApprovals }                                                            from './humanLoopGuardrails.js';
export { runMultiAgentGuardrails, validateAgentAccess, validateTaskAssignment,
         validateAgentCommunication, AGENT_REGISTRY }                                    from './multiAgentGuardrails.js';
export { runEthicsGuardrails, detectBias, checkCompliance, logAuditEvent,
         getAuditLog, explainGuardrailDecision, COMPLIANCE_RULES }                       from './ethicsGuardrails.js';

// ── Imports for the engine ────────────────────────────────────────────────────
import { runInputGuardrails }        from './inputGuardrails.js';
import { runOutputGuardrails }       from './outputGuardrails.js';
import { runToolGuardrails }         from './toolGuardrails.js';
import { runDataGuardrails }         from './dataGuardrails.js';
import { runSecurityGuardrails }     from './securityGuardrails.js';
import { runOperationalGuardrails, recordApiCall, recordChatMessage }   from './operationalGuardrails.js';
import { runHumanLoopGuardrails }    from './humanLoopGuardrails.js';
import { runMultiAgentGuardrails }   from './multiAgentGuardrails.js';
import { runEthicsGuardrails, logAuditEvent } from './ethicsGuardrails.js';

// ── Severity helpers ──────────────────────────────────────────────────────────
function getFirstBlockingViolation(violations = []) {
  return violations.find((v) => !v.severity || v.severity === 'error' || v.severity === 'critical');
}

function formatViolationMessage(violations = []) {
  const blocking = getFirstBlockingViolation(violations);
  if (blocking) return blocking.message;
  const warnings = violations.filter((v) => v.severity === 'warning');
  if (warnings.length > 0) return warnings[0].message;
  return null;
}

// ── GuardrailEngine ───────────────────────────────────────────────────────────
export const GuardrailEngine = {

  /**
   * Full INPUT pipeline — runs Security → Input → Operational guardrails.
   * Call this BEFORE sending any user text to an AI or API.
   *
   * @param {string} text     — raw user input
   * @param {'chat'|'citySearch'} context
   * @returns {{ passed: boolean, primaryMessage: string|null, sanitized: string, details: object }}
   */
  validateInput(text, context = 'chat') {
    const allViolations = [];

    // Layer 1 — Security (deepest, run first)
    const security = runSecurityGuardrails(text);
    if (!security.passed) allViolations.push(...security.violations);

    // Layer 2 — Input validation + injection + PII
    const input = runInputGuardrails(security.sanitized, context);
    if (!input.passed) allViolations.push(...input.violations);

    // Layer 3 — Operational limits
    const ops = runOperationalGuardrails(text);
    if (!ops.passed) allViolations.push(...ops.violations);

    const passed = !getFirstBlockingViolation(allViolations);

    // Audit every input attempt
    logAuditEvent({
      category:    'input_validation',
      passed,
      context,
      violations:  allViolations.length,
      textPreview: text?.slice(0, 80),
    });

    return {
      passed,
      primaryMessage: formatViolationMessage(allViolations),
      sanitized:      input.sanitized || security.sanitized || text,
      details:        { security, input, ops },
      allViolations,
    };
  },

  /**
   * Full OUTPUT pipeline — runs Output → Ethics guardrails.
   * Call this AFTER receiving an AI response, BEFORE displaying it.
   *
   * @param {string} text   — raw AI response
   * @param {object} ctx    — { aqiLevel, isDemo, hasHealthAdvice }
   * @returns {{ passed: boolean, text: string, disclaimer: string|null, details: object }}
   */
  validateOutput(text, ctx = {}) {
    const allViolations = [];

    // Layer 1 — Output content validation
    const output = runOutputGuardrails(text);
    if (!output.passed) allViolations.push(...output.violations);

    // Layer 2 — Ethics & compliance
    const ethics = runEthicsGuardrails(output.text, {
      ...ctx,
      hasDisclaimer: Boolean(output.disclaimer),
    });
    allViolations.push(...ethics.violations);

    // Record API call token usage
    const { estimateTokens } = { estimateTokens: (t) => Math.ceil((t || '').length / 4) };
    recordApiCall(estimateTokens(text) + estimateTokens(text));
    recordChatMessage();

    return {
      passed:         !getFirstBlockingViolation(allViolations),
      text:           output.text,
      disclaimer:     output.disclaimer,
      details:        { output, ethics },
      allViolations,
    };
  },

  /**
   * Tool execution check — validates before calling any external API.
   * @param {string} toolName
   * @param {object} params
   * @param {string} url
   */
  validateToolCall(toolName, params = {}, url = '') {
    return runToolGuardrails(toolName, params, url);
  },

  /**
   * Data access check — validates and sanitizes data before displaying.
   * @param {object} data
   * @param {string} role  'guest' | 'user' | 'admin'
   */
  validateData(data, role = 'guest') {
    return runDataGuardrails(data, role, 'canRead');
  },

  /**
   * Multi-agent coordination check.
   */
  validateAgentCall(fromAgent, toAgent, taskName, output = null) {
    return runMultiAgentGuardrails(fromAgent, toAgent, taskName, output);
  },

  /**
   * Human-in-the-loop check for a proposed action.
   */
  checkHumanApproval(actionKey, context = {}) {
    return runHumanLoopGuardrails(actionKey, context);
  },
};

export default GuardrailEngine;
