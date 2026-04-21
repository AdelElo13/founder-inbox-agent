import { Context, Markup, Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { markMessageTerminal } from "../gmail/lifecycle.ts";
import { sendReply } from "../gmail/sender.ts";
import { recordInteractionFromApproval } from "../memory/learn.ts";
import { enqueue, findById, listPending, updateStatus } from "./queue.ts";
import { renderApprovalCard } from "./format.ts";
import type { ApprovalItem } from "./types.ts";

/**
 * When the founder taps "Edit" on an approval card, we record the card id
 * here keyed by their chat id. The next plain-text message they send becomes
 * the revised body for that card — we send it, update the queue, clear the
 * pending edit.
 *
 * Lives in-process (not persisted): edit prompts expire when the bot
 * restarts, which is fine — the founder just taps Edit again.
 */
const pendingEditByChat = new Map<number, string>();

const APPROVAL_TTL_MS = 30 * 60 * 1000; // 30 min before an item is considered stale

let botSingleton: Telegraf | null = null;
let adminChatIdCache: number | null = null;

function adminChatId(): number {
  if (adminChatIdCache !== null) return adminChatIdCache;
  const raw = process.env["TELEGRAM_FOUNDER_CHAT_ID"];
  if (!raw) throw new Error("TELEGRAM_FOUNDER_CHAT_ID not set in .env");
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`TELEGRAM_FOUNDER_CHAT_ID is not a number: "${raw}"`);
  }
  adminChatIdCache = parsed;
  return parsed;
}

export function getBot(): Telegraf {
  if (botSingleton) return botSingleton;

  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set in .env");

  const bot = new Telegraf(token);

  // Only respond to the founder's chat — hard-coded allowlist of one.
  bot.use(async (ctx, next) => {
    const fromId = ctx.from?.id;
    if (fromId !== adminChatId()) return;
    return next();
  });

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "Founder Inbox Agent — Telegram bridge active.\n\n" +
        "You'll get approval cards for escalated messages. " +
        "Tap Approve / Reject / Edit.\n\n" +
        "Your chat id: " + ctx.from.id,
    );
  });

  bot.command("pending", async (ctx) => {
    const pending = listPending();
    if (pending.length === 0) {
      await ctx.reply("No pending approvals.");
      return;
    }
    await ctx.reply(
      `${pending.length} pending:\n` +
        pending.map((p) => `- ${p.from.name}: ${p.subject}`).join("\n"),
    );
  });

  bot.action(/approve:(.+)/, async (ctx) => {
    const id = ctx.match[1];
    if (!id) return;
    await handleApprove(id, ctx);
  });
  bot.action(/reject:(.+)/, async (ctx) => {
    const id = ctx.match[1];
    if (!id) return;
    await handleReject(id, ctx);
  });
  bot.action(/edit:(.+)/, async (ctx) => {
    const id = ctx.match[1];
    if (!id) return;
    await handleEdit(id, ctx);
  });

  // Plain-text message handler — correlates the founder's next message with
  // the most recently Edit-tapped card and sends it as the revised body.
  bot.on(message("text"), async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const pendingId = pendingEditByChat.get(chatId);
    if (!pendingId) return; // Not in edit mode — ignore plain text.

    const item = findById(pendingId);
    if (!item || item.status !== "pending") {
      pendingEditByChat.delete(chatId);
      await ctx.reply("That approval is no longer pending. Cancelled.");
      return;
    }

    const newBody = ctx.message.text.trim();
    if (newBody.length < 10) {
      await ctx.reply("Body too short. Send the full revised reply.");
      return;
    }

    try {
      await sendReply({
        threadId: item.gmailThreadId,
        inReplyToMessageId: item.gmailMessageId,
        to: item.from.email,
        subject: item.subject,
        body: newBody,
      });
      updateStatus(pendingId, {
        status: "edited",
        resolvedAt: new Date().toISOString(),
        editedBody: newBody,
      });
      await recordInteractionFromApproval(item, "edited", newBody);
      pendingEditByChat.delete(chatId);
      await ctx.reply(`✅ Edited reply sent to ${item.from.name}.`);
    } catch (err) {
      await ctx.reply(`❌ Send failed: ${String(err).slice(0, 200)}`);
    }
  });

  botSingleton = bot;
  return bot;
}

