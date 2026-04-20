import { expect, it } from "vitest";
import { researchSender } from "./sender.ts";
import type { UnifiedMessage } from "../types.ts";

const baseMsg: UnifiedMessage = {
  id: "t1",
  threadId: "t1",
  receivedAt: "2026-04-20T10:00:00Z",
  channel: "gmail",
  from: { name: "Test", email: "test@example.com" },
  subject: "x",
  body: "",
  isLinkedInNotification: false,
  isXNotification: false,
};

it("skips common email providers (gmail, outlook, icloud)", async () => {
  for (const email of ["a@gmail.com", "b@outlook.com", "c@icloud.com"]) {
    const card = await researchSender({ ...baseMsg, from: { name: "", email } });
    expect(card.error).toMatch(/skipped common email provider/);
    expect(card.snippetIds).toHaveLength(0);
  }
});

it("returns error when email has no domain", async () => {
  const card = await researchSender({
    ...baseMsg,
    from: { name: "Broken", email: "notanemail" },
  });
  expect(card.error).toMatch(/no domain/);
});

it("extracts snippets and snippetIds from a mock fetch", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      `<html>
         <head>
           <title>Acme Ventures — early-stage AI fund</title>
           <meta name="description" content="Acme Ventures writes $500k-$2M first checks into AI infrastructure founders.">
         </head>
         <body>
           <h1>We back the next wave of AI infra</h1>
           <p>Our $80M Fund III is actively deploying into developer tools and agent systems.</p>
           <p>We previously invested in Clay, Resend, and Reflect.</p>
         </body>
       </html>`,
      { status: 200, headers: { "content-type": "text/html" } },
    )) as typeof fetch;

  try {
    const card = await researchSender({
      ...baseMsg,
      from: { name: "Sarah", email: "sarah@acmeventures.vc" },
      body: "Best, Sarah https://acmeventures.vc",
    });
    expect(card.target.domain).toBe("acmeventures.vc");
    expect(card.snippetIds.length).toBeGreaterThan(0);
    const allSnippets = Object.values(card.snippets).flat().join(" | ");
    expect(allSnippets).toContain("Acme Ventures");
    expect(allSnippets).toContain("AI infrastructure");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
