import type {
  Citation,
  DraftWithEvidence,
  EvidenceClaim,
  RelationshipCard,
  ResearchCard,
  UnifiedMessage,
} from "../types.ts";

/**
 * The Verifier has veto. It checks every factual claim in a draft and
 * ensures the citations refer to real entries in the card / inbound message.
 *
 * Rules (strict):
 *  1. Empty draft body → reject (drafter bailed out).
 *  2. Any claim with empty cites[] → reject.
 *  3. Any claim whose cites all fail resolution → reject.
 *  4. textMatch must appear as a case-insensitive substring of the body —
 *     protects against LLM quoting phrases it claims are in the body but
 *     actually aren't (means the claim drifted during generation).
 *  5. Citation excerpt must plausibly appear (case-insensitive substring) in
 *     the cited source — protects against fabricated excerpts where the refId
 *     is real but the excerpt is invented.
 *
 * On pass: verifierPass=true, verifierNotes omitted.
 * On fail: verifierPass=false, verifierNotes lists the specific rule that
 * broke and which claim caused it — the caller can use this to decide
 * whether to regenerate with stricter prompt or escalate as-is.
 */
export async function verify(
  draft: DraftWithEvidence,
  card: RelationshipCard | null,
  msg: UnifiedMessage,
  research?: ResearchCard | null,
): Promise<DraftWithEvidence> {
  if (draft.body.trim().length === 0) {
    return { ...draft, verifierPass: false, verifierNotes: "empty body" };
  }

  const bodyLower = draft.body.toLowerCase();

  for (let i = 0; i < draft.claims.length; i += 1) {
    const claim = draft.claims[i];
    if (!claim) continue;

    const textMatch = claim.textMatch.trim().toLowerCase();
    if (textMatch.length < 3) {
      return {
        ...draft,
        verifierPass: false,
        verifierNotes: `claim #${i}: textMatch too short ("${claim.textMatch}")`,
      };
    }

    if (!bodyLower.includes(textMatch)) {
      return {
        ...draft,
        verifierPass: false,
        verifierNotes: `claim #${i}: textMatch not found in body ("${claim.textMatch.slice(0, 60)}")`,
      };
    }

    if (claim.cites.length === 0) {
      return {
        ...draft,
        verifierPass: false,
        verifierNotes: `claim #${i} has empty cites[]`,
      };
    }

    const resolved = claim.cites.some((c) => resolveCitation(c, card, msg, research ?? null));
    if (!resolved) {
      return {
        ...draft,
        verifierPass: false,
        verifierNotes: `claim #${i}: none of ${claim.cites.length} citations resolved to card/msg/research`,
      };
    }
  }

  return { ...draft, verifierPass: true };
}

function resolveCitation(
  cite: Citation,
  card: RelationshipCard | null,
  msg: UnifiedMessage,
  research: ResearchCard | null,
): boolean {
  const excerpt = cite.excerpt.trim().toLowerCase();
  if (!excerpt) return false;

  if (cite.source === "inbound_message") {
    const haystack = `${msg.subject} ${msg.body}`.toLowerCase();
    return haystack.includes(excerpt.slice(0, 120));
  }

  if (cite.source === "research") {
    if (!research || !research.snippetIds.includes(cite.refId)) return false;
    // refId format: "<url>#<idx>" — look up that specific snippet and match.
    const hash = cite.refId.lastIndexOf("#");
    if (hash < 0) return false;
    const url = cite.refId.slice(0, hash);
    const idx = Number(cite.refId.slice(hash + 1));
    const snippet = research.snippets[url]?.[idx];
    if (!snippet) return false;
    return snippet.toLowerCase().includes(excerpt.slice(0, 120));
  }

  if (!card) return false;

  if (cite.source === "interaction") {
    const it = card.interactions.find((i) => i.id === cite.refId);
    if (!it) return false;
    return it.summary.toLowerCase().includes(excerpt.slice(0, 120));
  }

  if (cite.source === "ask") {
    const ask = card.openAsks.find((a) => a.id === cite.refId);
    if (!ask) return false;
    return ask.request.toLowerCase().includes(excerpt.slice(0, 120));
  }

  if (cite.source === "context") {
    return card.contexts.some((ctx) => {
      if (ctx.evidenceIds.includes(cite.refId)) return true;
      const blob = [ctx.role, ctx.company ?? ""].join(" ").toLowerCase();
      return blob.includes(excerpt.slice(0, 80));
    });
  }

  return false;
}

/** Exposed for tests — same predicate the verify() loop uses. */
export function claimResolvable(
  claim: EvidenceClaim,
  card: RelationshipCard | null,
  msg: UnifiedMessage,
  research: ResearchCard | null = null,
): boolean {
  return claim.cites.some((c) => resolveCitation(c, card, msg, research));
}
