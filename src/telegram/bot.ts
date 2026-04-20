import { Context, Markup, Telegraf } from "telegraf";
import { sendReply } from "../gmail/sender.ts";
import { enqueue, findById, listPending, updateStatus } from "./queue.ts";
import { renderApprovalCard } from "./format.ts";
import type { ApprovalItem } from "./types.ts";

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
  try {
    const bodyToSend = item.editedBody ?? item.draft.body;
    await sendReply({
      threadId: item.gmailThreadId,
      inReplyToMessageId: item.gmailMessageId,
      to: item.from.email,
      subject: item.subject,
      body: bodyToSend,
    });
    updateStatus(id, {
      status: "approved",
      resolvedAt: new Date().toISOString(),
    });
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
  await ctx.answerCbQuery("rejected");
  await ctx.editMessageText(
    `❌ Rejected — ${item.from.name}: ${item.subject}`,
  );
}

async function handleEdit(id: string, ctx: Context): Promise<void> {
  await ctx.answerCbQuery("reply with the edited body");
  await ctx.reply(
    `Reply to this message with the revised body for approval item ${id}. ` +
      `Your next message will be used verbatim as the email.`,
  );
  // TODO (Day 3): correlate the next text message from admin with this id
  // via a pending-edit map, then sendReply with the new body.
}
