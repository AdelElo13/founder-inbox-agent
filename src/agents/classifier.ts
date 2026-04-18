import type { IntentResult, UnifiedMessage } from "../types.ts";

export async function classify(_msg: UnifiedMessage): Promise<IntentResult> {
  // Day 1 TODO: Claude Agent SDK with Opus 4.7, strict output schema.
  throw new Error("classifier: not implemented");
}
