import type { gmail_v1 } from "googleapis";
import { getGmailClient } from "./auth.ts";
import { LABELS, ensureLabels } from "./labels.ts";

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
 */
export async function sendReply(args: SendReplyArgs): Promise<string> {
  const gmail = args.gmail ?? getGmailClient();
  const labels = await ensureLabels(gmail);
  const sentLabelId = labels[LABELS.SENT];
  const processedLabelId = labels[LABELS.PROCESSED];
  const queuedLabelId = labels[LABELS.QUEUED];
  const escalatedLabelId = labels[LABELS.ESCALATED];

  const parentMsgId = await fetchRfcMessageId(gmail, args.inReplyToMessageId);
  const raw = buildRfc822(args, parentMsgId);

  const sent = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: Buffer.from(raw).toString("base64url"),
      threadId: args.threadId,
    },
  });

  // Move the original from QUEUED → PROCESSED + SENT. This is the commit
  // point: once labels flip, the pipeline will not reprocess the message.
  // Also strip ESCALATED (if the founder approved from a Telegram card) so
  // the "still pending" filter in Gmail stops showing this thread.
  const addLabelIds = [processedLabelId, sentLabelId].filter(
    (id): id is string => Boolean(id),
  );
  const removeLabelIds = [queuedLabelId, escalatedLabelId].filter(
    (id): id is string => Boolean(id),
  );

  await gmail.users.messages.modify({
    userId: "me",
    id: args.inReplyToMessageId,
    requestBody: { addLabelIds, removeLabelIds },
  });

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
  const headers = [
    `To: ${args.to}`,
    `Subject: ${threadSubject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
  ];
  if (parentRfcId) {
    headers.push(`In-Reply-To: ${parentRfcId}`);
    headers.push(`References: ${parentRfcId}`);
  }
  return `${headers.join("\r\n")}\r\n\r\n${args.body}`;
}
