import { config as loadEnv } from "dotenv";
loadEnv({ override: true });

import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

/**
 * Serves the dashboard over localhost. Safari / Chrome both block fetch()
 * on file:// URLs for same-origin reasons, so we ship a ~30-line static
 * server instead of asking the user to launch one.
 *
 * The server only serves files from ./public and a live-copied events.jsonl
 * from METRICS_DIR. No directory traversal, no other paths.
 */

const ROOT = resolve(process.cwd());
const METRICS_DIR = process.env["METRICS_DIR"] ?? join(ROOT, "metrics");
const PUBLIC_DIR = join(ROOT, "public");
const PORT = Number(process.env["DASHBOARD_PORT"] ?? 4321);

const metricsPath = join(METRICS_DIR, "events.jsonl");
if (!existsSync(metricsPath)) {
  console.error(
    `[dashboard] no events yet at ${metricsPath} — run \`pnpm start\` or \`pnpm eval:pipeline\` first`,
  );
  process.exit(1);
}

// Copy once at startup; the HTTP handler re-copies on every request to
// ./events.jsonl so the dashboard auto-refreshes without restarting this.
mkdirSync(PUBLIC_DIR, { recursive: true });
copyFileSync(metricsPath, join(PUBLIC_DIR, "events.jsonl"));

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".jsonl": "application/x-ndjson; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const server = createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400).end();
    return;
  }
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const rel = url.pathname === "/" ? "/dashboard.html" : url.pathname;
  const abs = normalize(join(PUBLIC_DIR, rel));
  if (!abs.startsWith(PUBLIC_DIR + sep) && abs !== PUBLIC_DIR) {
    res.writeHead(403).end();
    return;
  }

  // Hot-copy events.jsonl on demand so the dashboard's 5s poll picks up new runs.
  if (rel === "/events.jsonl" && existsSync(metricsPath)) {
    try {
      copyFileSync(metricsPath, join(PUBLIC_DIR, "events.jsonl"));
    } catch {
      // ignore — serve whatever we have
    }
  }

  if (!existsSync(abs)) {
    res.writeHead(404).end(`not found: ${rel}`);
    return;
  }
  const ext = extname(abs);
  res.writeHead(200, {
    "content-type": MIME[ext] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  res.end(readFileSync(abs));
});

// Bind explicitly to 127.0.0.1 (loopback only) — never 0.0.0.0. The dashboard
// reads events.jsonl which now contains inbound email previews, drafted
// replies, and cited excerpts. A stray listen-all would expose that to any
// device on the LAN. If you need remote access, tunnel it (ssh -L / Tailscale).
const HOST = "127.0.0.1";

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  console.log(`[dashboard] serving ${PUBLIC_DIR} at ${url} (loopback only)`);
  console.log(`[dashboard] press Ctrl+C to stop`);
  spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
});

process.once("SIGINT", () => {
  server.close(() => process.exit(0));
});
