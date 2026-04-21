import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { DEFAULT_IDENTITY, renderIdentityForPrompt } from "../identity/founder.ts";
import type {
  DraftWithEvidence,
  EvidenceClaim,
  IntentResult,
  RelationshipCard,
  ResearchCard,
  UnifiedMessage,
} from "../types.ts";

const MODEL = process.env["ANTHROPIC_MODEL"] ?? "claude-opus-4-7";

const CitationSchema = z.object({
  source: z.enum(["interaction", "inbound_message", "context", "ask", "research"]),
  refId: z.string().min(1),
  excerpt: z.string().min(1).max(400),
});

const ClaimSchema = z.object({
  textMatch: z.string().min(3).max(300),
  cites: z.array(CitationSchema).min(1),
});

const DraftSchema = z.object({
  body: z.string().min(1).max(4000),
  claims: z.array(ClaimSchema),
  confidence: z.number().min(0).max(1),
});

const SYSTEM = `You draft replies for a founder's inbox. Every factual statement
must be grounded in a RelationshipCard entry or the inbound message itself.
You are NOT allowed to invent history, shared context, or personal details.

INPUT you receive:
- INBOUND_MESSAGE: the email we are replying to
- INTENT: classifier output (intent, urgency, risk)
- CARD: relationship memory for this contact, or "NEW_CONTACT" if no memory

OUTPUT: JSON object (no prose outside JSON, no code fences) with:
{
  "body": string,     // the reply body — plain text, sign off with "— Adel"
  "claims": array,    // one entry per factual claim in the body
  "confidence": num   // 0..1, how confident are you this is a good draft
}

Each claim:
{
  "textMatch": string,        // a VERBATIM substring of "body" (3-300 chars) that
                              // represents the factual statement.
  "cites": [                  // MUST have at least one citation
    {
      "source": "interaction" | "inbound_message" | "context" | "ask" | "research",
      "refId":  string,         // card/ask id, OR "inbound", OR research snippet id ("<url>#<idx>")
      "excerpt": string         // the exact memory/email/research line justifying the claim
    }
  ]
}

RULES:
1. Every factual claim must have a non-empty cites array. No claim = no fact.
2. Purely conversational sentences ("Thanks!", "Let's talk soon") don't need claims.
3. If CARD is NEW_CONTACT, allowed sources are "inbound_message" and "research"
   only. You do NOT know anything about this person beyond the inbound email
   plus the RESEARCH snippets attached. Do NOT invent shared history.
   When citing research, use the EXACT snippet id as refId (e.g.
   "https://acme.com#2") and quote a verbatim excerpt from that snippet.
4. For investor / press intent: the body MUST NOT commit to anything concrete.
   Propose 2-3 time slots or acknowledge and ask for availability — do not
   share private metrics, investor lists, customer names, or financials.
5. If you cannot ground a claim, do not make it. A shorter honest draft beats
   a longer hallucinated one. Drop to 2-3 sentences if needed.
6. textMatch MUST be a verbatim substring of the body you wrote. Copy the
   phrase exactly. The Verifier does body.includes(textMatch) and rejects on
   miss. If you rewrite the body, update the textMatch too.
7. confidence: 0.95 when the card is rich and the ask is clear; 0.5-0.7 when
   the card is thin or the intent is ambiguous; below 0.5 when you feel unsure.

The reply will be reviewed by a Verifier agent that checks every claim against
the card/message. Claims with invalid refIds will be rejected and the draft
regenerated with stricter constraints. Keep it tight.`;

export interface DrafterOptions {
  client?: Anthropic;
  model?: string;
}

