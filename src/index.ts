import { config as loadEnv } from "dotenv";
loadEnv({ override: true });
import { runOnce } from "./pipeline.ts";
import { runDaemon } from "./daemon.ts";

// `pnpm start` → one-shot pass (useful for demos, eval, manual runs).
// `pnpm start --watch` or `pnpm dev` → daemon loop.
const isWatch =
  process.argv.includes("--watch") ||
  process.argv.includes("-w") ||
  process.env["DAEMON"] === "1";

async function main(): Promise<void> {
  console.log("[bootstrap] Founder Inbox Agent starting…");
  if (isWatch) {
    await runDaemon();
  } else {
    await runOnce();
    console.log("[bootstrap] one-shot pass complete");
  }
}

main().catch((err: unknown) => {
  console.error("[fatal]", err);
  process.exit(1);
});
