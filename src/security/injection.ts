import type { UnifiedMessage } from "../types.ts";

/**
 * Prompt-injection detector. Applied BEFORE the message is classified so a
 * flagged message gets forced to intent=unknown with mandatory approval —
 * the founder sees the raw email and the reason flagged it, and nothing is
 * auto-sent.
 *
 * Design goal: high precision over recall. False positives = annoying but
 * safe. False negatives = disastrous (agent executes malicious instruction).
 */

const PATTERNS: Array<{ name: string; re: RegExp }> = [
  {
    name: "ignore-previous-instructions",
    re: /ignore (all |any |the )?(previous|prior|above|earlier) (instructions|rules|prompts)/i,
  },
  {
    name: "system-prompt-exfiltration",
    re: /(reveal|print|output|repeat|show me) (your |the )?system (prompt|instructions|rules)/i,
  },
  {
    name: "role-override",
    re: /you are (now |henceforth )?(?:an? )?(admin|root|developer|jailbreak|dan|unfiltered)/i,
  },
  {
    name: "action-override",
    re: /(auto[- ]?send|force[- ]?approve|bypass (approval|review|verifier|confirmation))/i,
  },
  {
    name: "tool-invocation-injection",
    re: /<(tool_use|function_call|tool_call|invoke)[^>]*>/i,
  },
  {
    name: "fake-citation-claim",
    re: /(cite|citation|refId|evidence):\s*["']?(trust[ -]me|internal[ -]note|override)/i,
  },
  {
    name: "imperative-to-agent",
    re: /\b(classify|mark|label|tag)\s+(this|me|sender)\s+as\s+(investor|customer|partner|press|urgent|high[ -]priority)/i,
  },
  {
    name: "prompt-boundary-fake",
    re: /\[\[(SYSTEM|ADMIN|OVERRIDE|ROOT)\]\]|^```(system|admin|override)/im,
  },
];

export interface InjectionScan {
  flagged: boolean;
  hits: string[];
  /** Short human-readable reason for the first hit, for UI display. */
  reason?: string;
}

export function scanForInjection(msg: UnifiedMessage): InjectionScan {
  const text = `${msg.subject}\n${msg.body}`;
  const hits: string[] = [];
  let firstHit: { name: string; match: string } | null = null;

  for (const { name, re } of PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    hits.push(name);
    if (!firstHit) {
      firstHit = { name, match: m[0].slice(0, 80) };
    }
  }

  if (hits.length === 0) return { flagged: false, hits: [] };
  return {
    flagged: true,
    hits,
    reason: firstHit
      ? `Prompt injection pattern "${firstHit.name}" detected: "${firstHit.match}"`
      : "Prompt injection detected",
  };
}
