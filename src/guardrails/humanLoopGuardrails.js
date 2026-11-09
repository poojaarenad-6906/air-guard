/**
 * GUARDRAIL 7 — HUMAN-IN-THE-LOOP GUARDRAILS
 * Ensures human approval for critical decisions and actions.
 * Covers: human approval before sensitive actions, manual verification,
 *         escalation to human experts, approval before data modification.
 */

// ── Actions that require human approval ──────────────────────────────────────
export const APPROVAL_REQUIRED_ACTIONS = {
  SEND_EXTERNAL_ALERT: {
    label:       'Send External Air Quality Alert',
    description: 'Sending air quality alerts to external email or SMS services.',
    riskLevel:   'medium',
    timeout:     30_000,  // 30s to approve
  },
  EXPORT_USER_DATA: {
    label:       'Export User Data',
    description: 'Exporting session or personal data to an external destination.',
    riskLevel:   'high',
    timeout:     60_000,
  },
  BULK_API_CALLS: {
    label:       'Bulk API Requests',
    description: 'Initiating more than 10 API calls in a single agent action.',
    riskLevel:   'medium',
    timeout:     30_000,
  },
  OVERWRITE_SETTINGS: {
    label:       'Overwrite Application Settings',
    description: 'Modifying or resetting stored configuration.',
    riskLevel:   'high',
    timeout:     60_000,
  },
};

// ── Escalation triggers ───────────────────────────────────────────────────────
export const ESCALATION_TRIGGERS = [
  { condition: 'aqi >= 5',           level: 'urgent',   message: 'Very Poor air quality detected. Recommend immediate human health advisory review.' },
  { condition: 'repeated_errors > 3', level: 'warning',  message: 'Multiple system errors detected. Human review recommended.' },
  { condition: 'jailbreak_attempts > 0', level: 'critical', message: 'Security violation detected. Escalate to administrator.' },
];

// ── Pending approval queue (in-memory) ───────────────────────────────────────
const pendingApprovals = new Map();
let approvalIdCounter   = 1;

/**
 * Request human approval for a critical action.
 * Returns a promise that resolves when approved/rejected (or times out).
 */
export function requestHumanApproval(actionKey, context = {}) {
  const action = APPROVAL_REQUIRED_ACTIONS[actionKey];
  if (!action) {
    return Promise.resolve({ approved: true, reason: 'Action not in approval-required list.' });
  }

  const id      = `approval_${approvalIdCounter++}`;
  const request = {
    id,
    actionKey,
    action,
    context,
    status:      'pending',   // 'pending' | 'approved' | 'rejected' | 'timeout'
    requestedAt: new Date().toISOString(),
    resolvedAt:  null,
  };

  pendingApprovals.set(id, request);

  return new Promise((resolve) => {
    // Auto-timeout
    const timer = setTimeout(() => {
      const req = pendingApprovals.get(id);
      if (req && req.status === 'pending') {
        req.status     = 'timeout';
        req.resolvedAt = new Date().toISOString();
        pendingApprovals.set(id, req);
        resolve({ approved: false, id, reason: 'Approval request timed out.' });
      }
    }, action.timeout);

    // Store resolver so UI can call it
    request._resolve = (decision) => {
      clearTimeout(timer);
      const req      = pendingApprovals.get(id);
      req.status     = decision.approved ? 'approved' : 'rejected';
      req.resolvedAt = new Date().toISOString();
      pendingApprovals.set(id, req);
      resolve({ ...decision, id });
    };
    pendingApprovals.set(id, request);
  });
}

/**
 * Resolve a pending approval from the UI.
 */
export function resolveApproval(id, approved, reason = '') {
  const req = pendingApprovals.get(id);
  if (!req || req.status !== 'pending') {
    return { success: false, message: 'Approval request not found or already resolved.' };
  }
  if (req._resolve) req._resolve({ approved, reason });
  return { success: true };
}

export function getPendingApprovals() {
  const pending = [];
  for (const [id, req] of pendingApprovals.entries()) {
    if (req.status === 'pending') pending.push({ id, ...req });
  }
  return pending;
}

/**
 * Check whether an action needs human approval before proceeding.
 */
export function needsHumanApproval(actionKey) {
  return Boolean(APPROVAL_REQUIRED_ACTIONS[actionKey]);
}

/**
 * Determine if current conditions warrant escalation to a human expert.
 * @param {{ aqi: number, errorCount: number, jailbreakAttempts: number }} context
 */
export function checkEscalation(context = {}) {
  const { aqi = 0, errorCount = 0, jailbreakAttempts = 0 } = context;
  const triggered = [];

  if (aqi >= 5)              triggered.push(ESCALATION_TRIGGERS[0]);
  if (errorCount > 3)        triggered.push(ESCALATION_TRIGGERS[1]);
  if (jailbreakAttempts > 0) triggered.push(ESCALATION_TRIGGERS[2]);

  return {
    escalationNeeded: triggered.length > 0,
    triggers: triggered,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Master human-in-the-loop guardrail.
 * @param {string} actionKey — key from APPROVAL_REQUIRED_ACTIONS
 * @param {object} context   — contextual data for the decision
 * @returns {{ requiresApproval: boolean, escalation: object }}
 */
export function runHumanLoopGuardrails(actionKey, context = {}) {
  const requiresApproval = needsHumanApproval(actionKey);
  const escalation       = checkEscalation(context);

  return {
    requiresApproval,
    action:    APPROVAL_REQUIRED_ACTIONS[actionKey] || null,
    escalation,
    timestamp: new Date().toISOString(),
  };
}
