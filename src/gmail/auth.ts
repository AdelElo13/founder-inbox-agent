import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { OAuth2Client, type Credentials } from "google-auth-library";
import { google, type gmail_v1 } from "googleapis";

/**
 * Scope: gmail.modify lets us read messages, send replies, and add/remove
 * labels. It does NOT allow permanent deletion — that requires a stronger
 * scope we intentionally avoid for safety.
 */
const SCOPES = ["https://www.googleapis.com/auth/gmail.modify"];

function tokenPath(): string {
  const override = process.env["GMAIL_TOKEN_PATH"];
  if (override) return override;
  return join(homedir(), ".responder", "gmail-token.json");
}

function readStoredToken(): Credentials | null {
  const path = tokenPath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Credentials;
  } catch {
    return null;
  }
}

function persistToken(token: Credentials): void {
  const path = tokenPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(token, null, 2), "utf8");
}

function clientFromEnv(): OAuth2Client {
  const clientId = process.env["GOOGLE_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];
  const redirectUri =
    process.env["GOOGLE_REDIRECT_URI"] ?? "http://localhost:4567/oauth/callback";

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET. " +
        "See README.md for Google Cloud Console setup.",
    );
  }

  return new OAuth2Client({ clientId, clientSecret, redirectUri });
}

/**
 * Interactive OAuth flow: opens browser, listens on localhost for callback,
 * exchanges code for tokens, persists refresh_token. Runs once via
 * `pnpm auth`. Returns the authorized client.
 */
export async function authorizeInteractive(): Promise<OAuth2Client> {
  const client = clientFromEnv();
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  console.log("\nOpen this URL in your browser to authorize:\n");
  console.log(authUrl);
  console.log("\nAfter approving, paste the FULL redirect URL here:\n");

  const redirect = await readLine();
  const parsed = new URL(redirect.trim());
  const code = parsed.searchParams.get("code");
  if (!code) throw new Error("No ?code= in pasted URL.");

  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google returned no refresh_token. Revoke the app in Google Account " +
        "settings and re-run to force consent.",
    );
  }
  persistToken(tokens);
  client.setCredentials(tokens);
  console.log(`\nSaved token to ${tokenPath()}`);
  return client;
}

/**
 * Returns an authorized Gmail client, using the stored refresh_token to
 * mint new access_tokens automatically. Throws if no token is stored —
 * the caller must run `pnpm auth` first.
 */
export function getGmailClient(): gmail_v1.Gmail {
  const stored = readStoredToken();
  if (!stored) {
    throw new Error(
      "No stored Gmail credentials. Run `pnpm auth` first to complete the " +
        "one-time OAuth flow.",
    );
  }
  const client = clientFromEnv();
  client.setCredentials(stored);
  client.on("tokens", (t: Credentials) => {
    // Persist refreshed access tokens so we don't re-fetch every run.
    persistToken({ ...stored, ...t });
  });
  return google.gmail({ version: "v1", auth: client });
}

/**
 * Read a single line from stdin. Resolves on the first newline OR on EOF
 * (Ctrl+D). Earlier versions waited only for EOF, which caused the auth
 * script to hang after the user pasted + Enter — hitting Enter does not
 * close stdin on a TTY.
 */
async function readLine(): Promise<string> {
  return new Promise((resolve) => {
    let buffer = "";
    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString("utf8");
      const newline = buffer.indexOf("\n");
      if (newline !== -1) {
        process.stdin.off("data", onData);
        process.stdin.off("end", onEnd);
        process.stdin.pause();
        resolve(buffer.slice(0, newline));
      }
    };
    const onEnd = (): void => {
      process.stdin.off("data", onData);
      resolve(buffer);
    };
    process.stdin.on("data", onData);
    process.stdin.on("end", onEnd);
    process.stdin.resume();
  });
}
