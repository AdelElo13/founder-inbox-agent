import type { ResearchCard, UnifiedMessage } from "../types.ts";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Safari/605.1.15 FounderInboxAgent/0.1";

const FETCH_TIMEOUT_MS = 5000;
const MAX_SNIPPETS_PER_URL = 4;
const MAX_SNIPPET_CHARS = 220;

/**
 * Gather public signals on an unknown sender. Tries up to four URLs:
 *   - https://<domain>           (homepage)
 *   - https://<domain>/about     (common "about" path)
 *   - URLs extracted from the inbound message signature/footer
 *   - https://<domain>/team      (long-tail fallback)
 *
 * Returns a ResearchCard the Drafter can cite from. Never throws — on total
 * failure returns an empty card with `error` populated so Drafter can fall
 * back to inbound-only citations.
 */
export async function researchSender(
  msg: UnifiedMessage,
): Promise<ResearchCard> {
  const domain = extractDomain(msg.from.email);
  const target = { name: msg.from.name, email: msg.from.email, domain };
  const fetchedAt = new Date().toISOString();

  if (!domain || SKIP_DOMAINS.has(domain)) {
    return {
      target,
      fetchedAt,
      snippets: {},
      snippetIds: [],
      error: domain
        ? `skipped common email provider (${domain})`
        : "no domain in email",
    };
  }

  const urls = pickUrls(domain, msg.body);
  const snippets: Record<string, string[]> = {};
  const snippetIds: string[] = [];

  await Promise.all(
    urls.map(async (url) => {
      const html = await safeFetch(url);
      if (!html) return;
      const chunks = extractSnippets(html);
      if (chunks.length === 0) return;
      snippets[url] = chunks;
      for (let i = 0; i < chunks.length; i += 1) {
        snippetIds.push(`${url}#${i}`);
      }
    }),
  );

  if (Object.keys(snippets).length === 0) {
    return {
      target,
      fetchedAt,
      snippets: {},
      snippetIds: [],
      error: `no URL returned usable content (tried ${urls.length})`,
    };
  }

  return { target, fetchedAt, snippets, snippetIds };
}

const SKIP_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "pm.me",
  "fastmail.com",
]);

function extractDomain(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 0) return "";
  return email.slice(at + 1).trim().toLowerCase();
}

function pickUrls(domain: string, body: string): string[] {
  const matches = Array.from(
    body.matchAll(/https?:\/\/([a-z0-9.-]+)(\/[^\s<>"']*)?/gi),
  );
  const fromSignature = matches
    .map((m) => m[0])
    .filter((url) => url.toLowerCase().includes(domain))
    .slice(0, 2);

  const base = [
    `https://${domain}`,
    `https://${domain}/about`,
    `https://${domain}/team`,
  ];

  return Array.from(new Set([...fromSignature, ...base])).slice(0, 4);
}

async function safeFetch(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*;q=0.8" },
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("text/html") && !type.includes("application/xhtml")) {
      return null;
    }
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractSnippets(html: string): string[] {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");

  const out: string[] = [];

  const titleMatch = cleaned.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1] : null;
  if (title) out.push(normalize(title));

  const descPattern1 = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i;
  const descPattern2 = /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i;
  const desc = cleaned.match(descPattern1)?.[1] ?? cleaned.match(descPattern2)?.[1];
  if (desc) out.push(normalize(desc));

  const headingMatches = Array.from(
    cleaned.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi),
  );
  const headings = headingMatches
    .slice(0, 2)
    .map((m) => normalize(stripTags(m[1] ?? "")));
  out.push(...headings.filter(Boolean));

  const paraMatches = Array.from(cleaned.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi));
  const paras = paraMatches
    .slice(0, 3)
    .map((m) => normalize(stripTags(m[1] ?? "")))
    .filter((t) => t.length >= 30);
  out.push(...paras);

  return Array.from(new Set(out))
    .filter(Boolean)
    .map((s) => s.slice(0, MAX_SNIPPET_CHARS))
    .slice(0, MAX_SNIPPETS_PER_URL);
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ");
}

function normalize(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
