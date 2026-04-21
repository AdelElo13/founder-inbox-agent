import type { gmail_v1 } from "googleapis";
import { getGmailClient } from "./auth.ts";
import { LABELS, ensureLabels } from "./labels.ts";

/**
 * Terminal state a message can transition to. Every label-bearing commit
 * point in the pipeline calls `markMessageTerminal` so INBOX_AGENT_QUEUED
 * never outlives the decision — otherwise the founder's Gmail accumulates
 * dangling QUEUED labels on messages we've already decided about.
 *
 * Why not split into separate helpers? Because the label-transition math
 * is the same every time (always -QUEUED, always +PROCESSED, sometimes
 * +SENT/+REJECTED) and we want exactly one place to change it.
 *
 * Idempotency model:
 *   pollGmail → +QUEUED (atomic, before pipeline runs)
 *   pipeline decides → this function → +PROCESSED (+SENT|+REJECTED) -QUEUED
 *   next poll filters on `-label:QUEUED -label:PROCESSED` → never seen again
 *
 * Terminal transitions ALWAYS clear the ESCALATED marker if present — once
 * the founder has resolved an escalation (approve/reject/edit), the Gmail
 * filter `label:INBOX_AGENT_ESCALATED` should show "still pending" and
 * nothing else.
 *
 * If the process crashes between +QUEUED and this call, the message is
 * silently orphaned — still filtered out by the poll (good, no duplicate
 * card) but missing its terminal label. Operators can reprocess manually
 * by stripping INBOX_AGENT_QUEUED in Gmail.
 *
 * Best-effort contract: this function MUST NOT throw. Callers are commit
 * points (event log + queue already updated); a Gmail API blip here should
 * not invalidate that state. All errors are caught, logged, and swallowed.
 */
export type TerminalOutcome =
  | "sent"          // approved & replied
  | "rejected"      // founder rejected OR no-reply guard fired
  | "dropped"       // classifier said noise
  | "escalated"     // Telegram card shown, still pending founder decision
  | "blocked";      // injection guard tripped — flagged + pending review

interface ApplyOptions {
  gmail?: gmail_v1.Gmail;
}

export async function markMessageTerminal(
  messageId: string,
  outcome: TerminalOutcome,
  options: ApplyOptions = {},
): Promise<void> {
  try {
    // getGmailClient() reads the on-disk token; can throw if file rotated
    // mid-run or if OAuth has been revoked. Either way, label bookkeeping
    // is not worth aborting the caller.
    const gmail = options.gmail ?? getGmailClient();

    // ensureLabels() makes a Gmail API call and can throw on 429 / 5xx /
    // network errors. Previously the try/catch only wrapped .modify() so
    // this layer's failure would bubble up and crash the caller even
    // though we'd already committed downstream state.
    const labelIds = await ensureLabels(gmail);

    const queuedId = labelIds[LABELS.QUEUED];
    const processedId = labelIds[LABELS.PROCESSED];
    const sentId = labelIds[LABELS.SENT];
    const rejectedId = labelIds[LABELS.REJECTED];
    const escalatedId = labelIds[LABELS.ESCALATED];

    const addLabelIds: string[] = [];
    const removeLabelIds: string[] = [];

    if (outcome === "escalated" || outcome === "blocked") {
      // Non-terminal: keep QUEUED in place (message still awaiting a
      // founder decision) and only add the ESCALATED marker so the
      // founder can filter `label:INBOX_AGENT_ESCALATED` in Gmail.
      if (escalatedId) addLabelIds.push(escalatedId);
    } else {
      // Terminal: flip QUEUED → PROCESSED, add state label, and always
      // clear ESCALATED (if present) so that label stays meaningful as
      // "still pending". Without this, an approved thread stays visible
      // under ESCALATED forever.
      if (processedId) addLabelIds.push(processedId);
      if (queuedId) removeLabelIds.push(queuedId);
      if (escalatedId) removeLabelIds.push(escalatedId);
      if (outcome === "sent" && sentId) addLabelIds.push(sentId);
      if (outcome === "rejected" && rejectedId) addLabelIds.push(rejectedId);
    }

    if (addLabelIds.length === 0 && removeLabelIds.length === 0) return;

    await gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: { addLabelIds, removeLabelIds },
    });
  } catch (err) {
    // Every failure path is swallowed — caller has already recorded the
    // decision in the event log / queue, and the poll filter prevents
    // duplicate processing regardless of label state. Log once so the
    // operator can investigate if it becomes a pattern.
    console.warn(
      `[lifecycle] failed to mark ${messageId} as ${outcome}:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}
