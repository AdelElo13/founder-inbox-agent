import { config as loadEnv } from "dotenv";
loadEnv({ override: true });

import { classify } from "../src/agents/classifier.ts";
import { recall } from "../src/agents/memory.ts";
import { draft } from "../src/agents/drafter.ts";
import { verify } from "../src/agents/verifier.ts";
import { plan } from "../src/agents/planner.ts";
import { gate } from "../src/confidence/gate.ts";
import { researchSender } from "../src/research/sender.ts";
import { recordPipelineOutcome } from "../src/metrics/events.ts";
import { GOLD } from "../src/fixtures/messages.ts";

async function main(): Promise<void> {
  const started = Date.now();
  let verifierRejections = 0;
  let autoSends = 0;
  let escalations = 0;
  let drops = 0;

  console.log(`[pipeline] running on ${GOLD.length} fixture messages`);
  console.log(
    `[pipeline] model: ${process.env["ANTHROPIC_MODEL"] ?? "claude-opus-4-7"}`,
  );
  console.log("");

  for (const { msg } of GOLD) {
    const t0 = Date.now();
    const intent = await classify(msg);
    const card = await recall(msg, intent);

    let research: Awaited<ReturnType<typeof researchSender>> | null = null;
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
      drafted = await draft(msg, card, intent, research);
    }

    const verified = await verify(drafted, card, msg, research);
    if (!verified.verifierPass && verified.body.length > 0) {
      verifierRejections += 1;
    }

    const action = await plan(verified, intent, card);
    const decision = gate(action);

    const elapsed = Date.now() - t0;
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
    });

    switch (decision.type) {
      case "auto_send":
        autoSends += 1;
        break;
      case "escalate":
        escalations += 1;
        break;
      case "drop":
        drops += 1;
        break;
    }

    const cardFlag = card ? "🗂️ " : "🆕";
    const verifFlag = verified.verifierPass
      ? "✓"
      : verified.body
        ? "✗"
        : "–";
    const decisionFlag =
      decision.type === "auto_send"
        ? "📤 auto"
        : decision.type === "escalate"
          ? "⚠️  escalate"
          : "🗑️  drop";

    console.log(
      `${msg.id} ${cardFlag} intent=${intent.label.padEnd(8)} ` +
        `draft_c=${drafted.confidence.toFixed(2)} verif=${verifFlag} → ${decisionFlag}  ` +
        `(${elapsed}ms)`,
    );
    if (verified.body && !verified.verifierPass) {
      console.log(`  verifier: ${verified.verifierNotes}`);
    }
    if (decision.type === "escalate") {
      console.log(`  reason: ${decision.reason}`);
    }
    if (verified.body) {
      const first = verified.body.split("\n")[0] ?? "";
      console.log(`  draft: "${first.slice(0, 90)}"`);
    }
    console.log("");
  }

  const total = GOLD.length;
  console.log("─".repeat(60));
  console.log(`[pipeline] total:              ${total}`);
  console.log(`[pipeline] auto-sends:         ${autoSends}`);
  console.log(`[pipeline] escalations:        ${escalations}`);
  console.log(`[pipeline] drops (archive):    ${drops}`);
  console.log(`[pipeline] verifier rejections: ${verifierRejections}`);
  console.log(
    `[pipeline] wall clock:         ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
}

main().catch((err: unknown) => {
  console.error("[pipeline] fatal:", err);
  process.exit(1);
});
