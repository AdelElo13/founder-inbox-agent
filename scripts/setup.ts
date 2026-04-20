import { config as loadEnv } from "dotenv";
loadEnv({ override: true });

import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getGmailClient } from "../src/gmail/auth.ts";
import { LABELS, ensureLabels } from "../src/gmail/labels.ts";

/**
 * Pre-flight check + smoke test. Runs through every integration, reports
 * clean PASS/FAIL status, and on full success sends a welcome card to
 * Telegram so the founder sees "it works" before touching the main app.
 *
 * Goal per Gemini's round-3 feedback: a judge or first-time user should
 * be able to run `pnpm setup` and instantly see whether their environment
 * is ready — without reading docs or checking logs.
 */

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
  fixHint?: string;
}

async function main(): Promise<void> {
  const results: CheckResult[] = [];
  console.log("Founder Inbox — pre-flight check\n");

  results.push(await checkAnthropic());
  print(results.at(-1));

  results.push(await checkGmailToken());
  print(results.at(-1));

  results.push(await checkGmailApi());
  print(results.at(-1));

  results.push(await checkLabels());
  print(results.at(-1));

  results.push(await checkTelegram());
  print(results.at(-1));

  if (results.every((r) => r.ok)) {
    const sendRes = await sendWelcomeCard();
    results.push(sendRes);
    print(sendRes);
  }

  console.log("");
  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  if (passed === total) {
    console.log(`✅ All ${total} checks passed. Run \`pnpm daemon\` to go live.`);
  } else {
    console.log(`⚠️  ${passed}/${total} checks passed. Fix the ❌ items above.`);
    process.exitCode = 1;
  }
}

function print(r: CheckResult | undefined): void {
  if (!r) return;
  const icon = r.ok ? "✅" : "❌";
  console.log(`${icon} ${r.name}: ${r.detail}`);
  if (!r.ok && r.fixHint) console.log(`   Fix: ${r.fixHint}`);
}

async function checkAnthropic(): Promise<CheckResult> {
  const key = process.env["ANTHROPIC_API_KEY"];
  if (!key) {
    return {
      name: "Anthropic API key",
      ok: false,
      detail: "ANTHROPIC_API_KEY not set",
      fixHint:
        "Add to .env: ANTHROPIC_API_KEY=sk-ant-... (get one at console.anthropic.com)",
    };
  }
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: process.env["ANTHROPIC_MODEL"] ?? "claude-opus-4-7",
      max_tokens: 20,
      messages: [{ role: "user", content: "Reply with OK." }],
    });
    const model = res.model;
    return {
      name: "Anthropic API key",
      ok: true,
      detail: `reachable (model=${model})`,
    };
  } catch (err) {
    return {
      name: "Anthropic API key",
      ok: false,
      detail: `API call failed: ${truncateError(err)}`,
      fixHint:
        "Verify the key is valid at console.anthropic.com/settings/keys.",
    };
  }
}

async function checkGmailToken(): Promise<CheckResult> {
  const override = process.env["GMAIL_TOKEN_PATH"];
  const path = override ?? join(homedir(), ".responder", "gmail-token.json");
  if (!existsSync(path)) {
    return {
      name: "Gmail OAuth token",
      ok: false,
      detail: `no token at ${path}`,
      fixHint: "Run `pnpm auth` to complete the one-time OAuth flow.",
    };
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (!raw.refresh_token) {
      return {
        name: "Gmail OAuth token",
        ok: false,
        detail: "token missing refresh_token",
        fixHint:
          "Revoke at myaccount.google.com/permissions and re-run `pnpm auth`.",
      };
    }
    return {
      name: "Gmail OAuth token",
      ok: true,
      detail: `stored at ${path.replace(homedir(), "~")}`,
    };
  } catch (err) {
    return {
      name: "Gmail OAuth token",
      ok: false,
      detail: `token file unreadable: ${truncateError(err)}`,
      fixHint: "Delete the file and re-run `pnpm auth`.",
    };
  }
}