/**
 * Send an approval card to the founder's Telegram. Returns the enqueued
 * ApprovalItem so the pipeline can log it. Persists to queue regardless of
 * whether Telegram delivery succeeds — the daily digest can still pick it up.
 */
export async function surfaceForApproval(
  init: Omit<ApprovalItem, "status" | "createdAt" | "expiresAt" | "telegramMessageId">,
): Promise<ApprovalItem> {
  const now = Date.now();
  const item: ApprovalItem = {
    ...init,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + APPROVAL_TTL_MS).toISOString(),
    status: "pending",
  };
  enqueue(item);

  try {
    const bot = getBot();
    const card = renderApprovalCard(item);
    const kb = Markup.inlineKeyboard([
      [
        Markup.button.callback("✅ Approve", `approve:${item.id}`),
        Markup.button.callback("❌ Reject", `reject:${item.id}`),
        Markup.button.callback("✏️ Edit", `edit:${item.id}`),
      ],
    ]);
    const sent = await bot.telegram.sendMessage(adminChatId(), card, {
      parse_mode: "Markdown",
      ...kb,
    });
    updateStatus(item.id, { telegramMessageId: sent.message_id });
  } catch (err) {
    console.warn("[telegram] surface failed — item still in queue:", err);
  }

  return item;
}

async function handleApprove(id: string, ctx: Context): Promise<void> {
  const item = findById(id);
  if (!item || item.status !== "pending") {
    await ctx.answerCbQuery("already handled");
    return;
  }
  // Guard: no-reply addresses will fail at Gmail send — don't even try.
  if (/no[\- ]?reply|noreply|donotreply/i.test(item.from.email)) {
    updateStatus(id, {
      status: "rejected",
      resolvedAt: new Date().toISOString(),
    });
    await markMessageTerminal(item.gmailMessageId, "rejected");
    await ctx.answerCbQuery("blocked: no-reply address");
    await ctx.editMessageText(
      `❌ Cannot reply to ${item.from.email} (no-reply). Marked rejected.`,
    );
    return;
  }

  try {
    const bodyToSend = item.editedBody ?? item.draft.body;
    await sendReply({
      threadId: item.gmailThreadId,
      inReplyToMessageId: item.gmailMessageId,
      to: item.from.email,
      subject: item.subject,
      body: bodyToSend,
    });
    // Only mark approved AFTER the send succeeds — previously we flipped
    // status first and a failing send left the queue in a lying state.
    updateStatus(id, {
      status: "approved",
      resolvedAt: new Date().toISOString(),
    });
    // Memory learns: record this outbound as a fresh interaction on the
    // sender's RelationshipCard so future drafts can cite "we replied about X".
    await recordInteractionFromApproval(item, "approved", bodyToSend);
    await ctx.answerCbQuery("sent ✓");
    await ctx.editMessageText(
      `✅ Sent to ${item.from.name} at ${new Date().toLocaleTimeString()}`,
    );
  } catch (err) {
    await ctx.answerCbQuery("send failed — see logs");
    console.error("[telegram] send failed", err);
  }
}

async function handleReject(id: string, ctx: Context): Promise<void> {
  const item = findById(id);
  if (!item || item.status !== "pending") {
    await ctx.answerCbQuery("already handled");
    return;
  }
  updateStatus(id, {
    status: "rejected",
    resolvedAt: new Date().toISOString(),
  });
  // Close the label loop — Gmail gets -QUEUED +PROCESSED +REJECTED so the
  // message no longer looks pending. Do it after updateStatus because the
  // queue is the source of truth for the UI; label write is best-effort.
  await markMessageTerminal(item.gmailMessageId, "rejected");
  await ctx.answerCbQuery("rejected");
  await ctx.editMessageText(
    `❌ Rejected — ${item.from.name}: ${item.subject}`,
  );
}

async function handleEdit(id: string, ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) {
    await ctx.answerCbQuery("no chat context");
    return;
  }
  pendingEditByChat.set(chatId, id);
  await ctx.answerCbQuery("reply with the edited body");
  await ctx.reply(
    "✏️ Reply to THIS message with the revised body. " +
      "Your next message will be sent verbatim as the reply.",
  );
}
