import { config as loadEnv } from "dotenv";
loadEnv({ override: true });
import { writeCard } from "../src/memory/card-store.ts";
import type { RelationshipCard } from "../src/types.ts";

// Default to project-local data dir; never pollute the user's real neuromcp
// wiki unless they explicitly override NEUROMCP_WIKI_PATH in .env.
if (!process.env["NEUROMCP_WIKI_PATH"]) {
  process.env["NEUROMCP_WIKI_PATH"] = "./data/wiki";
}

const SEED: Array<{ card: RelationshipCard; title: string }> = [
  {
    title: "Sarah Chen — Ribbit Capital",
    card: {
      id: "sarah-at-ribbit-cap",
      identities: [
        {
          type: "email",
          value: "sarah@ribbit.vc",
          provenance: "seed",
          confidence: 1,
        },
        {
          type: "linkedin_url",
          value: "https://linkedin.com/in/sarahchen",
          provenance: "seed",
          confidence: 0.9,
        },
      ],
      contexts: [
        {
          role: "investor",
          company: "Ribbit Capital",
          established: "2026-03-02",
          evidenceIds: ["int-seed-1"],
        },
      ],
      interactions: [
        {
          id: "int-seed-1",
          at: "2026-03-02",
          channel: "gmail",
          summary:
            "Met at Paris AI Summit. Partners our last round via mutual intro. Interested in seed check.",
        },
      ],
      openAsks: [
        {
          id: "ask-seed-1",
          askedAt: "2026-03-02",
          request: "Send updated deck + MRR chart",
          status: "open",
        },
      ],
      importance: 5,
      lastInteractionAt: "2026-03-02",
    },
  },
  {
    title: "Marcus Webb — Acme Corp (customer)",
    card: {
      id: "marcus-at-acme-corp",
      identities: [
        {
          type: "email",
          value: "marcus@acmecorp.io",
          provenance: "seed",
          confidence: 1,
        },
      ],
      contexts: [
        {
          role: "customer",
          company: "Acme Corp",
          established: "2026-01-20",
          evidenceIds: [],
        },
      ],
      interactions: [
        {
          id: "int-seed-2",
          at: "2026-04-10",
          channel: "gmail",
          summary: "Active pilot user; asked about Electron support last week.",
        },
      ],
      openAsks: [
        {
          id: "ask-seed-2",
          askedAt: "2026-04-10",
          request: "Confirm when Electron app coverage ships",
          status: "in-progress",
        },
      ],
      importance: 3,
      lastInteractionAt: "2026-04-10",
    },
  },
  {
    title: "Camille Jourdain — freelance writer (press)",
    card: {
      id: "camille-at-techcrunch",
      identities: [
        {
          type: "email",
          value: "camille@techcrunch.com",
          provenance: "seed",
          confidence: 1,
        },
        {
          type: "x_handle",
          value: "@camillej",
          provenance: "seed",
          confidence: 0.8,
        },
      ],
      contexts: [
        {
          role: "press",
          company: "TechCrunch",
          established: "2026-02-15",
          evidenceIds: [],
        },
      ],
      interactions: [
        {
          id: "int-seed-3",
          at: "2026-02-15",
          channel: "gmail",
          summary: "Wrote our hackathon win story. Covers AI tooling space.",
        },
      ],
      openAsks: [],
      importance: 4,
      lastInteractionAt: "2026-02-15",
    },
  },
];

for (const { card, title } of SEED) {
  writeCard(card, title);
  console.log(`[seed] wrote ${card.id}`);
}

console.log(`[seed] ${SEED.length} cards written to NEUROMCP_WIKI_PATH/contacts/`);
