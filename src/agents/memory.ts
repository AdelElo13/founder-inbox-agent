import type { IntentResult, RelationshipCard, UnifiedMessage } from "../types.ts";
import { resolveFromMessage } from "../memory/identity.ts";

export async function recall(
  msg: UnifiedMessage,
  _intent: IntentResult,
): Promise<RelationshipCard | null> {
  return resolveFromMessage(msg);
}
