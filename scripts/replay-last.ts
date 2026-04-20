import { config as loadEnv } from "dotenv";
loadEnv({ override: true });

import { getGmailClient } from "../src/gmail/auth.ts";
import { ensureLabels, LABELS } from "../src/gmail/labels.ts";

/**
 * Strips INBOX_AGENT_* labels from the most recent escalation-looking message
 * so the next `pnpm start` run will re-process it. Useful for demoing the
 * Telegram approval flow against real Gmail without waiting for fresh mail.
 */
async function main(): Promise<void> {
  const gmail = getGmailClient();
  const labelMap = await ensureLabels(gmail);

  const queuedId = labelMap[LABELS.QUEUED];
  const processedId = labelMap[LABELS.PROCESSED];
  if (!queuedId || !processedId) throw new Error("missing labels");

  // Find the N most recent previously-processed messages, not just one —
  // the first one might be noise (archived without a draft), which means no
  // Telegram escalation on replay. Surface the last 5, unlabel them all;
  // the pipeline will re-process each and anything customer/investor/etc.
  // will trigger a Telegram approval card.
  const take = Number(process.argv[2] ?? 5);
  const list = await gmail.users.messages.list({
    userId: "me",
    q: `label:${LABELS.QUEUED}`,
    maxResults: take,
  });

  const ids = (list.data.messages ?? [])
    .map((m) => m.id)
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) {
    console.log("[replay] no previously-processed messages found");
    return;
  }

  const toRemove = [queuedId, processedId].filter((id): id is string =>
    Boolean(id),
  );
  await gmail.users.messages.batchModify({
    userId: "me",
    requestBody: { ids, removeLabelIds: toRemove },
  });

  console.log(
    `[replay] unprocessed ${ids.length} message${ids.length === 1 ? "" : "s"} — ids: ${ids.join(", ")}`,
  );
  console.log(`[replay] now run: pnpm start`);
}

main().catch((err: unknown) => {
  console.error("[replay] fatal:", err);
  process.exit(1);
});
