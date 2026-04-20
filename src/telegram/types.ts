import type { ActionPlan, DraftWithEvidence, UnifiedMessage } from "../types.ts";

/**
 * One pending approval that the Telegram bot surfaces to the founder.
 * Serializes to JSONL so crashes don't lose pending items.
 */
export interface ApprovalItem {
  id: string; // unique — derived from Gmail message id + timestamp
  createdAt: string;
  expiresAt: string; // if no answer by this time, daily digest surfaces it
  gmailMessageId: string;
  gmailThreadId: string;
  from: UnifiedMessage["from"];
  subject: string;
  /** 0-300 chars of the inbound body for preview in Telegram. */
  inboundPreview: string;
  draft: DraftWithEvidence;
  plan: ActionPlan;
  status: "pending" | "approved" | "rejected" | "edited" | "expired";
  /** Populated when status ≠ "pending". */
  resolvedAt?: string;
  /** Chat message id in Telegram so the bot can edit the card in place. */
  telegramMessageId?: number;
  /** If edited, the founder's revised body replacing draft.body. */
  editedBody?: string;
}
