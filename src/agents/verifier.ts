import type {
  DraftWithEvidence,
  RelationshipCard,
  UnifiedMessage,
} from "../types.ts";

export async function verify(
  draft: DraftWithEvidence,
  _card: RelationshipCard | null,
  _msg: UnifiedMessage,
): Promise<DraftWithEvidence> {
  // Day 1 TODO: reject drafts where any claim's cites[] is empty or refs don't exist.
  // Return { ...draft, verifierPass: true/false, verifierNotes }.
  return { ...draft, verifierPass: false, verifierNotes: "verifier: not implemented" };
}
