import { pollGmail } from "./gmail/poller.ts";
import { classify } from "./agents/classifier.ts";
import { recall } from "./agents/memory.ts";
import { draft as draftReply } from "./agents/drafter.ts";
import { verify } from "./agents/verifier.ts";
import { plan } from "./agents/planner.ts";
import { gate } from "./confidence/gate.ts";
import { researchSender } from "./research/sender.ts";
import { markMessageTerminal } from "./gmail/lifecycle.ts";
import { sendReply } from "./gmail/sender.ts";
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
    injectionFlagged: true,
    ...(telegramCardId && { telegramCardId }),
  });

  // Mark the Gmail message as blocked — keeps QUEUED (still awaiting
  // founder decision) but adds ESCALATED for visibility in Gmail.
  await markMessageTerminal(msg.id, "blocked");
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

  // When the confidence gate green-lights auto_send we ship the reply
  // without a Telegram round-trip. Failure of the send falls back to
  // escalation so the founder still sees the draft and can retry/edit —
  // we never silently drop a reply that the gate chose to send.
  let autoSendSucceeded = false;
  let effectiveDecision: GateDecision = decision;
  if (decision.type === "auto_send" && verified.body.length > 0) {
    try {
      await sendReply({
        threadId: msg.threadId,
        inReplyToMessageId: msg.id,
        to: msg.from.email,
        subject: msg.subject,
        body: verified.body,
      });
      autoSendSucceeded = true;
      console.log(
        `[pipeline] msg=${msg.id} intent=${intent.label} → auto_send OK elapsed_ms=${elapsed}`,
      );
    } catch (err) {
      console.warn(
        `[pipeline] msg=${msg.id} auto_send FAILED — falling back to escalate:`,
        err instanceof Error ? err.message : String(err),
      );
      effectiveDecision = {
        type: "escalate",
        plan: action,
        reason: `auto_send failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  let telegramCardId: string | undefined;
  if (effectiveDecision.type === "escalate" && telegramEnabled()) {
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
  } else if (!autoSendSucceeded && effectiveDecision.type !== "auto_send") {
    // drop / escalate-without-telegram path: log once, no send
    console.log(
      `[pipeline] msg=${msg.id} intent=${intent.label} verified=${verified.verifierPass} ` +
        `decision=${effectiveDecision.type} elapsed_ms=${elapsed}`,
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
    decision: effectiveDecision,
    elapsedMs: elapsed,
    ...(telegramCardId && { telegramCardId }),
  });

  // Close the label loop so INBOX_AGENT_QUEUED never dangles:
  //   drop      → move to PROCESSED
  //   auto_send → sender.ts already flipped -QUEUED +PROCESSED +SENT via
  //               markMessageTerminal("sent"); nothing to do here
  //   escalate  → keep QUEUED, add ESCALATED marker
  if (effectiveDecision.type === "drop") {
    await markMessageTerminal(msg.id, "dropped");
  } else if (effectiveDecision.type === "escalate") {
    await markMessageTerminal(msg.id, "escalated");
  }
  // auto_send success path already labelled by sender.ts; no-op here.
}
