# Founder Inbox

> **An evidence-grounded inbound operator for solo founders.**
> Every reply cites a specific line in your relationship memory.
> Nothing auto-sent, nothing hallucinated.

Built for **Cerebral Valley × Anthropic "Built with Opus 4.7" hackathon** (Apr 21–26, 2026).

---

## The problem

High-distribution founders don't drown in leads — they drown in **inbound signals**.
50+ DMs across X and LinkedIn, 30+ cold emails, replies to every post. Context drops.
Fast replies cool into forgotten threads. The ones that matter — investors, customers,
press — mix into noise. And the worst kind of reply is the one that invents a shared
history you never had.

## The product

Founder Inbox runs locally on your Mac. For every message:

1. **Classifies** intent (investor / customer / partner / press / noise / unknown).
2. **Pulls relationship memory** from a wiki of contact cards you've built over time.
3. **Researches** unknown senders from their own public signals (website, bio, signature).
4. **Drafts** a reply — every factual claim pinned to a memory line or research snippet.
5. **Verifies** each claim traces back to a real source. Hallucinations are architecturally
   rejected before you ever see them.
6. **Escalates** anything high-stakes to your Telegram with a one-tap Approve / Reject / Edit.

Investors and press always require approval. Pure noise is archived. The founder only
sees things worth deciding on.

---

## What it looks like in practice

**A live research moment.** An unknown sender's domain (`verdanthq.com`) turned out
to be a parked HugeDomains listing. The Drafter didn't invent context — it scraped
the domain, saw the parked page, and told the founder *in the draft itself*:

> *"when I pulled up verdanthq.com it showed as a parked domain for sale, so I want
> to make sure I have the right link before we go deeper."*

The Evidence panel below the draft shows that claim cited back to the research
snippet, verified by the Verifier before the founder ever sees it.

<img src="docs/assets/telegram-partner-research-cited.png" width="420">

---

**Live pipeline dashboard** — real events from a real Gmail inbox:

![Pipeline Dashboard](docs/assets/dashboard.png)

---

**Cold investor reply** — 4 claims, each cited back to a line in the inbound email:

<img src="docs/assets/telegram-investor-priya.png" width="420">

---

**Press inquiry** with research on the sender's publication:

<img src="docs/assets/telegram-press-card.png" width="420">

---

**Injection guard + approval chain** — rejected adversarial email + approved Sarah
and Daniel, all in one scroll:

<img src="docs/assets/telegram-sent-and-blocked.png" width="420">

---

## Architecture

```
Gmail poll (30s)
    │
    ▼
Normalize → UnifiedMessage
    │
    ▼
🛡 Prompt-injection guard (8 patterns) — blocked messages skip the LLM entirely
    │
    ▼
┌──────────────────────────────────────────────────┐
│   Agent team (Claude Agent SDK, Opus 4.7)        │
│   [Classifier]  → intent + risk                  │
│   [Memory]      → RelationshipCard lookup        │
│   [Research]    → public-signal fetch (optional) │
│   [Drafter]     → body + EvidenceClaim[]         │
│   [Verifier]    → veto on missing citations      │
│   [Planner]     → ActionPlan                     │
└──────────────────────────────────────────────────┘
    │
    ▼
Confidence gate
    │
    ├─ FAQ whitelist + conf ≥ 0.95 → Gmail send
    ├─ noise                       → archive
    └─ everything else              → Telegram approval card
```

The invariant the Verifier enforces: **every factual statement in a draft must match
a verbatim excerpt from the relationship card, the inbound email, or a fetched research
snippet.** If it can't, the draft is rejected and regenerated with stricter constraints.
Three regeneration failures escalate the raw email with a "cannot ground" note.

---

## What makes it different

| | Founder Inbox | Shortwave / Superhuman | Cloud computer-use agents |
|---|---|---|---|
| Cross-channel relationship memory | ✅ wiki-backed, persistent | ❌ channel-specific | ❌ ephemeral context |
| Evidence-grounded drafts (cited) | ✅ Verifier vetoes uncited claims | ❌ free-form generation | ❌ free-form generation |
| Public-signal research for cold senders | ✅ scraped + cited | ❌ | partial (search tools only) |
| Runs on-device | ✅ your Mac, your Gmail | Cloud | Cloud VM |
| Prompt-injection guard | ✅ 8 patterns, pre-LLM | ❌ | partial |
| Mobile approval workflow | ✅ Telegram card, one-tap | Mobile app | — |

---

## Metrics (from a real 28-message run)

- **Intent classification accuracy**: 100% on a 10-message labeled fixture
- **Live Gmail noise detection**: 10 of 10 automated notifications correctly dropped
- **Verifier rejection rate**: fabrications caught before approval (proven in demo)
- **Median pipeline latency**: 4.4s · p95 10.9s
- **Auto-send false positive rate**: 0 (gate blocks investor/press/unknown)

The dashboard at `http://localhost:4321` shows the live numbers.

---

## Getting started

