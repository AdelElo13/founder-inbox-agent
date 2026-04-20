import type { ActionPlan, GateDecision } from "../types.ts";

const HIGH_STAKES: ReadonlySet<ActionPlan["intent"]> = new Set([
  "investor",
  "press",
]);

export function gate(plan: ActionPlan): GateDecision {
  if (!plan.steps.length) {
    return { type: "drop", reason: "empty plan" };
  }

  const [first] = plan.steps;
  if (!first) {
    return { type: "drop", reason: "empty plan" };
  }

  // Archive is a safe auto-action regardless of confidence — the planner has
  // already decided nothing of value will be sent. Keeps noise from clogging
  // the approval queue.
  if (first.type === "archive") {
    return { type: "drop", reason: first.reason };
  }

  if (HIGH_STAKES.has(plan.intent)) {
    return {
      type: "escalate",
      plan,
      reason: `${plan.intent}: mandatory approval for high-stakes contact`,
    };
  }

  if (plan.requiresApproval || plan.confidence < 0.95) {
    return {
      type: "escalate",
      plan,
      reason: plan.approvalReason ?? `confidence=${plan.confidence.toFixed(2)}`,
    };
  }

  return { type: "auto_send", action: first };
}
