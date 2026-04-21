# Launch thread — Founder Inbox

One-stop source for the public announcement. Pick the platform and copy-paste
the variant you need. Pairs well with the screenshots under `docs/assets/`.

---

## X / Twitter — 8-tweet thread

### 1 · Hook
Built an inbox agent for solo founders that refuses to hallucinate.

Every reply it drafts has to trace every factual statement back to a verbatim
excerpt — from your memory, the inbound email, or a public-signal scrape of
the sender's domain.

No cite → no claim. 🧵

[attach: docs/assets/telegram-partner-research-cited.png]

---

### 2 · The verdanthq moment
An unknown sender reached out about a "Verdant × Founder Inbox" partnership.
The agent scraped verdanthq.com. Found a parked HugeDomains page.

The drafted reply told the founder — in the reply itself:
> _"when I pulled up verdanthq.com it showed as a parked domain for sale, so
> I want to make sure I have the right link before we go deeper."_

The Evidence panel showed that claim cited back to the scrape snippet.

### 3 · Why this matters
Most agent tools today will happily invent shared history that never existed,
or answer cold inbound with made-up details about your own company.

Founder Inbox has a **Verifier agent** that vetoes any claim whose `textMatch`
isn't literally in the source. Three regen failures and the raw email
escalates to Telegram with a "cannot ground" note.

It's architecturally impossible to auto-send a hallucination.

### 4 · What's in the box
- Background daemon, Gmail poll every 30s
- Prompt-injection guard (8 patterns, pre-LLM)
- Public-signal research (`/about`, `/team`, signature URLs)
- Wiki-backed relationship memory that learns from each approval
- Interactive dashboard — filter chips, search every draft + cite, click-row → full drill-down modal
- Gmail label lifecycle as idempotency (no duplicate cards on restart)

### 5 · The stack
- Opus 4.7 for classifier + drafter + verifier + planner
- Node 22, strict TypeScript 6
- `@anthropic-ai/sdk`, `googleapis`, `telegraf`, `vitest`
- No cloud backend. No database. No framework. Runs from your Mac.

### 6 · Numbers from two adversarial review rounds
- 37 unit tests — sender, gate, lifecycle, card store, normaliser, research, injection
- Median pipeline latency: 4.4s · p95 10.9s
- 100% intent classifier accuracy on the labelled fixture
- Codex gpt-5.3 round-4: SHIP-WITH-FIXES (addressed)
- Gemini 3.1 Pro round-4: caught two CRITICALs Codex missed — both fixed

### 7 · What I want from you
This is an indie ship. If you run a Gmail inbox and hate the chaos,
`pnpm install && pnpm setup && pnpm daemon` and it's live in under 10 minutes.

Fork it. Swap the identity file. Tune the rules.

github.com/AdelElo13/founder-inbox-agent

### 8 · The people who made it sharper
Built alongside Claude (Opus 4.7) as a pair.
Codex gpt-5.3 and Gemini 3.1 Pro ran the adversarial review rounds.
Submitted for the Cerebral Valley × Anthropic hackathon; we didn't get
selected in the 500 out of 13k+, so it's just public as a tool you can use.

MIT licensed. Have at it.

---

## Hacker News — single-message variant

**Title suggestion:** `Show HN: Founder Inbox – Gmail agent that won't hallucinate (cites every claim)`

**Body:**
Solo founders drown in inbound — 50+ DMs, 30+ cold emails, replies to every
post. The failure mode for most "AI inbox" tools is that they invent shared
history to sound natural.

Founder Inbox takes a different contract: every factual statement in a draft
must map to a verbatim excerpt from the relationship card, the inbound email,
or a public-signal scrape of the sender. A Verifier agent rejects claims that
can't trace back. Three regen failures and the raw email escalates to your
Telegram with a "cannot ground" note — no draft.

The demo moment that sold me on the pattern: an unknown sender mentioned
"Verdant" and a pending partnership. The agent scraped verdanthq.com, found a
parked HugeDomains page, and the drafted reply *told the founder in the reply
itself* that it looked wrong — cited back to the scrape snippet.

Background:
- Runs locally on your Mac — Node 22, strict TypeScript, Opus 4.7
- Gmail polling daemon (30s), Telegram approval bot, idempotent label chain
- Interactive dashboard with full drill-down (click a row → draft + every cite)
- 37 unit tests, MIT licensed

Originally built for the Cerebral Valley × Anthropic hackathon (Apr 2026);
we weren't in the 500 selected so this is an indie ship instead.

Repo: https://github.com/AdelElo13/founder-inbox-agent
Screenshots: https://github.com/AdelElo13/founder-inbox-agent/tree/main/docs/assets

Happy to answer anything about the evidence model, the injection guard, or
the label-lifecycle idempotency pattern.

---

## Product Hunt — tagline

**Tagline:** The inbox agent that won't hallucinate — every reply is cited.

**First comment / maker note:**
Hey 👋 I'm Adel. Built this because every "AI inbox" tool I tried happily
invented shared history that never existed. Founder Inbox flips the contract:
an LLM Verifier vetoes any claim that can't be traced to the relationship card,
the inbound email, or a public-signal scrape of the sender's domain.

Running live on my own Gmail since day 2. One-command setup, Telegram approval
for one-tap ship/reject/edit, Gmail labels as idempotency. MIT licensed, runs
entirely from your Mac.

Would love to hear what you think — especially if you've been bitten by an
agent that made up a meeting you never had.

---

## Anchor image captions (for tweet-embedded screenshots)

- **`telegram-partner-research-cited.png`**: "The draft *inside the Telegram card* tells the founder the sender's domain is a parked HugeDomains page — with that exact claim cited back to the scrape snippet in the Evidence panel."
- **`dashboard-interactive.png`**: "Dashboard: 34 events, filter by intent/decision, search every draft + cite."
- **`dashboard-modal.png`**: "Click a row → full drill-down. Classifier reasoning, inbound preview, draft reply, every cited claim, Telegram card id."
- **`telegram-investor-priya.png`**: "Cold investor reply — 4 claims, every one cited back to a line in the inbound email."
- **`telegram-sent-and-blocked.png`**: "Injection guard + approval chain — flagged adversarial email + approved real ones, one scroll."
