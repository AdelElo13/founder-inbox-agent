import { pollGmail } from "./gmail/poller.ts";
import { classify } from "./agents/classifier.ts";
import { recall } from "./agents/memory.ts";
import { draft } from "./agents/drafter.ts";
import { verify } from "./agents/verifier.ts";
import { plan } from "./agents/planner.ts";
import { gate } from "./confidence/gate.ts";
import type { UnifiedMessage } from "./types.ts";

export async function runOnce(): Promise<void> {
  const messages = await pollGmail();
  if (messages.length === 0) {
    console.log("[pipeline] no new messages");
    return;
  }

  for (const msg of messages) {
    await processMessage(msg);
  }
}

async function processMessage(msg: UnifiedMessage): Promise<void> {
  const started = Date.now();

  const intent = await classify(msg);
  const card = await recall(msg, intent);
  const drafted = await draft(msg, card, intent);
  const verified = await verify(drafted, card, msg);
  const action = await plan(verified, intent, card);
  const decision = gate(action);

  const elapsed = Date.now() - started;
  console.log(
    `[pipeline] msg=${msg.id} intent=${intent.label} ` +
      `verified=${verified.verifierPass} decision=${decision.type} ` +
      `elapsed_ms=${elapsed}`,
  );
}
