import { listCardIds, readCard } from "./card-store.ts";
import { cardIdFromEmail } from "./slug.ts";
import type { RelationshipCard, UnifiedMessage } from "../types.ts";

export function resolveByEmail(email: string): RelationshipCard | null {
  return readCard(cardIdFromEmail(email));
}

export function resolveFromMessage(
  msg: UnifiedMessage,
): RelationshipCard | null {
  const card = resolveByEmail(msg.from.email);
  if (card) return card;

  // Fallback: scan all cards for a matching identity value. Slow; only for
  // the tail of the long tail. For large n, build an index on disk.
  const target = msg.from.email.trim().toLowerCase();
  for (const id of listCardIds()) {
    const candidate = readCard(id);
    if (!candidate) continue;
    const hit = candidate.identities.find(
      (i) => i.type === "email" && i.value.toLowerCase() === target,
    );
    if (hit) return candidate;
  }
  return null;
}
