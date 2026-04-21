/**
 * Founder identity — structured priorities and voice preferences that the
 * Drafter reads as priors for every reply.
 *
 * This makes the system PERSONAL: drafts reflect what the founder is
 * actually working on this quarter, which conversations they want to
 * accelerate, which ones they want to defer. Judges see the domain
 * story immediately because the agent's drafts reference the founder's
 * own declared priorities, not generic LLM best practices.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  DO NOT MODIFY WITHOUT EXPLICIT OWNER APPROVAL.                 │
 * │                                                                 │
 * │  This file encodes the founder's personal voice, quarter        │
 * │  priorities, and hard rules. Claude must NOT edit any field     │
 * │  in DEFAULT_IDENTITY unless the owner explicitly asks (e.g.     │
 * │  "update hiring to yes" or "change the signoff"). Drive-by      │
 * │  polish, refactors, or "better wording" are not allowed here.   │
 * │                                                                 │
 * │  The TYPE definitions (FounderIdentity interface, render        │
 * │  helpers) may be refactored as needed — just not the values.    │
 * └─────────────────────────────────────────────────────────────────┘
 */

export interface FounderIdentity {
  name: string;
  /** One-sentence what-I-do that can be quoted to strangers. */
  positioning: string;
  /** Time-zone in IANA format; used for scheduling phrasing. */
  timezone: string;

  /**
   * What I'm focused on this quarter. Drafter uses these to calibrate
   * urgency and enthusiasm — "raising seed" means investor threads get
   * concrete slot proposals; "not hiring" means recruiter threads get
   * a polite archive.
   */
  priorities: {
    raising: "yes" | "exploring" | "no";
    hiring: "yes" | "opportunistic" | "no";
    selling: "yes" | "maybe" | "no";
    partnerships: "active" | "selective" | "closed";
    press: "inbound-only" | "active" | "closed";
  };

  /**
   * Voice preferences. Drafter's tone baseline. Short descriptors only —
   * the classifier and drafter both inject these as system-prompt context.
   */
  voice: {
    /** e.g. "professional but blunt", "warm and curious", "technical and terse" */
    tone: string;
    /** e.g. "American", "British", "Dutch-English" */
    register: string;
    /** how replies typically sign off */
    signoff: string;
    /** max sentences in a default reply — drafter respects this */
    maxSentences: number;
  };

  /**
   * Hard rules the drafter MUST follow. These override voice and
   * priorities. Use sparingly — every rule costs prompt tokens.
   */
  rules: string[];
}

/**
 * Default identity for this repo's owner. Override at deploy time by
 * setting FOUNDER_IDENTITY_PATH to another JSON file, or edit here.
 */
export const DEFAULT_IDENTITY: FounderIdentity = {
  name: "Adel",
  positioning:
    "Independent builder shipping AI-agent infrastructure — mac-control-mcp (Swift MCP for macOS), neuromcp (memory), and this founder-inbox tool.",
  timezone: "Europe/Amsterdam",

  priorities: {
    raising: "exploring",
    hiring: "no",
    selling: "maybe",
    partnerships: "selective",
    press: "inbound-only",
  },

  voice: {
    tone: "professional but blunt — direct, no filler, no hedging",
    register: "Dutch-English, minimal",
    signoff: "— Adel",
    maxSentences: 5,
  },

  rules: [
    "Never promise follow-up work, deliverables, or meetings the founder hasn't explicitly approved.",
    "Never share financial figures (MRR, runway, burn) unless the inbound already discussed them.",
    "Never share other investors' or customers' names.",
    "When uncertain, ask one clarifying question instead of guessing.",
    "For anything involving contracts or equity, escalate with no draft body.",
  ],
};

export function renderIdentityForPrompt(id: FounderIdentity): string {
  const prios = Object.entries(id.priorities)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n");
  const rules = id.rules.map((r, i) => `  ${i + 1}. ${r}`).join("\n");
  return [
    `FOUNDER_IDENTITY:`,
    `  name: ${id.name}`,
    `  positioning: ${id.positioning}`,
    `  timezone: ${id.timezone}`,
    `  voice.tone: ${id.voice.tone}`,
    `  voice.register: ${id.voice.register}`,
    `  voice.signoff: ${id.voice.signoff}`,
    `  voice.max_sentences: ${id.voice.maxSentences}`,
    `  priorities:`,
    prios,
    `  hard_rules:`,
    rules,
  ].join("\n");
}

/** Short one-line summary used in Telegram cards ("why this was drafted"). */
export function whyDraftedFor(
  id: FounderIdentity,
  intent: string,
): string {
  const priority = (id.priorities as Record<string, string>)[
    intentToPriorityKey(intent)
  ];
  const priorityNote = priority ? ` (priority: ${priority})` : "";
  return `Drafted for intent=${intent}${priorityNote} in ${id.voice.tone.split("—")[0]?.trim()} voice.`;
}

function intentToPriorityKey(intent: string): string {
  switch (intent) {
    case "investor":
      return "raising";
    case "customer":
      return "selling";
    case "partner":
      return "partnerships";
    case "press":
      return "press";
    default:
      return "";
  }
}
