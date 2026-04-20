import type { gmail_v1 } from "googleapis";
import { getGmailClient } from "./auth.ts";
import { LABELS, ensureLabels } from "./labels.ts";
import { normalize } from "./normalize.ts";
import type { UnifiedMessage } from "../types.ts";

interface PollOptions {
  /** Gmail search query. Defaults to "unread, not already processed". */
  query?: string;
  /** Max messages per poll. Default 25 (safety valve against floods). */
  maxResults?: number;
  /** Injected gmail client — overrides the default OAuth client. Test hook. */
  gmail?: gmail_v1.Gmail;
}

/**
 * Polls Gmail for messages we haven't processed yet, normalizes them, and
 * marks each as QUEUED before returning. QUEUED is a commit: if the process
 * crashes mid-pipeline the message will not be reprocessed on the next poll
 * (we filter `-label:INBOX_AGENT_QUEUED`).
 */
export async function pollGmail(
  options: PollOptions = {},
): Promise<UnifiedMessage[]> {
  const gmail = options.gmail ?? getGmailClient();
  const labels = await ensureLabels(gmail);
  const queuedId = labels[LABELS.QUEUED];
  if (!queuedId) throw new Error("Failed to resolve QUEUED label id");

  const query =
    options.query ??
    `in:inbox is:unread -label:${LABELS.QUEUED} -label:${LABELS.PROCESSED} newer_than:1d`;

  const list = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: options.maxResults ?? 25,
  });

  const ids = (list.data.messages ?? [])
    .map((m) => m.id)
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [];

  const fetched = await Promise.all(
    ids.map((id) =>
      gmail.users.messages.get({ userId: "me", id, format: "full" }),
    ),
  );

  const out: UnifiedMessage[] = [];
  for (const r of fetched) {
    const normalized = normalize(r.data);
    if (!normalized) continue;
    out.push(normalized);
  }

  // Mark all fetched messages as QUEUED in one batch so partial failures
  // below don't leak unprocessed messages.
  if (out.length > 0) {
    await gmail.users.messages.batchModify({
      userId: "me",
      requestBody: {
        ids: out.map((m) => m.id),
        addLabelIds: [queuedId],
      },
    });
  }

  return out;
}