export async function draft(
  msg: UnifiedMessage,
  card: RelationshipCard | null,
  intent: IntentResult,
  research: ResearchCard | null,
  options: DrafterOptions = {},
): Promise<DraftWithEvidence> {
  const client = options.client ?? new Anthropic();
  const model = options.model ?? MODEL;

  const userBlock = renderContext(msg, card, intent, research);

  const response = await client.messages.create({
    model,
    max_tokens: 1200,
    // Opus 4.7+ deprecated the `temperature` parameter.
    system: SYSTEM,
    messages: [{ role: "user", content: userBlock }],
  });

  const text = extractText(response);
  const parsed = tryParseJson(text);
  if (!parsed) return emptyDraft("no JSON in drafter response");

  const validated = DraftSchema.safeParse(parsed);
  if (!validated.success) {
    return emptyDraft(`drafter schema mismatch: ${validated.error.message}`);
  }

  const claims: EvidenceClaim[] = validated.data.claims.map((c) => ({
    textMatch: c.textMatch,
    cites: c.cites,
  }));

  return {
    body: validated.data.body,
    claims,
    confidence: validated.data.confidence,
    verifierPass: false, // verifier will set this
  };
}

function renderContext(
  msg: UnifiedMessage,
  card: RelationshipCard | null,
  intent: IntentResult,
  research: ResearchCard | null,
): string {
  const cardBlock = card
    ? renderCard(card)
    : "CARD: NEW_CONTACT (no prior memory)";
  const researchBlock = research ? renderResearch(research) : "";
  const identityBlock = renderIdentityForPrompt(DEFAULT_IDENTITY);

  return [
    identityBlock,
    ``,
    `INTENT: ${intent.label} (urgency=${intent.urgency}, risk=${intent.risk}, confidence=${intent.confidence.toFixed(2)})`,
    `CLASSIFIER_REASONING: ${intent.reasoning}`,
    ``,
    `INBOUND_MESSAGE:`,
    `  id: ${msg.id}`,
    `  from: ${msg.from.name} <${msg.from.email}>`,
    `  subject: ${msg.subject}`,
    `  body:`,
    indent(msg.body.slice(0, 3000), 4),
    ``,
    cardBlock,
    researchBlock,
  ]
    .filter((s) => s.length > 0)
    .join("\n");
}

function renderResearch(r: ResearchCard): string {
  if (r.error) {
    return `\nRESEARCH: none available (${r.error}). Cite only inbound_message.`;
  }
  const lines: string[] = [
    ``,
    `RESEARCH (public signals on the sender — snippet ids are "<url>#<idx>"):`,
  ];
  for (const [url, snippets] of Object.entries(r.snippets)) {
    lines.push(`  source: ${url}`);
    snippets.forEach((s, i) => {
      lines.push(`    [${url}#${i}] ${s}`);
    });
  }
  return lines.join("\n");
}

function renderCard(card: RelationshipCard): string {
  const lines: string[] = [];
  lines.push(`CARD: ${card.id} (importance=${card.importance})`);
  if (card.contexts.length > 0) {
    lines.push(`  contexts:`);
    for (const c of card.contexts) {
      const company = c.company ? ` @ ${c.company}` : "";
      lines.push(
        `    - role=${c.role}${company}, established=${c.established}, evidence=[${c.evidenceIds.join(",")}]`,
      );
    }
  }
  if (card.interactions.length > 0) {
    lines.push(`  interactions:`);
    for (const it of card.interactions) {
      lines.push(`    - [${it.id}] ${it.at} ${it.channel}: ${it.summary}`);
    }
  }
  if (card.openAsks.length > 0) {
    lines.push(`  open_asks:`);
    for (const ask of card.openAsks) {
      lines.push(`    - [${ask.id}] (${ask.status}) ${ask.request}`);
    }
  }
  return lines.join("\n");
}

function indent(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => pad + line)
    .join("\n");
}

function extractText(response: Anthropic.Messages.Message): string {
  for (const block of response.content) {
    if (block.type === "text") return block.text;
  }
  return "";
}

function tryParseJson(text: string): unknown {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function emptyDraft(reason: string): DraftWithEvidence {
  return {
    body: "",
    claims: [],
    confidence: 0,
    verifierPass: false,
    verifierNotes: `drafter: ${reason}`,
  };
}
