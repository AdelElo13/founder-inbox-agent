# Founder Inbox Agent

> Evidence-grounded inbound agent for solo founders. Every reply cites a specific memory line — no hallucinated relationship history.
>
> Working codename only. Final brand name TBD pre-submission.

Built for **Cerebral Valley × Anthropic "Built with Opus 4.7" hackathon** (Apr 21–26, 2026).

## Status

- [x] Design approved (Codex 8.9/10, Gemini 9.0/10 — both AGREE)
- [x] Scaffold (Node 22+, TypeScript strict, typecheck green, 3/3 tests pass)
- [x] neuromcp contact-card CRUD + identity resolution
- [ ] Gmail OAuth (Day 0/1)
- [ ] Classifier + Memory + Drafter + Verifier + Planner agents (Day 1–2)
- [ ] Telegram approval bot (Day 2)
- [ ] Demo videos (Day 4)
- [ ] Submission (Day 5)

## What this is

Solo founders drown in inbound signals (Gmail, X DMs via email notifications, LinkedIn digests), not leads. Context collapses across threads. Fast replies cool into forgotten loops.

This agent:

1. Polls Gmail for new messages
2. **Classifies** intent (investor / customer / partner / press / noise)
3. **Recalls** relationship memory (who are they, where met, open asks)
4. **Drafts** a reply in founder voice
5. **Verifies** every factual claim cites a specific memory line — rejects hallucinations architecturally
6. Routes through a **confidence gate**: high-confidence FAQ ships; anything to an investor/press/ambiguous contact is escalated to Telegram for approval

Target metric: median ingest → drafted + evidence-grounded + ready-for-send under 30s.

## Getting started

### Prerequisites
- Node.js 22+
- pnpm
- Anthropic API key (grant via `.env` or your shell — hackathon credits apply)
- Google Cloud project with Gmail API enabled + OAuth client (5 min setup below)
- Telegram bot token (@BotFather — optional until Day 2)

### Install
```bash
pnpm install
cp .env.example .env
# fill in ANTHROPIC_API_KEY, GOOGLE_CLIENT_*, TELEGRAM_BOT_TOKEN
```

### Gmail OAuth setup (one-time, ~5 min)

Why this matters: the agent's ingest + send path talks to Gmail directly. Everything else — memory, drafting, approval — is dead without it.

**Step 1.** Go to <https://console.cloud.google.com/>. Create a new project (or pick an existing one).

**Step 2.** Enable the Gmail API:
- Navigate to **APIs & Services → Library**
- Search for "Gmail API" → click **Enable**

**Step 3.** Create an OAuth 2.0 Client ID:
- **APIs & Services → Credentials → Create Credentials → OAuth client ID**
- If prompted to configure the consent screen first:
  - User type: **External**
  - App name: "Founder Inbox Agent" (or whatever you want on the consent screen)
  - User support email: your email
  - Scopes: skip (we request the scope at runtime)
  - Test users: add your own Gmail address — required while the app is unverified
- Application type: **Desktop app** (important — not Web app)
- Name: "Founder Inbox Agent — local"
- **Download JSON** or copy the Client ID + Client Secret

**Step 4.** Add to `.env`:
```
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

**Step 5.** Run the one-time auth flow:
```bash
pnpm auth
```
This opens a Google consent URL. Approve. Google redirects to `http://localhost:4567/oauth/callback?code=...` which fails to load — **that's expected**. Copy the full redirect URL from your browser and paste it into the terminal. The token gets stored at `~/.responder/gmail-token.json` and survives repo rebuilds.

**Troubleshooting**:
- *"Google returned no refresh_token"* — revoke the app at <https://myaccount.google.com/permissions> and re-run `pnpm auth` to force the consent screen.
- *Consent screen says "app not verified"* — add your Gmail under **OAuth consent screen → Test users**. You don't need to submit for verification for personal use.

### Seed sample relationship cards
```bash
pnpm seed
```
Writes 3 example contact cards to `./data/wiki/contacts/` (project-local by default; point `NEUROMCP_WIKI_PATH` at your real neuromcp wiki only when going live).

### Typecheck & test
```bash
pnpm typecheck
pnpm test
```

### Run (once Day 1 agents land)
```bash
pnpm dev
```

## Architecture

```
Gmail poll (30s)
    │
    ▼
Normalize → UnifiedMessage
    │
    ▼
┌──────────────────────────────────────────┐
│  Agent team (Claude Agent SDK, Opus 4.7) │
│   [Classifier] → intent + risk           │
│   [Memory]     → RelationshipCard        │
│   [Drafter]    → body + evidence claims  │
│   [Verifier]   → veto on missing cites   │
│   [Planner]    → ActionPlan              │
└──────────────────────────────────────────┘
    │
    ▼
Confidence gate
    │
    ├─ FAQ whitelist + confidence ≥0.95 → Gmail send
    └─ anything else                    → Telegram approval card
```

**Key invariant**: the Verifier has veto. If any factual claim in the draft cannot trace to a `RelationshipCard` line id or the inbound message body, the draft is rejected and regenerated with stricter constraints. Three regen failures → escalate with "cannot ground this claim".

## Project layout

```
src/
├── agents/          # Claude Agent SDK stubs (classifier/memory/drafter/verifier/planner)
├── confidence/      # Gate policy: auto-send vs escalate
├── gmail/           # OAuth + poller + sender
├── memory/          # Card CRUD, identity resolution, paths
├── pipeline.ts      # Orchestrator: runs the agent team on one message
├── types.ts         # UnifiedMessage, RelationshipCard, DraftWithEvidence, etc.
└── index.ts         # CLI entry
scripts/
├── seed-fixtures.ts      # Write sample contact cards
├── label-messages.ts     # [Day 0] Interactive labeler for eval set
└── eval-classifier.ts    # [Day 1] Run classifier over labeled set, report confusion matrix
```

## Why it's defensible (Codex + Gemini alignment)

- **Not another email copilot.** Shortwave / Superhuman / Missive are channel-specific. We are relationship-ops across Gmail + downstream channels with grounded memory.
- **Not cloud-based computer-use.** Runs on-device. Raw message bodies + relationship memory never leave the Mac. Only the LLM inference goes to Anthropic (same as any Claude Code user).
- **Not horizontal agent infra.** We are a vertical: founder-grade inbound, evidence-gated, one approval surface.
- **Not absorbable by Anthropic-ships-Dispatch-v2.** The moat is founder-voice memory and citation-grounded drafting, not the remote-control plumbing (they have that now).

## Design docs

- `DESIGN_v2.md` — approved architecture, data shapes, day-by-day plan
- `REVIEWS.md` — Codex + Gemini review transcripts

## License

TBD pre-submission. Currently unlicensed (personal work).
