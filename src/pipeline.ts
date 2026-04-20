import { pollGmail } from "./gmail/poller.ts";
import { classify } from "./agents/classifier.ts";
import { recall } from "./agents/memory.ts";
import { draft as draftReply } from "./agents/drafter.ts";
import { verify } from "./agents/verifier.ts";
import { plan } from "./agents/planner.ts";
import { gate } from "./confidence/gate.ts";
import { researchSender } from "./research/sender.ts";
import { recordPipelineOutcome } from "./metrics/events.ts";
import { scanForInjection } from "./security/injection.ts";
import { surfaceForApproval } from "./telegram/bot.ts";
import type { ActionPlan, GateDecision, IntentResult, ResearchCard, UnifiedMessage } from "./types.ts";

async function handleFlagged(
  msg: UnifiedMessage,
  started: number,
  reason: string,
): Promise<void> {
  const elapsed = Date.now() - started;
  const intent: IntentResult = {
    label: "unknown",
    urgency: "today",
    risk: "high",
    confidence: 0,
    reasoning: `BLOCKED: ${reason}`,
  };
  const draft = {
    body:
      "🛡 BLOCKED by injection guard. No draft generated.\n\n" +
      `Reason: ${reason}\n\n` +
      "Raw email preview below — review before taking any action.",
    claims: [],
    confidence: 0,
    verifierPass: false,
    verifierNotes: `injection guard: ${reason}`,
  };
  const plan: ActionPlan = {
    intent: "unknown",
    urgency: "today",
    confidence: 0,
    riskTier: "high",
    requiresApproval: true,
    approvalReason: `prompt-injection guard tripped: ${reason}`,
    steps: [
      {
        type: "route_to",
        target: "telegram",
        note: "Flagged as prompt injection — founder must review raw email.",
      },
    ],
  };
  const decision: GateDecision = {
    type: "escalate",
    plan,
    reason: `prompt-injection: ${reason}`,
  };

  console.log(
    `[pipeline] msg=${msg.id} BLOCKED by injection guard — ${reason}`,
  );

  let telegramCardId: string | undefined;
  if (telegramEnabled()) {
    try {
      const item = await surfaceForApproval({
        id: `${msg.id}-${started}-blocked`,
        gmailMessageId: msg.id,
        gmailThreadId: msg.threadId,
        from: msg.from,
        subject: `🛡 BLOCKED: ${msg.subject}`.slice(0, 120),
        inboundPreview: msg.body.slice(0, 300),
        draft,
        plan,
      });
      telegramCardId = item.id;
    } catch (err) {
      console.warn(`[pipeline] telegram surface failed for ${msg.id}:`, err);
    }
  }

  recordPipelineOutcome({
    msg,
    intent,
    cardMatched: false,
    researchAttempted: false,
    researchUrls: 0,
    draft,
    plan,
    decision,
    elapsedMs: elapsed,
    ...(telegramCardId && { telegramCardId }),
  });
}

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

  // First line of defence: prompt-injection scan. If the message carries a
  // known pattern, short-circuit to "unknown + escalate" — we never run the
  // classifier/drafter on adversarial content, so the model can't be tricked
  // into auto-sending or exfiltrating the system prompt. The founder sees
  // the raw email plus the reason and decides.
  const injection = scanForInjection(msg);
  if (injection.flagged) {
    await handleFlagged(msg, started, injection.reason ?? "prompt injection");
    return;
  }

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

  let telegramCardId: string | undefined;
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
      telegramCardId = item.id;
      console.log(
        `[pipeline] msg=${msg.id} intent=${intent.label} → escalate (telegram=${item.id}) elapsed_ms=${elapsed}`,
      );
    } catch (err) {
      console.warn(`[pipeline] telegram surface failed for ${msg.id}:`, err);
    }
  } else {
    console.log(
      `[pipeline] msg=${msg.id} intent=${intent.label} verified=${verified.verifierPass} ` +
        `decision=${decision.type} elapsed_ms=${elapsed}`,
    );
  }

  recordPipelineOutcome({
    msg,
    intent,
    cardMatched: card !== null,
    researchAttempted: research !== null,
    researchUrls: research ? Object.keys(research.snippets).length : 0,
    draft: verified,
    plan: action,
    decision,
    elapsedMs: elapsed,
    ...(telegramCardId && { telegramCardId }),
  });
}
