import type { gmail_v1 } from "googleapis";
import type { UnifiedMessage } from "../types.ts";

/**
 * Gmail returns messages as a nested MIME tree. This function flattens to
 * the plaintext body (preferred) or a tag-stripped HTML fallback, and
 * pulls common headers (From, Subject, Date) from the structured array.
 */
export function normalize(msg: gmail_v1.Schema$Message): UnifiedMessage | null {
  if (!msg.id || !msg.threadId) return null;

  const headers = msg.payload?.headers ?? [];
  const from = parseFromHeader(headerValue(headers, "From"));
  if (!from) return null;

  const subject = headerValue(headers, "Subject") ?? "";
  const dateHeader = headerValue(headers, "Date");
  const receivedAt = dateHeader
    ? new Date(dateHeader).toISOString()
    : new Date(Number(msg.internalDate ?? Date.now())).toISOString();

  const body = extractBody(msg.payload);

  return {
    id: msg.id,
    threadId: msg.threadId,
    receivedAt,
    channel: "gmail",
    from,
    subject,
    body,
    isLinkedInNotification: /linkedin\.com/i.test(from.email),
    isXNotification: /@(x|twitter)\.com$/i.test(from.email),
  };
}

function headerValue(
  headers: gmail_v1.Schema$MessagePartHeader[],
  name: string,
): string | undefined {
  const lower = name.toLowerCase();
  for (const h of headers) {
    if (h.name?.toLowerCase() === lower) return h.value ?? undefined;
  }
  return undefined;
}

function parseFromHeader(raw: string | undefined): UnifiedMessage["from"] | null {
  if (!raw) return null;
  const withName = /^"?([^"<]+?)"?\s*<([^>]+)>\s*$/.exec(raw);
  if (withName && withName[1] && withName[2]) {
    return { name: withName[1].trim(), email: withName[2].trim().toLowerCase() };
  }
  const bare = raw.trim();
  if (/^[^@\s]+@[^@\s]+$/.test(bare)) {
    return { name: bare, email: bare.toLowerCase() };
  }
  return null;
}

function extractBody(part: gmail_v1.Schema$MessagePart | undefined): string {
  if (!part) return "";

  const plain = findByMime(part, "text/plain");
  if (plain) return decodeBody(plain);

  const html = findByMime(part, "text/html");
  if (html) return stripHtml(decodeBody(html));

  return "";
}

function findByMime(
  part: gmail_v1.Schema$MessagePart,
  mime: string,
): gmail_v1.Schema$MessagePart | null {
  if (part.mimeType === mime && part.body?.data) return part;
  for (const child of part.parts ?? []) {
    const hit = findByMime(child, mime);
    if (hit) return hit;
  }
  return null;
}

function decodeBody(part: gmail_v1.Schema$MessagePart): string {
  const data = part.body?.data ?? "";
  if (!data) return "";
  return Buffer.from(data, "base64url").toString("utf8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
