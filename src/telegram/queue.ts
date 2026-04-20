import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ApprovalItem } from "./types.ts";

/**
 * Tiny append-only approval queue persisted as JSONL. Every state transition
 * (enqueue / approve / reject / edit / expire) appends a new event line. The
 * current state of an item is the LAST line with that id.
 *
 * Why JSONL over SQLite: <100 items/day expected, no migrations needed,
 * diff-friendly for debugging, one flat file to inspect or wipe.
 */

function queuePath(): string {
  const dir = process.env["DATA_DIR"] ?? "./data";
  return join(resolve(dir), "approvals.jsonl");
}

function ensureFile(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path)) writeFileSync(path, "", "utf8");
}

export function enqueue(item: ApprovalItem): void {
  const path = queuePath();
  ensureFile(path);
  appendFileSync(path, `${JSON.stringify(item)}\n`, "utf8");
}

export function updateStatus(
  id: string,
  patch: Partial<Pick<ApprovalItem, "status" | "resolvedAt" | "telegramMessageId" | "editedBody">>,
): ApprovalItem | null {
  const current = findById(id);
  if (!current) return null;
  const next: ApprovalItem = { ...current, ...patch };
  enqueue(next);
  return next;
}

export function findById(id: string): ApprovalItem | null {
  const path = queuePath();
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
  let latest: ApprovalItem | null = null;
  for (const line of lines) {
    try {
      const item = JSON.parse(line) as ApprovalItem;
      if (item.id === id) latest = item;
    } catch {
      // Skip malformed lines — forward-compat with schema changes.
    }
  }
  return latest;
}

export function listPending(): ApprovalItem[] {
  const path = queuePath();
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
  const latest = new Map<string, ApprovalItem>();
  for (const line of lines) {
    try {
      const item = JSON.parse(line) as ApprovalItem;
      latest.set(item.id, item);
    } catch {
      // Skip.
    }
  }
  return Array.from(latest.values()).filter((i) => i.status === "pending");
}
