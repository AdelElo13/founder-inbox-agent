import { config as loadEnv } from "dotenv";
loadEnv({ override: true });
import { runOnce } from "./pipeline.ts";

async function main(): Promise<void> {
  console.log("[bootstrap] Founder Inbox Agent starting…");
  await runOnce();
  console.log("[bootstrap] one-shot pass complete");
}

main().catch((err: unknown) => {
  console.error("[fatal]", err);
  process.exit(1);
});
