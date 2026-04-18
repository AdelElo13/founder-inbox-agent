import type {
  ActionPlan,
  DraftWithEvidence,
  IntentResult,
  RelationshipCard,
} from "../types.ts";

export async function plan(
  _draft: DraftWithEvidence,
  _intent: IntentResult,
  _card: RelationshipCard | null,
): Promise<ActionPlan> {
  // Day 2 TODO: choose reply/archive/route_to based on intent + verifier outcome.
  throw new Error("planner: not implemented");
}
