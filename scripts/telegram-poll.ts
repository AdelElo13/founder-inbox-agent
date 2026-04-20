import { config as loadEnv } from "dotenv";
loadEnv({ override: true });

import { getBot } from "../src/telegram/bot.ts";

/**
 * Runs the Telegram bot in long-polling mode. This receives button taps and
 * edit replies. Keep it running in a separate terminal from `pnpm start` so
 * it can handle approvals while the pipeline processes new mail.
 *
 * For a production setup this would be a webhook or a single process that
 * multiplexes polling + pipeline — the split is for clarity during the
 * hackathon build.
 */
async function main(): Promise<void> {
  const bot = getBot();
  console.log("[telegram] bot starting (long-poll)…");
  await bot.launch();
  console.log("[telegram] bot stopped");
}

process.once("SIGINT", () => process.exit(0));
process.once("SIGTERM", () => process.exit(0));

main().catch((err: unknown) => {
  console.error("[telegram] fatal:", err);
  process.exit(1);
});
