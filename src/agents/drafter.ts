import type {
  DraftWithEvidence,
  IntentResult,
  RelationshipCard,
  UnifiedMessage,
} from "../types.ts";

export async function draft(
  _msg: UnifiedMessage,
  _card: RelationshipCard | null,
  _intent: IntentResult,
): Promise<DraftWithEvidence> {
  // Day 1 TODO: draft reply body + parallel EvidenceClaim[] with char-range citations.
  throw new Error("drafter: not implemented");
}
