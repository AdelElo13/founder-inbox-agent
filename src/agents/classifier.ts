import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { IntentResult, UnifiedMessage } from "../types.ts";

const MODEL = process.env["ANTHROPIC_MODEL"] ?? "claude-opus-4-7";

const SYSTEM = `You classify incoming founder-inbox messages into one of six intents.

TAXONOMY (pick exactly one):
- investor:  anyone pitching, tracking, or asking for fundraise details. VCs, angels,
             scouts, family offices, accelerator partners. High stakes — reputation risk.
             MUST be a real human (name+email) showing interest in the founder's company.
- customer:  existing users, pilot customers, trial signups, people asking product
             questions or reporting bugs. Revenue-adjacent. MUST be a human using
             the founder's actual product — not a service the founder is a customer of.
- partner:   collaboration, integration, co-marketing, reseller, or advisor inquiries.
             Two-sided value. Not a pure customer.
- press:     journalists, podcasters, analysts. Anyone who writes for or hosts a
             platform you'd be quoted on. High reputation risk — never auto-reply.
- noise:     newsletters, cold sales spam, automated notifications, transactional
             receipts, unsubscribable digests, cookie banners. Also: ANY message from
             a no-reply / noreply / donotreply / notifications@ / platform@ /
             system@ / invoice@ / mailer-daemon style address is AUTOMATICALLY noise,
             regardless of body content — you cannot meaningfully reply to these
             and the founder does not owe them action.
             Project-status emails from cloud vendors (Google, AWS, Stripe,
             Vercel, etc), GitHub digest emails, LinkedIn job alerts, receipts,
             calendar confirmations, MFA codes, password-reset emails, and usage
             reports are ALL noise.
- unknown:   cannot confidently classify. Prefer this over guessing when ambiguous.

HEURISTIC ORDER (apply top to bottom — first match wins):
  0. CHANNEL OVERRIDE: if the input shows "CHANNEL: LinkedIn notification" or
     "CHANNEL: X / Twitter notification", SKIP rules 1-3 — these envelopes wrap
     real user messages. Classify by the forwarded body content (the sender
     address is technically no-reply but the payload is human-authored).
  1. Sender email matches /^(no-?reply|noreply|donotreply|notifications|platform|system|invoice|mailer|daemon|alerts?|digest|postmaster|bounce)/i → ALWAYS noise.
  2. Sender domain is a well-known transactional sender (mailchimp, sendgrid, amazonses, mailgun, postmark, klaviyo, hubspot automated tracks) AND body contains "unsubscribe" → noise.
  3. Subject matches /(invoice|receipt|your order|password reset|security code|verification|digest|weekly summary|daily briefing|has been shut down|is about to expire|scheduled maintenance)/i AND sender is automated → noise.
  4. Only after 0-3 miss: apply intent judgement on body content.

NOTE: "LinkedIn digest" containing investor messages → intent=investor, risk=high.
The classifier's job is to READ THE PAYLOAD when the wrapper is a social platform
notification. The downstream Drafter then uses mac-control-mcp to drive the
LinkedIn web UI for the actual reply (drafter knows this — don't worry about it).

URGENCY (pick exactly one):
- now:        message explicitly time-critical (incident, "before 3pm today", live event)
- today:      same-day reply warranted (active deal, warm thread)
- this_week:  can wait a day or two (intros, exploratory, partnership scoping)
- defer:      no time pressure; newsletter, noise, or background FYI

RISK TIER (pick exactly one):
- low:       reply can auto-send with whitelist template (FAQ-style customer)
- medium:    needs drafter-generated reply and light approval
- high:      MANDATORY human approval. Investors, press, new partnerships,
             anything touching money, legal, or brand.

CONFIDENCE: number in [0, 1]. Below 0.75 the caller will default to "needs approval"
regardless of intent, so do not inflate. A cleanly investor-flagged email with
explicit ask should be >0.9; an ambiguous cold email should be ~0.5-0.7.

REASONING: one sentence, <= 25 words, grounded in the message text itself.
No speculation about prior history unless cited from the message.

OUTPUT: return ONLY a JSON object matching this schema. No prose, no code fences.
{
  "intent":     "investor" | "customer" | "partner" | "press" | "noise" | "unknown",
  "urgency":    "now" | "today" | "this_week" | "defer",
  "risk":       "low" | "medium" | "high",
  "confidence": number,
  "reasoning":  string
}`;

const IntentSchema = z.object({
  intent: z.enum(["investor", "customer", "partner", "press", "noise", "unknown"]),
  urgency: z.enum(["now", "today", "this_week", "defer"]),
  risk: z.enum(["low", "medium", "high"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1).max(500),
});

export interface ClassifierOptions {
  /** Injected client for tests. Defaults to a real Anthropic client. */
  client?: Anthropic;
  /** Override model — defaults to env ANTHROPIC_MODEL or claude-opus-4-5. */
  model?: string;
}

export async function classify(
  msg: UnifiedMessage,
  options: ClassifierOptions = {},
): Promise<IntentResult> {
  const client = options.client ?? new Anthropic();
  const model = options.model ?? MODEL;

  const userBlock = renderMessageForClassification(msg);

  const response = await client.messages.create({
    model,
    max_tokens: 300,
    // Opus 4.7+ deprecated the `temperature` parameter — its internal
    // reasoning loop picks appropriate sampling itself. Omitting leaves
    // older models at their default (1.0), which is fine given our
    // strict JSON schema clamps the surface.
    system: SYSTEM,
    messages: [{ role: "user", content: userBlock }],
  });

  const text = extractText(response);
  const parsed = tryParseJson(text);
  if (!parsed) return fallback(msg, "no JSON in response");

  const validated = IntentSchema.safeParse(parsed);
  if (!validated.success) {
    return fallback(msg, `schema mismatch: ${validated.error.message}`);
  }

  // Zod output field is `intent` (matches LLM JSON); interface uses `label`.
  return {
    label: validated.data.intent,
    urgency: validated.data.urgency,
    risk: validated.data.risk,
    confidence: validated.data.confidence,
    reasoning: validated.data.reasoning,
  };
}

function renderMessageForClassification(msg: UnifiedMessage): string {
  const channel = msg.isLinkedInNotification
    ? "LinkedIn notification (forwarded via Gmail)"
    : msg.isXNotification
      ? "X / Twitter notification (forwarded via Gmail)"
      : "Gmail (direct)";
  return [
    `CHANNEL: ${channel}`,
    `FROM: ${msg.from.name} <${msg.from.email}>`,
    `SUBJECT: ${msg.subject}`,
    `RECEIVED: ${msg.receivedAt}`,
    `---`,
    msg.body.slice(0, 4000),
  ].join("\n");
}

function extractText(response: Anthropic.Messages.Message): string {
  for (const block of response.content) {
    if (block.type === "text") return block.text;
  }
  return "";
}

function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  // Tolerate ``` fences even though the prompt forbids them.
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    // Fall back: grab the first {...} block.
    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function fallback(msg: UnifiedMessage, reason: string): IntentResult {
  return {
    label: "unknown",
    urgency: "this_week",
    risk: "high",
    confidence: 0,
    reasoning: `fallback: ${reason} (msg ${msg.id})`,
  };
}
