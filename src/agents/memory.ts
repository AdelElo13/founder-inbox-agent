import type { IntentResult, RelationshipCard, UnifiedMessage } from "../types.ts";

export async function recall(
  _msg: UnifiedMessage,
  _intent: IntentResult,
): Promise<RelationshipCard | null> {
  // Day 1 TODO: identity resolution against neuromcp wiki, return card or null for new contact.
  throw new Error("memory: not implemented");
}
