import { describe, expect, it, vi } from "vitest";
import { markMessageTerminal } from "./lifecycle.ts";

/**
 * We don't go through real OAuth in tests — we pass a fake gmail client
 * that records the labels.ensure + messages.modify calls so we can assert
 * on the exact label transitions.
 */

interface FakeGmailCall {
  id: string;
  addLabelIds: string[];
  removeLabelIds: string[];
}

function makeFakeGmail() {
  const labelList = [
    { name: "INBOX_AGENT_QUEUED", id: "L_Q" },
    { name: "INBOX_AGENT_PROCESSED", id: "L_P" },
    { name: "INBOX_AGENT_SENT", id: "L_S" },
    { name: "INBOX_AGENT_REJECTED", id: "L_R" },
    { name: "INBOX_AGENT_ESCALATED", id: "L_E" },
  ];
  const calls: FakeGmailCall[] = [];
  const gmail = {
    users: {
      labels: {
        list: vi.fn(async () => ({ data: { labels: labelList } })),
      },
      messages: {
        modify: vi.fn(async ({ id, requestBody }: any) => {
          calls.push({
            id,
            addLabelIds: requestBody.addLabelIds ?? [],
            removeLabelIds: requestBody.removeLabelIds ?? [],
          });
          return { data: {} };
        }),
      },
    },
  };
  return { gmail: gmail as any, calls };
}

describe("markMessageTerminal", () => {
  it("sent: adds PROCESSED + SENT, removes QUEUED + ESCALATED", async () => {
    const { gmail, calls } = makeFakeGmail();
    await markMessageTerminal("msg-1", "sent", { gmail });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.addLabelIds.sort()).toEqual(["L_P", "L_S"]);
    expect(calls[0]!.removeLabelIds.sort()).toEqual(["L_E", "L_Q"]);
  });

  it("rejected: adds PROCESSED + REJECTED, removes QUEUED + ESCALATED", async () => {
    const { gmail, calls } = makeFakeGmail();
    await markMessageTerminal("msg-2", "rejected", { gmail });
    expect(calls[0]!.addLabelIds.sort()).toEqual(["L_P", "L_R"]);
    expect(calls[0]!.removeLabelIds.sort()).toEqual(["L_E", "L_Q"]);
  });

  it("dropped: adds PROCESSED, removes QUEUED + ESCALATED (no state-label)", async () => {
    const { gmail, calls } = makeFakeGmail();
    await markMessageTerminal("msg-3", "dropped", { gmail });
    expect(calls[0]!.addLabelIds).toEqual(["L_P"]);
    expect(calls[0]!.removeLabelIds.sort()).toEqual(["L_E", "L_Q"]);
  });

  it("escalated: adds ESCALATED, keeps QUEUED (non-terminal)", async () => {
    const { gmail, calls } = makeFakeGmail();
    await markMessageTerminal("msg-4", "escalated", { gmail });
    expect(calls[0]!.addLabelIds).toEqual(["L_E"]);
    expect(calls[0]!.removeLabelIds).toEqual([]);
  });

  it("blocked: adds ESCALATED, keeps QUEUED (non-terminal)", async () => {
    const { gmail, calls } = makeFakeGmail();
    await markMessageTerminal("msg-5", "blocked", { gmail });
    expect(calls[0]!.addLabelIds).toEqual(["L_E"]);
    expect(calls[0]!.removeLabelIds).toEqual([]);
  });

  it("modify failures are logged, not thrown (best-effort)", async () => {
    const { gmail } = makeFakeGmail();
    gmail.users.messages.modify.mockRejectedValueOnce(new Error("429"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      markMessageTerminal("msg-6", "sent", { gmail }),
    ).resolves.not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("ensureLabels failures are logged, not thrown (best-effort)", async () => {
    const { gmail } = makeFakeGmail();
    gmail.users.labels.list.mockRejectedValueOnce(new Error("503"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      markMessageTerminal("msg-7", "sent", { gmail }),
    ).resolves.not.toThrow();
    expect(warn).toHaveBeenCalled();
    // modify should never have been called because ensureLabels threw first
    expect(gmail.users.messages.modify).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
