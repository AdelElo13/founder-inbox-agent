import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type {
  ActionPlan,
  DraftWithEvidence,
  GateDecision,
  IntentResult,
  UnifiedMessage,
} from "../types.ts";

/**
 * Pipeline event log in JSONL. One line per processed message. The dashboard
 * at public/dashboard.html reads this file directly (no server, no DB).
 *
 * The schema has two tiers:
 *
 *   - Flat scalars (top of the interface) — keep these short and typed so
 *     `jq 'select(.decision=="escalate") | .from'` still works in a demo.
 *   - Drill-down blob (bottom of the interface) — the draft body, inbound
 *     preview, and full claim list. The dashboard's modal renders these,
 *     so a judge clicking a row sees the evidence-grounded story, not
 *     just an opaque "claims=3 verified=✓" count.
 *
 * Excerpts are capped at DRILL_EXCERPT_MAX chars to keep each JSONL line
 * under ~4KB. That's the upper bound we want: anything larger slows the
 * 5s poll + parse in the browser on a laptop.
 */

const DRILL_BODY_MAX = 1600;
const DRILL_PREVIEW_MAX = 400;
const DRILL_EXCERPT_MAX = 180;
const DRILL_TEXTMATCH_MAX = 200;
const DRILL_REASONING_MAX = 400;

export interface EventClaim {
  textMatch: string;
  cites: Array<{
    source: string;
    refId: string;
    excerpt: string;
  }>;
}

export interface PipelineEvent {
  // --- flat scalars (for jq / quick scanning) ---
  ts: string;                         // ISO timestamp when pipeline finished this message
  msgId: string;
  threadId: string;
  from: string;                       // "Name <email>"
  subject: string;
  intent: IntentResult["label"];
  urgency: IntentResult["urgency"];
  risk: IntentResult["risk"];
  classifierConfidence: number;
  cardMatched: boolean;               // true if memory had a card for this sender
  researchAttempted: boolean;         // true if researchSender ran
  researchUrls: number;               // URLs that returned useful content
  draftConfidence: number;
  draftClaims: number;
  verifierPass: boolean;
  verifierNotes?: string;
  decision: GateDecision["type"];
  decisionReason?: string;
  elapsedMs: number;
  telegramCardId?: string;
  injectionFlagged: boolean;          // true when prompt-injection guard tripped

  // --- drill-down (for dashboard modal) ---
  inboundPreview: string;
  draftBody: string;
  classifierReasoning: string;
  approvalReason?: string;
  claims: EventClaim[];
}

function eventsPath(): string {
  const dir = process.env["METRICS_DIR"] ?? "./metrics";
  return join(resolve(dir), "events.jsonl");
}

function ensureFile(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path)) writeFileSync(path, "", "utf8");
}

export function recordEvent(event: PipelineEvent): void {
  const path = eventsPath();
  ensureFile(path);
  appendFileSync(path, `${JSON.stringify(event)}\n`, "utf8");
}

interface RecordInput {
  msg: UnifiedMessage;
  intent: IntentResult;
  cardMatched: boolean;
  researchAttempted: boolean;
  researchUrls: number;
  draft: DraftWithEvidence;
  plan: ActionPlan;
  decision: GateDecision;
  elapsedMs: number;
  telegramCardId?: string;
  injectionFlagged?: boolean;
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function summarizeClaims(draft: DraftWithEvidence): EventClaim[] {
  return draft.claims.map((c) => ({
    textMatch: truncate(c.textMatch, DRILL_TEXTMATCH_MAX),
    cites: c.cites.map((ct) => ({
      source: ct.source,
      refId: ct.refId,
      excerpt: truncate(ct.excerpt, DRILL_EXCERPT_MAX),
    })),
  }));
}

export function recordPipelineOutcome(input: RecordInput): void {
  const injectionFlagged = input.injectionFlagged ?? false;
  const event: PipelineEvent = {
    ts: new Date().toISOString(),
    msgId: input.msg.id,
    threadId: input.msg.threadId,
    from: `${input.msg.from.name} <${input.msg.from.email}>`,
    subject: input.msg.subject.slice(0, 120),
    intent: input.intent.label,
    urgency: input.intent.urgency,
    risk: input.intent.risk,
    classifierConfidence: input.intent.confidence,
    cardMatched: input.cardMatched,
    researchAttempted: input.researchAttempted,
    researchUrls: input.researchUrls,
    draftConfidence: input.draft.confidence,
    draftClaims: input.draft.claims.length,
    verifierPass: input.draft.verifierPass,
    ...(input.draft.verifierNotes && { verifierNotes: input.draft.verifierNotes }),
    decision: input.decision.type,
    ...(input.decision.type !== "auto_send" &&
      input.decision.type !== "drop" && { decisionReason: input.decision.reason }),
    elapsedMs: input.elapsedMs,
    ...(input.telegramCardId && { telegramCardId: input.telegramCardId }),
    injectionFlagged,

    inboundPreview: truncate(input.msg.body, DRILL_PREVIEW_MAX),
    draftBody: truncate(input.draft.body, DRILL_BODY_MAX),
    classifierReasoning: truncate(input.intent.reasoning, DRILL_REASONING_MAX),
    ...(input.plan.approvalReason && { approvalReason: input.plan.approvalReason }),
    claims: summarizeClaims(input.draft),
  };
  recordEvent(event);
}
