import type { ActionPlan, GateDecision } from "../types.ts";

const HIGH_STAKES: ReadonlySet<ActionPlan["intent"]> = new Set([
  "investor",
  "press",
]);

export function gate(plan: ActionPlan): GateDecision {
  if (!plan.steps.length) {
    return { type: "drop", reason: "empty plan" };
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

  const [first] = plan.steps;
  if (!first) {
    return { type: "drop", reason: "empty plan" };
  }
  return { type: "auto_send", action: first };
}