### Prerequisites
- Node.js 22+ · pnpm
- Anthropic API key (hackathon credits work)
- Google Cloud project with Gmail API + OAuth Desktop client
- Telegram bot token (`@BotFather`) + your numeric chat id (`@userinfobot`)

### Install
```bash
pnpm install
cp .env.example .env
# Fill in ANTHROPIC_API_KEY, GOOGLE_CLIENT_*, TELEGRAM_*
pnpm auth            # one-time OAuth flow for Gmail
```
See **"Gmail OAuth setup"** below for the 5-minute Google Cloud Console walkthrough.

### Run
```bash
pnpm telegram        # Terminal 1: bot polling loop (long-running)
pnpm start           # Terminal 2: one-shot Gmail poll + process
pnpm dashboard       # Terminal 3: metrics dashboard at http://localhost:4321
```

### Demo seeding (no real senders needed)
```bash
pnpm seed            # 3 contact cards in the local neuromcp wiki
pnpm seed:inbox      # inserts 3 test emails into your Gmail INBOX
                     # (1 investor, 1 press, 1 injection attempt)
pnpm start           # watch the pipeline handle them live
```

### Quality gates
```bash
pnpm typecheck       # strict TypeScript
pnpm test            # 18 unit tests (Vitest)
pnpm eval            # classifier eval on labeled fixture
pnpm eval:pipeline   # full pipeline eval on 10-message fixture
```

---

## Gmail OAuth setup (5 min)

1. Open <https://console.cloud.google.com/> → create or pick a project.
2. **APIs & Services → Library** → enable "Gmail API".
3. **APIs & Services → Credentials → Create → OAuth Client ID**:
   - Consent screen: External, Testing, add your own Gmail as a test user.
   - Application type: **Desktop app**.
4. Copy the Client ID and Client Secret into `.env`.
5. Run `pnpm auth`. A Google consent URL prints. Approve in your browser.
   Google redirects to `http://localhost:4567/oauth/callback?code=...` (page fails
   to load — that's expected). Paste the full URL back into the terminal.
6. Token is saved to `~/.responder/gmail-token.json` and survives repo rebuilds.
   Labels `INBOX_AGENT_QUEUED / PROCESSED / SENT / REJECTED / ESCALATED` are
   auto-created in your Gmail.

---

## Layout

```
src/
├── agents/          # classifier / memory / drafter / verifier / planner
├── confidence/      # gate policy
├── gmail/           # OAuth, poller, sender, labels, normalize
├── memory/          # contact-card CRUD on neuromcp wiki
├── research/        # public-signal fetcher for unknown senders
├── security/        # prompt-injection guard
├── telegram/        # approval bot + queue
├── metrics/         # jsonl event log
├── fixtures/        # 10 gold-labeled demo messages
├── pipeline.ts      # orchestrator
├── types.ts         # shared types
└── index.ts         # CLI entry
scripts/
├── gmail-auth.ts       # one-time OAuth
├── seed-fixtures.ts    # plant sample RelationshipCards
├── seed-inbox.ts       # plant 3 demo emails into Gmail
├── replay-last.ts      # un-label N recent messages for demos
├── eval-classifier.ts  # classifier accuracy on fixtures
├── eval-pipeline.ts    # full pipeline run on fixtures
├── telegram-poll.ts    # bot long-poll runner
└── open-dashboard.ts   # metrics server at localhost:4321
public/
├── dashboard.html      # static dashboard shell
└── dashboard.js        # live-updates from events.jsonl
docs/
├── DESIGN_v2.md        # approved architecture (Codex 8.9/10, Gemini 9.0/10)
├── REVIEWS.md          # adversarial reviews
├── DEMO.md             # 90s submission video storyboard
├── MAC_CONTROL_BUGS.md # live bug log from using mac-control-mcp
└── assets/             # screenshots
```

---

## Tech stack

| Layer | Tech |
|-------|------|
| Runtime | Node 22+ |
| Language | TypeScript 5.6 (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| AI | `@anthropic-ai/sdk` 0.90 · model `claude-opus-4-7` |
| Gmail | `googleapis` 171 |
| Memory | Markdown frontmatter + git (neuromcp-compatible wiki) |
| Telegram | `telegraf` 4 |
| Testing | `vitest` 4 |
| Metrics | JSONL + vanilla-JS dashboard |

No cloud services. No database. No framework. Everything runs from your Mac.

---

## Design docs

- [`DESIGN_v2.md`](./DESIGN_v2.md) — architecture + data shapes + day-by-day plan (scored 8.9/10 by Codex, 9.0/10 by Gemini in adversarial review)
- [`REVIEWS.md`](./REVIEWS.md) — review transcripts
- [`DEMO.md`](./DEMO.md) — 90-second submission video storyboard
- [`MAC_CONTROL_BUGS.md`](./MAC_CONTROL_BUGS.md) — 10 bugs + 5 workarounds logged from real use of our Swift MCP

---

## Status

- **17+ commits**, private → public at submission
- **18 unit tests**, all passing
- **Live end-to-end validated** on the author's own Gmail inbox
- **2 demo cards received + approved** via Telegram during live testing

## License

Post-hackathon: TBD. Currently unlicensed.
