import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import matter from "gray-matter";
import { cardPath, contactsDir } from "./paths.ts";
import type { RelationshipCard } from "../types.ts";

interface Frontmatter {
  title: string;
  type: "contact";
  created: string;
  updated: string;
  confidence: "high" | "medium" | "low";
  related: string[];
  importance: RelationshipCard["importance"];
  identities: RelationshipCard["identities"];
  contexts: RelationshipCard["contexts"];
  openAsks: RelationshipCard["openAsks"];
  lastInteractionAt?: string;
}

export function readCard(id: string): RelationshipCard | null {
  const path = cardPath(id);
  if (!existsSync(path)) return null;

  const raw = readFileSync(path, "utf8");
  const parsed = matter(raw);
  const fm = parsed.data as Frontmatter;
  const interactions = parseInteractions(parsed.content);

  const card: RelationshipCard = {
    id,
    identities: fm.identities ?? [],
    contexts: fm.contexts ?? [],
    interactions,
    openAsks: fm.openAsks ?? [],
    importance: fm.importance ?? 3,
  };
  if (fm.lastInteractionAt) card.lastInteractionAt = fm.lastInteractionAt;
  return card;
}

export function writeCard(card: RelationshipCard, title: string): void {
  const path = cardPath(card.id);
  const existed = existsSync(path);
  const now = today();

  const fm: Frontmatter = {
    title,
    type: "contact",
    created: existed ? readCreated(path) : now,
    updated: now,
    confidence: "medium",
    related: [],
    importance: card.importance,
    identities: card.identities,
    contexts: card.contexts,
    openAsks: card.openAsks,
    ...(card.lastInteractionAt && { lastInteractionAt: card.lastInteractionAt }),
  };

  const body = renderBody(card, title);
  const file = matter.stringify(body, fm);
  writeFileSync(path, file, "utf8");
}

export function listCardIds(): string[] {
  return readdirSync(contactsDir())
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.slice(0, -3));
}

function renderBody(card: RelationshipCard, title: string): string {
  const lines: string[] = [`# ${title}`, ""];
  if (card.contexts.length > 0) {
    lines.push("## Contexts");
    for (const ctx of card.contexts) {
      const company = ctx.company ? ` @ ${ctx.company}` : "";
      lines.push(`- **${ctx.role}**${company} \u2014 since ${ctx.established}`);
    }
    lines.push("");
  }
  if (card.openAsks.length > 0) {
    lines.push("## Open asks");
    for (const ask of card.openAsks) {
      lines.push(`- [${ask.status}] ${ask.request} (asked ${ask.askedAt})`);
    }
    lines.push("");
  }
  if (card.interactions.length > 0) {
    lines.push("## Interactions");
    for (const it of card.interactions) {
      lines.push(
        `- \`${it.id}\` \u00b7 ${it.at} \u00b7 ${it.channel} \u2014 ${it.summary}`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

const INTERACTION_LINE =
  /^- `([^`]+)` \u00b7 (\S+) \u00b7 (\S+) \u2014 (.+)$/;

function parseInteractions(body: string): RelationshipCard["interactions"] {
  const lines = body.split("\n");
  const out: RelationshipCard["interactions"] = [];
  let inSection = false;

  for (const raw of lines) {
    if (raw.trim() === "## Interactions") {
      inSection = true;
      continue;
    }
    if (raw.startsWith("## ") && inSection) break;
    if (!inSection) continue;

    const match = INTERACTION_LINE.exec(raw);
    if (!match) continue;
    const [, id, at, channel, summary] = match;
    if (!id || !at || !channel || !summary) continue;
    out.push({ id, at, channel, summary });
  }
  return out;
}

function readCreated(path: string): string {
  const raw = readFileSync(path, "utf8");
  const fm = matter(raw).data as Partial<Frontmatter>;
  return fm.created ?? today();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
