import { runOnce } from "./pipeline.ts";

/**
 * Long-running daemon loop: polls Gmail every POLL_INTERVAL_MS, handles
 * errors gracefully (they never bubble up and kill the process), and
 * responds to SIGINT/SIGTERM with a clean shutdown.
 *
 * Idempotency is the QUEUED/PROCESSED Gmail label chain — `pollGmail`
 * filters `-label:INBOX_AGENT_QUEUED -label:INBOX_AGENT_PROCESSED`, so a
 * restarted daemon never re-processes a message it already touched. See
 * src/gmail/poller.ts for the single batch-modify that commits QUEUED
 * BEFORE any downstream work.
 */

interface DaemonOptions {
  pollIntervalMs: number;
  /** Back off to this interval after a consecutive-error threshold. */
  errorBackoffMs: number;
  /** Max consecutive errors before we exit non-zero (process supervisor restart). */
  maxConsecutiveErrors: number;
}

const DEFAULTS: DaemonOptions = {
  pollIntervalMs: 30_000,
  errorBackoffMs: 120_000,
  maxConsecutiveErrors: 5,
};

export async function runDaemon(
  options: Partial<DaemonOptions> = {},
): Promise<void> {
  const opts: DaemonOptions = { ...DEFAULTS, ...options };
  let running = true;
  let consecutiveErrors = 0;
  let startedCycles = 0;
  const startedAt = Date.now();

  const onShutdown = (sig: string): void => {
    console.log(`[daemon] received ${sig} — finishing current cycle and exiting`);
    running = false;
  };
  process.once("SIGINT", () => onShutdown("SIGINT"));
  process.once("SIGTERM", () => onShutdown("SIGTERM"));

  console.log(
    `[daemon] started (poll every ${opts.pollIntervalMs / 1000}s, ` +
      `error-backoff ${opts.errorBackoffMs / 1000}s after ${opts.maxConsecutiveErrors} failures)`,
  );
  heartbeat(startedAt, startedCycles);

  while (running) {
    const cycleStart = Date.now();
    try {
      await runOnce();
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors += 1;
      console.error(
        `[daemon] cycle error (${consecutiveErrors}/${opts.maxConsecutiveErrors}):`,
        err,
      );
      if (consecutiveErrors >= opts.maxConsecutiveErrors) {
        console.error(
          "[daemon] too many consecutive errors — exiting for supervisor restart",
        );
        process.exit(1);
      }
    }
    startedCycles += 1;

    const elapsed = Date.now() - cycleStart;
    const sleepFor =
      consecutiveErrors > 0
        ? opts.errorBackoffMs
        : Math.max(0, opts.pollIntervalMs - elapsed);
    if (!running) break;
    heartbeat(startedAt, startedCycles);
    await sleep(sleepFor, () => !running);
  }

  console.log(`[daemon] shutting down cleanly after ${startedCycles} cycles`);
}

function heartbeat(startedAt: number, cycles: number): void {
  const uptimeSec = Math.floor((Date.now() - startedAt) / 1000);
  const mm = Math.floor(uptimeSec / 60);
  const ss = uptimeSec % 60;
  console.log(
    `[daemon] heartbeat · uptime ${mm}m${ss.toString().padStart(2, "0")}s · ${cycles} cycles`,
  );
}

async function sleep(ms: number, shouldBail: () => boolean): Promise<void> {
  // Wake up every second so SIGINT-driven shutdown takes effect within ~1s
  // of the signal instead of waiting the full interval.
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (shouldBail()) return;
    const slice = Math.min(1000, end - Date.now());
    await new Promise((r) => setTimeout(r, slice));
  }
}
