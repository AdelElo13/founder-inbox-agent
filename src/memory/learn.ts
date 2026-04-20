import { createHash } from "node:crypto";
import { readCard, writeCard } from "./card-store.ts";
import { cardIdFromEmail } from "./slug.ts";
import type { ApprovalItem } from "../telegram/types.ts";
import type { Interaction, RelationshipCard } from "../types.ts";

/**
 * Record an outbound reply as a fresh interaction on the sender's
 * RelationshipCard. This is what makes the system get SMARTER over time:
 * every approved or edited reply adds a citable memory line so future
 * drafts to the same sender can reference prior exchanges.
 *
 * If the card doesn't exist (new contact), we create a minimal one seeded
 * from the inbound email so the next message from this sender finds memory
 * instead of falling back to NEW_CONTACT research mode.
 */
export async function recordInteractionFromApproval(
  item: ApprovalItem,
  outcome: "approved" | "edited",
  sentBody: string,
): Promise<RelationshipCard> {
  const existingId = cardIdFromEmail(item.from.email);
  const existing = readCard(existingId);
  const now = new Date().toISOString();

  const interaction: Interaction = {
    id: `int-${timestampId(now)}`,
    at: now.slice(0, 10),
    channel: "gmail",
    summary: summarizeExchange(item, sentBody, outcome),
    rawRef: item.gmailMessageId,
    outcome,
  };

  if (existing) {
    const next: RelationshipCard = {
      ...existing,
      interactions: [...existing.interactions, interaction],
      lastInteractionAt: interaction.at,
    };
    writeCard(next, titleForCard(next, item));
    return next;
  }

  // Cold contact — seed a minimal card so the next inbound finds memory.
  const seeded: RelationshipCard = {
    id: existingId,
    identities: [
      {
        type: "email",
        value: item.from.email,
        provenance: `seed-from-approved-${item.gmailMessageId}`,
        confidence: 1,
      },
    ],
    contexts: [],
    interactions: [interaction],
    openAsks: [],
    importance: guessImportance(item),
    lastInteractionAt: interaction.at,
  };
  writeCard(seeded, item.from.name || item.from.email);
  return seeded;
}

function summarizeExchange(
  item: ApprovalItem,
  sentBody: string,
  outcome: "approved" | "edited",
): string {
  const inboundPreview = item.inboundPreview.replace(/\s+/g, " ").slice(0, 140);
  const replyPreview = sentBody.replace(/\s+/g, " ").slice(0, 160);
  const verb = outcome === "edited" ? "Replied (edited)" : "Replied";
  return `${verb} re "${item.subject.slice(0, 60)}": inbound "${inboundPreview}…" → sent "${replyPreview}…"`;
}

function titleForCard(card: RelationshipCard, item: ApprovalItem): string {
  if (card.contexts.length > 0) {
    const ctx = card.contexts[0];
    const company = ctx?.company ? ` — ${ctx.company}` : "";
    return `${item.from.name}${company}`;
  }
  return item.from.name || item.from.email;
}

/** Importance heuristic for cold contact seeding. High for investor/press. */
function guessImportance(item: ApprovalItem): RelationshipCard["importance"] {
  const intent = item.plan.intent;
  if (intent === "investor" || intent === "press") return 4;
  if (intent === "partner" || intent === "customer") return 3;
  return 2;
}

function timestampId(iso: string): string {
  return createHash("sha256").update(iso).digest("hex").slice(0, 8);
}
