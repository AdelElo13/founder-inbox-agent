import "dotenv/config";
import { authorizeInteractive } from "../src/gmail/auth.ts";
import { ensureLabels } from "../src/gmail/labels.ts";
import { google } from "googleapis";

async function main(): Promise<void> {
  console.log("Gmail OAuth — one-time setup\n");
  console.log(
    "Prerequisites:\n" +
      "  1. A Google Cloud project with Gmail API enabled\n" +
      "  2. An OAuth 2.0 Client ID (Desktop app type)\n" +
      "  3. GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in .env\n" +
      "\nSee README.md §Gmail OAuth setup for details.\n",
  );

  const client = await authorizeInteractive();
  const gmail = google.gmail({ version: "v1", auth: client });

  console.log("\nEnsuring INBOX_AGENT_* labels exist...");
  const labels = await ensureLabels(gmail);
  for (const [name, id] of Object.entries(labels)) {
    if (name.startsWith("INBOX_AGENT_")) {
      console.log(`  ${name} -> ${id}`);
    }
  }

  const profile = await gmail.users.getProfile({ userId: "me" });
  console.log(`\nAuthorized as: ${profile.data.emailAddress}`);
  console.log("Setup complete. You can now run `pnpm dev`.");
}

main().catch((err: unknown) => {
  console.error("[auth] failed:", err);
  process.exit(1);
});
