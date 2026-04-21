import { DEFAULT_IDENTITY, whyDraftedFor } from "../identity/founder.ts";
import type { ApprovalItem } from "./types.ts";

/**
 * Render an approval card as Telegram Markdown (legacy format — not MarkdownV2,
 * which has much stricter escape rules). Kept intentionally terse: ≤ 4000 chars
 * fits a single Telegram message.
 */
export function renderApprovalCard(item: ApprovalItem): string {
  const { draft, plan } = item;
  const intentBadge = badgeForIntent(plan.intent);
  const riskBadge = badgeForRisk(plan.riskTier);

  const lines: string[] = [];
  lines.push(`${intentBadge} *${plan.intent.toUpperCase()}*  ${riskBadge}`);
  lines.push(`*From:* ${escape(item.from.name)} <${escape(item.from.email)}>`);
  lines.push(`*Subject:* ${escape(item.subject)}`);
  lines.push("");
  lines.push(`_Inbound:_ ${escape(item.inboundPreview.slice(0, 240))}...`);
  lines.push("");
  lines.push("*Draft reply:*");
  lines.push("```");
  lines.push(draft.body.slice(0, 1500));
  lines.push("```");

  if (draft.claims.length > 0) {
    lines.push(`*Evidence* (${draft.claims.length} claim${draft.claims.length === 1 ? "" : "s"}):`);
    draft.claims.slice(0, 5).forEach((c, i) => {
      const excerpt = c.cites[0]?.excerpt ?? "";
      const source = c.cites[0]?.source ?? "?";
      lines.push(
        `  ${i + 1}. "${escape(c.textMatch.slice(0, 80))}" ← [${source}] ${escape(excerpt.slice(0, 80))}`,
      );
    });
  } else {
    lines.push("_No claims — pure conversational draft._");
  }

  lines.push("");
  lines.push(`_Why drafted:_ ${escape(whyDraftedFor(DEFAULT_IDENTITY, plan.intent))}`);
  lines.push(
    `_Confidence:_ ${draft.confidence.toFixed(2)}  _Verifier:_ ${draft.verifierPass ? "✓" : "✗"}`,
  );
  if (plan.approvalReason) {
    lines.push(`_Reason for escalation:_ ${escape(plan.approvalReason)}`);
  }

  return lines.join("\n");
}

function badgeForIntent(intent: string): string {
  switch (intent) {
    case "investor":
      return "💰";
    case "customer":
      return "🛒";
    case "partner":
      return "🤝";
    case "press":
      return "📰";
    case "noise":
      return "🗑️";
    default:
      return "❓";
  }
}

function badgeForRisk(risk: string): string {
  switch (risk) {
    case "high":
      return "🔴 HIGH RISK";
    case "medium":
      return "🟡 medium";
    case "low":
      return "🟢 low";
    default:
      return "";
  }
}

function escape(text: string): string {
  // Telegram legacy Markdown has 4 escapable metas: _, *, `, [
  return text.replace(/[_*`[\]]/g, (ch) => `\\${ch}`);
}
