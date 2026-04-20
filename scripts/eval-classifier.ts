import { config as loadEnv } from "dotenv";
loadEnv({ override: true });
import { classify } from "../src/agents/classifier.ts";
import { GOLD } from "../src/fixtures/messages.ts";
import type { Intent, IntentResult } from "../src/types.ts";

interface Row {
  id: string;
  expected: Intent;
  predicted: Intent;
  urgency_match: boolean;
  risk_match: boolean;
  confidence: number;
  latency_ms: number;
  notes: string;
  ok: boolean;
}

async function main(): Promise<void> {
  const started = Date.now();
  const rows: Row[] = [];

  console.log(`[eval] running classifier on ${GOLD.length} labeled messages`);
  console.log(`[eval] model: ${process.env["ANTHROPIC_MODEL"] ?? "claude-opus-4-7 (default)"}`);
  console.log("");

  for (const { msg, expected } of GOLD) {
    const t0 = Date.now();
    let got: IntentResult;
    try {
      got = await classify(msg);
    } catch (err) {
      console.error(`[eval] ${msg.id} FAILED:`, err);
      got = {
        label: "unknown",
        urgency: "defer",
        risk: "high",
        confidence: 0,
        reasoning: `error: ${String(err)}`,
      };
    }
    const latency = Date.now() - t0;

    const row: Row = {
      id: msg.id,
      expected: expected.intent,
      predicted: got.label,
      urgency_match: got.urgency === expected.urgency,
      risk_match: got.risk === expected.risk,
      confidence: got.confidence,
      latency_ms: latency,
      notes: expected.notes,
      ok: got.label === expected.intent,
    };
    rows.push(row);

    const flag = row.ok ? "✅" : "❌";
    console.log(
      `${flag} ${row.id} exp=${row.expected.padEnd(8)} got=${row.predicted.padEnd(8)} ` +
        `u=${got.urgency.padEnd(10)} r=${got.risk.padEnd(6)} ` +
        `c=${got.confidence.toFixed(2)} t=${latency}ms`,
    );
    if (!row.ok) console.log(`     reason: ${got.reasoning}`);
  }

  const total = rows.length;
  const correct = rows.filter((r) => r.ok).length;
  const urgencyCorrect = rows.filter((r) => r.urgency_match).length;
  const riskCorrect = rows.filter((r) => r.risk_match).length;
  const avgLatency = rows.reduce((a, r) => a + r.latency_ms, 0) / total;
  const p95Latency = percentile(
    rows.map((r) => r.latency_ms).sort((a, b) => a - b),
    0.95,
  );
  const avgConfidence =
    rows.reduce((a, r) => a + r.confidence, 0) / total;

  console.log("");
  console.log("─".repeat(60));
  console.log(`[eval] total: ${total}`);
  console.log(
    `[eval] intent accuracy:   ${correct}/${total} = ${((correct / total) * 100).toFixed(1)}%`,
  );
  console.log(
    `[eval] urgency accuracy:  ${urgencyCorrect}/${total} = ${((urgencyCorrect / total) * 100).toFixed(1)}%`,
  );
  console.log(
    `[eval] risk tier accuracy: ${riskCorrect}/${total} = ${((riskCorrect / total) * 100).toFixed(1)}%`,
  );
  console.log(`[eval] avg confidence:    ${avgConfidence.toFixed(2)}`);
  console.log(`[eval] avg latency:       ${avgLatency.toFixed(0)}ms`);
  console.log(`[eval] p95 latency:       ${p95Latency.toFixed(0)}ms`);
  console.log(`[eval] wall clock:        ${((Date.now() - started) / 1000).toFixed(1)}s`);

  // Confusion matrix
  const intents: Intent[] = [
    "investor",
    "customer",
    "partner",
    "press",
    "noise",
    "unknown",
  ];
  console.log("");
  console.log("[eval] confusion matrix (rows=expected, cols=predicted):");
  console.log(
    "        " + intents.map((i) => i.slice(0, 4).padStart(5)).join(""),
  );
  for (const exp of intents) {
    const line = intents
      .map((pred) => {
        const count = rows.filter(
          (r) => r.expected === exp && r.predicted === pred,
        ).length;
        return count.toString().padStart(5);
      })
      .join("");
    console.log(`${exp.padEnd(8)}${line}`);
  }

  const accuracy = correct / total;
  if (accuracy < 0.75) {
    console.log("");
    console.log(
      `[eval] ⚠️  accuracy ${(accuracy * 100).toFixed(0)}% below Day 1 kill-switch (75%)`,
    );
    process.exitCode = 1;
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx] ?? 0;
}

main().catch((err: unknown) => {
  console.error("[eval] fatal:", err);
  process.exit(1);
});
