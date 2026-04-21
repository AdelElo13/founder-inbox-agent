import { describe, expect, it, vi } from "vitest";
import { sendReply } from "./sender.ts";

/**
 * These tests cover the critical contract from Gemini round-4:
 *   once `messages.send` succeeds, `sendReply` MUST resolve with the new
 *   message id — even if the follow-up label mutation fails. Previously
 *   an inline label .modify() could throw post-send, causing the Telegram
 *   bot to surface "send failed" and the founder to re-tap Approve → a
 *   duplicate email. This is now impossible because the label work is
 *   routed through the best-effort `markMessageTerminal`.
 */

function makeFakeGmail(opts: { modifyThrows?: boolean } = {}) {
  const labelList = [
    { name: "INBOX_AGENT_QUEUED", id: "L_Q" },
    { name: "INBOX_AGENT_PROCESSED", id: "L_P" },
    { name: "INBOX_AGENT_SENT", id: "L_S" },
    { name: "INBOX_AGENT_REJECTED", id: "L_R" },
    { name: "INBOX_AGENT_ESCALATED", id: "L_E" },
  ];
  const send = vi.fn(async () => ({ data: { id: "new-msg-id" } }));
  const getMsg = vi.fn(async () => ({
    data: {
      payload: {
        headers: [{ name: "Message-Id", value: "<original@example.com>" }],
      },
    },
  }));
  const modify = opts.modifyThrows
    ? vi.fn(async () => {
        throw new Error("429 rate-limited");
      })
    : vi.fn(async () => ({ data: {} }));
  const gmail = {
    users: {
      labels: {
        list: vi.fn(async () => ({ data: { labels: labelList } })),
      },
      messages: { send, get: getMsg, modify },
    },
  };
  return { gmail: gmail as any, send, getMsg, modify };
}

describe("sendReply", () => {
  it("returns the new message id on successful send + label flip", async () => {
    const { gmail, send, modify } = makeFakeGmail();
    const id = await sendReply({
      threadId: "t-1",
      inReplyToMessageId: "parent-1",
      to: "contact@example.com",
      subject: "Test",
      body: "Hello",
      gmail,
    });
    expect(id).toBe("new-msg-id");
    expect(send).toHaveBeenCalledOnce();
    expect(modify).toHaveBeenCalledOnce();
  });

  it("still returns success when label modify throws (best-effort)", async () => {
    const { gmail, send, modify } = makeFakeGmail({ modifyThrows: true });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const id = await sendReply({
      threadId: "t-1",
      inReplyToMessageId: "parent-1",
      to: "contact@example.com",
      subject: "Test",
      body: "Hello",
      gmail,
    });
    // Critical contract: send succeeded → caller sees success → no retry loop
    expect(id).toBe("new-msg-id");
    expect(send).toHaveBeenCalledOnce();
    expect(modify).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("propagates the error when the actual send fails", async () => {
    const { gmail, modify } = makeFakeGmail();
    gmail.users.messages.send.mockRejectedValueOnce(new Error("quota exceeded"));
    await expect(
      sendReply({
        threadId: "t-1",
        inReplyToMessageId: "parent-1",
        to: "contact@example.com",
        subject: "Test",
        body: "Hello",
        gmail,
      }),
    ).rejects.toThrow(/quota/);
    // No label flip if send didn't happen
    expect(modify).not.toHaveBeenCalled();
  });

  it("RFC-822 body uses 8bit encoding (preserves Unicode)", async () => {
    const { gmail, send } = makeFakeGmail();
    await sendReply({
      threadId: "t-1",
      inReplyToMessageId: "parent-1",
      to: "contact@example.com",
      subject: "Hoi Adel — kort",
      body: "Groet vanuit Amsterdam 🇳🇱 — dit is één regel.",
      gmail,
    });
    const firstCall = send.mock.calls[0] as unknown as Array<{
      requestBody: { raw: string };
    }>;
    const raw = Buffer.from(firstCall[0]!.requestBody.raw, "base64url").toString("utf8");
    expect(raw).toMatch(/Content-Transfer-Encoding:\s*8bit/i);
    expect(raw).toContain("🇳🇱"); // unicode survives in the RFC-822 blob
    expect(raw).toContain("één");
  });
});
