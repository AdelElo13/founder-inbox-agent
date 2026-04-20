import type { gmail_v1 } from "googleapis";

/**
 * Naming choice: `INBOX_AGENT_*` instead of `LOBBY_*` or `RESPONDER_*` so the
 * final product name (TBD pre-submission) can change without rewriting the
 * labels on every processed message.
 */
export const LABELS = {
  QUEUED: "INBOX_AGENT_QUEUED",
  PROCESSED: "INBOX_AGENT_PROCESSED",
  SENT: "INBOX_AGENT_SENT",
  REJECTED: "INBOX_AGENT_REJECTED",
  ESCALATED: "INBOX_AGENT_ESCALATED",
} as const;

export type LabelKey = keyof typeof LABELS;

interface LabelMap {
  [name: string]: string;
}

/**
 * Ensures all agent labels exist on the user's Gmail. Returns a map from
 * label name to Gmail's internal label id (needed for list/get/modify calls).
 *
 * Idempotent — calling repeatedly is safe. Gmail returns 409 on duplicate
 * creation which we interpret as "already there" and fetch the existing id.
 */
export async function ensureLabels(
  gmail: gmail_v1.Gmail,
): Promise<LabelMap> {
  const existing = await gmail.users.labels.list({ userId: "me" });
  const byName: LabelMap = {};
  for (const label of existing.data.labels ?? []) {
    if (label.name && label.id) byName[label.name] = label.id;
  }

  for (const name of Object.values(LABELS)) {
    if (byName[name]) continue;
    const created = await gmail.users.labels.create({
      userId: "me",
      requestBody: {
        name,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
    });
    if (created.data.id) byName[name] = created.data.id;
  }
  return byName;
}
