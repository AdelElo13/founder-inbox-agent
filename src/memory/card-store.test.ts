import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { listCardIds, readCard, writeCard } from "./card-store.ts";
import type { RelationshipCard } from "../types.ts";

let tmp: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "founder-inbox-"));
  process.env["NEUROMCP_WIKI_PATH"] = tmp;
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

it("roundtrips a card through write + read", () => {
  const card: RelationshipCard = {
    id: "sarah-at-acme-com",
    identities: [
      {
        type: "email",
        value: "sarah@acme.com",
        provenance: "msg-123",
        confidence: 1,
      },
    ],
    contexts: [
      {
        role: "investor",
        company: "Acme Ventures",
        established: "2026-03-01",
        evidenceIds: ["int-1"],
      },
    ],
    interactions: [
      {
        id: "int-1",
        at: "2026-03-15",
        channel: "gmail",
        summary: "First email about Series A",
      },
    ],
    openAsks: [],
    importance: 5,
    lastInteractionAt: "2026-03-15",
  };

  writeCard(card, "Sarah at Acme Ventures");
  const got = readCard(card.id);

  expect(got).not.toBeNull();
  expect(got?.identities[0]?.value).toBe("sarah@acme.com");
  expect(got?.contexts[0]?.role).toBe("investor");
  expect(got?.interactions).toHaveLength(1);
  expect(got?.interactions[0]?.summary).toBe("First email about Series A");
  expect(got?.importance).toBe(5);
});

it("returns null for unknown card", () => {
  expect(readCard("does-not-exist")).toBeNull();
});

it("listCardIds returns all written cards", () => {
  writeCard(
    {
      id: "bob-at-example-com",
      identities: [
        {
          type: "email",
          value: "bob@example.com",
          provenance: "seed",
          confidence: 1,
        },
      ],
      contexts: [],
      interactions: [],
      openAsks: [],
      importance: 2,
    },
    "Bob",
  );
  const ids = listCardIds();
  expect(ids).toContain("sarah-at-acme-com");
  expect(ids).toContain("bob-at-example-com");
});
