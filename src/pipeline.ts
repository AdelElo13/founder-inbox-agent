import { pollGmail } from "./gmail/poller.ts";
import { classify } from "./agents/classifier.ts";
import { recall } from "./agents/memory.ts";
import { draft as draftReply } from "./agents/drafter.ts";
import { verify } from "./agents/verifier.ts";
import { plan } from "./agents/planner.ts";
import { gate } from "./confidence/gate.ts";
import { researchSender } from "./research/sender.ts";
import { surfaceForApproval } from "./telegram/bot.ts";
import type { ResearchCard, UnifiedMessage } from "./types.ts";

function telegramEnabled(): boolean {
  // Evaluated lazily — module-time check fires before index.ts loads dotenv.
  return Boolean(
    process.env["TELEGRAM_BOT_TOKEN"] && process.env["TELEGRAM_FOUNDER_CHAT_ID"],
  );
}

export async function runOnce(): Promise<void> {
  const messages = await pollGmail();
  if (messages.length === 0) {
    console.log("[pipeline] no new messages");
    return;
  }

  const tgOn = telegramEnabled();
  console.log(
    `[pipeline] ${messages.length} message${messages.length === 1 ? "" : "s"} to process` +
      (tgOn ? " (Telegram ON)" : " (Telegram OFF — set TELEGRAM_BOT_TOKEN + TELEGRAM_FOUNDER_CHAT_ID)"),
  );

  for (const msg of messages) {
    await processMessage(msg);
  }
}

async function processMessage(msg: UnifiedMessage): Promise<void> {
  const started = Date.now();

  const intent = await classify(msg);
  const card = await recall(msg, intent);

  // Public-signal research fires only when we have no card and the intent
  // is worth replying to. Skipping for noise saves a handful of HTTP calls.
  let research: ResearchCard | null = null;
  if (!card && intent.label !== "noise" && intent.label !== "unknown") {
    research = await researchSender(msg);
  }

  let drafted;
  if (intent.label === "noise") {
    drafted = {
      body: "",
      claims: [],
      confidence: 0,
      verifierPass: false,
      verifierNotes: "noise: drafter skipped",
    };
  } else {
    drafted = await draftReply(msg, card, intent, research);
  }

  const verified = await verify(drafted, card, msg, research);
  const action = await plan(verified, intent, card);
  const decision = gate(action);

  const elapsed = Date.now() - started;

  if (decision.type === "escalate" && telegramEnabled()) {
    try {
      const item = await surfaceForApproval({
        id: `${msg.id}-${started}`,
        gmailMessageId: msg.id,
        gmailThreadId: msg.threadId,
        from: msg.from,
        subject: msg.subject,
        inboundPreview: msg.body.slice(0, 300),
        draft: verified,
        plan: action,
      });
      console.log(
        `[pipeline] msg=${msg.id} intent=${intent.label} → escalate (telegram=${item.id}) elapsed_ms=${elapsed}`,
      );
      return;
    } catch (err) {
      console.warn(`[pipeline] telegram surface failed for ${msg.id}:`, err);
    }
  }

  console.log(
    `[pipeline] msg=${msg.id} intent=${intent.label} verified=${verified.verifierPass} ` +
      `decision=${decision.type} elapsed_ms=${elapsed}`,
  );
}
