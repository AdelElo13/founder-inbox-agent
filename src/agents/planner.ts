import type {
  Action,
  ActionPlan,
  DraftWithEvidence,
  IntentResult,
  RelationshipCard,
} from "../types.ts";

/**
 * Deterministic planner. Given an already-drafted + verified reply plus
 * the classifier intent, produces an ActionPlan describing exactly what
 * should happen next. No LLM call — this is pure policy.
 *
 * Policy (matches DESIGN_v2 §3.4 confidence gate):
 *  - noise                   → archive, no reply
 *  - investor / press        → reply draft, MANDATORY approval
 *  - customer / partner      → reply draft, approval required unless the
 *                              draft is verifier-passed and confidence ≥0.95
 *  - unknown                 → escalate for approval with explicit flag
 *  - drafter empty / verifier fail → escalate with "cannot ground" reason
 */
export async function plan(
  draft: DraftWithEvidence,
  intent: IntentResult,
  _card: RelationshipCard | null,
): Promise<ActionPlan> {
  const riskTier = intent.risk;

  if (intent.label === "noise") {
    return {
      intent: intent.label,
      urgency: intent.urgency,
      confidence: intent.confidence,
      riskTier,
      requiresApproval: false,
      steps: [{ type: "archive", reason: "classified as noise" }],
    };
  }

  // Drafter bailed or verifier rejected — escalate, no send.
  if (!draft.verifierPass || draft.body.trim().length === 0) {
    return {
      intent: intent.label,
      urgency: intent.urgency,
      confidence: draft.confidence,
      riskTier,
      requiresApproval: true,
      approvalReason:
        draft.verifierNotes ?? "draft could not be grounded in memory",
      steps: [
        {
          type: "route_to",
          target: "telegram",
          note: "escalated: verifier veto or empty draft",
        },
      ],
    };
  }

  const replyAction: Action = {
    type: "reply",
    body: draft.body,
    threadId: "__inbound_thread__",
  };

  const highStakes =
    intent.label === "investor" || intent.label === "press" || intent.label === "unknown";
  if (highStakes) {
    return {
      intent: intent.label,
      urgency: intent.urgency,
      confidence: draft.confidence,
      riskTier,
      requiresApproval: true,
      approvalReason: `${intent.label}: mandatory approval for high-stakes contact`,
      steps: [replyAction],
    };
  }

  const autoSendOk =
    draft.verifierPass &&
    draft.confidence >= 0.95 &&
    intent.confidence >= 0.9 &&
    riskTier === "low";

  return {
    intent: intent.label,
    urgency: intent.urgency,
    confidence: draft.confidence,
    riskTier,
    requiresApproval: !autoSendOk,
    ...(autoSendOk
      ? {}
      : {
          approvalReason: `${intent.label}: requires approval (confidence ${draft.confidence.toFixed(2)})`,
        }),
    steps: [replyAction],
  };
}
