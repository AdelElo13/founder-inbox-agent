import type { gmail_v1 } from "googleapis";
import { getGmailClient } from "./auth.ts";
import { markMessageTerminal } from "./lifecycle.ts";

interface SendReplyArgs {
  threadId: string;
  /** Original message id we're replying to — used for In-Reply-To + References. */
  inReplyToMessageId: string;
  to: string;
  subject: string;
  body: string;
  gmail?: gmail_v1.Gmail;
}

/**
 * Sends a plain-text reply threaded onto an existing conversation. Gmail
 * threads on Message-Id: we pull the In-Reply-To/References from the parent
 * so the reply appears in the same thread on recipient clients too.
 *
 * Critical invariant: once the send succeeds, this function MUST return
 * success. Previously the label mutation ran inline and could throw after
 * a successful send (e.g. transient 429 on the modify call), which the
 * Telegram bot would surface as "send failed" — causing the founder to
 * re-tap Approve and double-send the email. Label work is now routed
 * through `markMessageTerminal` which is best-effort: warn-and-swallow
 * on failure, never propagate.
 */
export async function sendReply(args: SendReplyArgs): Promise<string> {
  const gmail = args.gmail ?? getGmailClient();

  const parentMsgId = await fetchRfcMessageId(gmail, args.inReplyToMessageId);
  const raw = buildRfc822(args, parentMsgId);

  const sent = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: Buffer.from(raw).toString("base64url"),
      threadId: args.threadId,
    },
  });

  // Best-effort — any label mutation failure is logged inside the helper.
  // Never propagates, so the caller's "send succeeded" contract holds.
  await markMessageTerminal(args.inReplyToMessageId, "sent", { gmail });

  return sent.data.id ?? "";
}

async function fetchRfcMessageId(
  gmail: gmail_v1.Gmail,
  messageId: string,
): Promise<string | null> {
  const res = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "metadata",
    metadataHeaders: ["Message-ID", "Message-Id"],
  });
  const headers = res.data.payload?.headers ?? [];
  for (const h of headers) {
    if (h.name?.toLowerCase() === "message-id" && h.value) return h.value;
  }
  return null;
}

function buildRfc822(args: SendReplyArgs, parentRfcId: string | null): string {
  const threadSubject = args.subject.startsWith("Re:")
    ? args.subject
    : `Re: ${args.subject}`;
  // Content-Transfer-Encoding: 8bit — 7bit silently corrupts any non-ASCII
  // byte, which breaks Dutch-English names, smart quotes, and emojis in
  // drafts or the founder's edits. 8bit is RFC-2045 compliant and
  // accepted by every modern MTA / IMAP client.
  const headers = [
    `To: ${args.to}`,
    `Subject: ${threadSubject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ];
  if (parentRfcId) {
    headers.push(`In-Reply-To: ${parentRfcId}`);
    headers.push(`References: ${parentRfcId}`);
  }
  return `${headers.join("\r\n")}\r\n\r\n${args.body}`;
}