async function checkGmailApi(): Promise<CheckResult> {
  try {
    const gmail = getGmailClient();
    const profile = await gmail.users.getProfile({ userId: "me" });
    return {
      name: "Gmail API reachable",
      ok: true,
      detail: `authorized as ${profile.data.emailAddress} (${profile.data.messagesTotal ?? "?"} msgs)`,
    };
  } catch (err) {
    return {
      name: "Gmail API reachable",
      ok: false,
      detail: `API call failed: ${truncateError(err)}`,
      fixHint:
        "If token expired: delete ~/.responder/gmail-token.json and `pnpm auth`.",
    };
  }
}

async function checkLabels(): Promise<CheckResult> {
  try {
    const gmail = getGmailClient();
    const labels = await ensureLabels(gmail);
    const want = Object.values(LABELS);
    const have = want.filter((name) => labels[name]);
    if (have.length !== want.length) {
      return {
        name: "Gmail labels",
        ok: false,
        detail: `${have.length}/${want.length} labels present`,
        fixHint: "Re-run `pnpm auth`.",
      };
    }
    return {
      name: "Gmail labels",
      ok: true,
      detail: `all ${want.length} INBOX_AGENT_* labels present`,
    };
  } catch (err) {
    return {
      name: "Gmail labels",
      ok: false,
      detail: `label check failed: ${truncateError(err)}`,
    };
  }
}

async function checkTelegram(): Promise<CheckResult> {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  const chatId = process.env["TELEGRAM_FOUNDER_CHAT_ID"];
  if (!token || !chatId) {
    return {
      name: "Telegram bot",
      ok: false,
      detail: "TELEGRAM_BOT_TOKEN or TELEGRAM_FOUNDER_CHAT_ID missing",
      fixHint:
        "Create a bot via @BotFather, get your chat_id from @userinfobot, add both to .env.",
    };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = (await res.json()) as {
      ok: boolean;
      description?: string;
      result?: { username?: string; first_name?: string };
    };
    if (!data.ok) {
      return {
        name: "Telegram bot",
        ok: false,
        detail: `bot token rejected: ${data.description}`,
        fixHint: "Re-check the token from @BotFather.",
      };
    }
    const r = data.result;
    return {
      name: "Telegram bot",
      ok: true,
      detail: `@${r?.username} (${r?.first_name}) reachable · chat_id=${chatId}`,
    };
  } catch (err) {
    return {
      name: "Telegram bot",
      ok: false,
      detail: `API call failed: ${truncateError(err)}`,
    };
  }
}

async function sendWelcomeCard(): Promise<CheckResult> {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  const chatId = process.env["TELEGRAM_FOUNDER_CHAT_ID"];
  if (!token || !chatId) {
    return {
      name: "Welcome card",
      ok: false,
      detail: "skipped (Telegram not configured)",
    };
  }
  const text = [
    "✅ *Founder Inbox* — setup complete.",
    "",
    "Next steps:",
    "1. `pnpm seed` — plant 3 example RelationshipCards",
    "2. `pnpm daemon` — start the background loop (polls Gmail every 30s)",
    "3. `pnpm telegram` — keep this bot alive for approval cards",
    "4. `pnpm dashboard` — open the metrics dashboard",
    "",
    "New inbound signals will appear here as approval cards.",
  ].join("\n");

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: Number(chatId),
          text,
          parse_mode: "Markdown",
        }),
      },
    );
    const data = (await res.json()) as { ok: boolean; description?: string };
    if (!data.ok) {
      return {
        name: "Welcome card",
        ok: false,
        detail: `Telegram send failed: ${data.description}`,
        fixHint:
          "Did you /start the bot in Telegram? Telegram blocks unsolicited messages.",
      };
    }
    return {
      name: "Welcome card",
      ok: true,
      detail: "sent to your Telegram — check your phone",
    };
  } catch (err) {
    return {
      name: "Welcome card",
      ok: false,
      detail: `send failed: ${truncateError(err)}`,
    };
  }
}

function truncateError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/\s+/g, " ").slice(0, 120);
}

main().catch((err: unknown) => {
  console.error("[setup] fatal:", err);
  process.exit(1);
});
