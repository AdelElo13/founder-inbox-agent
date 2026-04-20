import { expect, it } from "vitest";
import { normalize } from "./normalize.ts";
import type { gmail_v1 } from "googleapis";

function base64url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

const plainTextMessage: gmail_v1.Schema$Message = {
  id: "msg-1",
  threadId: "thread-1",
  internalDate: "1714000000000",
  payload: {
    mimeType: "text/plain",
    headers: [
      { name: "From", value: '"Sarah Chen" <sarah@ribbit.vc>' },
      { name: "Subject", value: "Following up on our Paris chat" },
      { name: "Date", value: "Mon, 15 Apr 2026 10:30:00 +0000" },
    ],
    body: { data: base64url("Hi Adel, great to meet you in Paris.\n\n— Sarah") },
  },
};

it("parses a plain-text message end-to-end", () => {
  const out = normalize(plainTextMessage);
  expect(out).not.toBeNull();
  expect(out?.id).toBe("msg-1");
  expect(out?.threadId).toBe("thread-1");
  expect(out?.from.name).toBe("Sarah Chen");
  expect(out?.from.email).toBe("sarah@ribbit.vc");
  expect(out?.subject).toBe("Following up on our Paris chat");
  expect(out?.body).toContain("great to meet you in Paris");
  expect(out?.channel).toBe("gmail");
});

it("falls back to html when plain text is missing, stripping tags", () => {
  const msg: gmail_v1.Schema$Message = {
    id: "msg-2",
    threadId: "thread-2",
    internalDate: "1714000000000",
    payload: {
      mimeType: "multipart/alternative",
      headers: [
        { name: "From", value: "bob@example.com" },
        { name: "Subject", value: "HTML only" },
      ],
      parts: [
        {
          mimeType: "text/html",
          body: {
            data: base64url(
              "<html><body><p>Hello <b>world</b></p><script>alert(1)</script></body></html>",
            ),
          },
        },
      ],
    },
  };
  const out = normalize(msg);
  expect(out?.body).toBe("Hello world");
  expect(out?.from.email).toBe("bob@example.com");
});

it("flags LinkedIn notification emails", () => {
  const msg: gmail_v1.Schema$Message = {
    id: "msg-3",
    threadId: "thread-3",
    internalDate: "1714000000000",
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "From", value: '"LinkedIn" <messaging-digest-noreply@linkedin.com>' },
        { name: "Subject", value: "You have a new message" },
      ],
      body: { data: base64url("Jane sent you a message.") },
    },
  };
  const out = normalize(msg);
  expect(out?.isLinkedInNotification).toBe(true);
  expect(out?.isXNotification).toBe(false);
});

it("returns null for messages with no id", () => {
  expect(normalize({})).toBeNull();
});

it("returns null for messages with no From header", () => {
  const msg: gmail_v1.Schema$Message = {
    id: "msg-4",
    threadId: "thread-4",
    payload: { headers: [{ name: "Subject", value: "No sender" }] },
  };
  expect(normalize(msg)).toBeNull();
});
