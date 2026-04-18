import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

function wikiRoot(): string {
  const envPath = process.env["NEUROMCP_WIKI_PATH"];
  if (envPath && envPath.trim().length > 0) {
    return resolve(envPath);
  }
  return join(homedir(), ".neuromcp", "wiki");
}

export function contactsDir(): string {
  const dir = join(wikiRoot(), "contacts");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function cardPath(id: string): string {
  return join(contactsDir(), `${id}.md`);
}
