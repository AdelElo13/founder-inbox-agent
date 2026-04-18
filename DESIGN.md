# RESPONDER — Design Document

> **Status**: Pre-build architectural scaffold. Written Apr 18, 2026.
> **Target**: Cerebral Valley × Anthropic "Built with Opus 4.7" hackathon (Apr 21–26, 2026).
> **Pitch**: Inbound operating system for solo founders — closes relationship loops in <60s.

---

## 1. Problem

High-distribution founders drown in **inbound signals**, not leads. Typical weekly volume for an active solo founder:

- 30–60+ X DMs
- 20–40+ LinkedIn DMs + InMail
- 50–100+ Gmail threads (cold, warm, investor, customer, press, noise)
- 20+ replies to their own posts (comments, reactions)

The pain is not volume. The pain is **context collapse**: fast replies cool into forgotten threads; the messages that matter (investors, customers, press) mix into noise; relationship memory ("we met at X, last ask was Y") lives in nobody's head, so every reply starts from zero.

**Current solutions fail**:
- Superhuman, Shortwave, Missive → email-only, no cross-channel stitching, no relationship memory
- Sprout, ManyChat → social-only, community-manager framing, not founder-grade
- Generic Claude / ChatGPT → needs manual copy-paste per message, no persistent memory

**The gap**: nothing does **founder-grade relationship ops across channels with persistent personal memory**.

---

## 2. Solution

RESPONDER is an always-on personal agent that runs locally on the founder's Mac. Single loop:

```
incoming signal
  → classify intent (investor / customer / partner / press / noise)
  → pull relationship memory (who, where met, last interaction, current ask)
  → draft reply in founder's voice
  → confidence gate
      ├─ high confidence + low risk  → auto-send
      └─ low confidence OR high stakes → escalate to founder for approval
  → execute next action (book meeting, log in CRM, route to Slack)
  → close loop: update memory with what happened
```

Target SLA: **median time from signal arrival to closed loop < 60 seconds** (vs. 11+ minutes manual).

---

## 3. Architecture

### 3.1 Components

```
┌──────────────────────────────────────────────────────────────┐
│                  RESPONDER (local Mac process)               │
│                                                              │
│  ┌───────────┐   ┌───────────┐   ┌───────────┐   ┌─────────┐ │
│  │  Gmail    │   │   X       │   │ LinkedIn  │   │ (more)  │ │
│  │ listener  │   │ listener  │   │ listener  │   │ ...     │ │
│  └─────┬─────┘   └─────┬─────┘   └─────┬─────┘   └─────────┘ │
│        │               │               │                     │
│        └───────┬───────┴───────┬───────┘                     │
│                ▼               ▼                              │
│           ┌────────────────────────┐                          │
│           │  Normalization layer   │                          │
│           │  → UnifiedMessage      │                          │
│           └───────────┬────────────┘                          │
│                       ▼                                       │
│           ┌────────────────────────┐                          │
│           │  Orchestrator          │                          │
│           │  (Claude Agent SDK)    │                          │
│           │  agent teams:          │                          │
│           │   • Classifier         │                          │
│           │   • Memory retriever   │                          │
│           │   • Drafter            │                          │
│           │   • Action planner     │                          │
│           └───────────┬────────────┘                          │
│                       ▼                                       │
│           ┌────────────────────────┐                          │
│           │   Confidence gate      │                          │
│           └─┬──────────────────┬───┘                          │
│             │                  │                              │
│      auto-send               escalate                         │
│             │                  │                              │
│             ▼                  ▼                              │
│  ┌────────────────┐   ┌────────────────┐                      │
│  │ Action layer   │   │ Approval UX    │                      │
│  │ • Gmail API    │   │ • Telegram bot │                      │
│  │ • mac-control- │   │   (mobile)     │                      │
│  │   mcp (UI)     │   │ • Raycast ext. │                      │
│  │ • Calendar     │   │   (desktop)    │                      │
│  │ • Notion CRM   │   └────────────────┘                      │
│  └────────┬───────┘                                           │
│           ▼                                                   │
│  ┌────────────────────────┐                                   │
│  │  neuromcp              │                                   │
│  │  • Relationship cards  │                                   │
│  │  • Interaction history │                                   │
│  │  • Outcome tracking    │                                   │
│  └────────────────────────┘                                   │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Channel strategy (addresses ToS/API walls)

**Ingestion (read)** — email-first, always:

| Channel | Ingestion path | ToS risk |
|---------|---------------|----------|
| Gmail | Gmail API (OAuth) | 0 |
| X DMs | Email notification from X → Gmail API | 0 |
| X mentions | Email notification → Gmail API | 0 |
| LinkedIn DMs | Email notification → Gmail API | 0 |
| LinkedIn InMail | Email notification → Gmail API | 0 |
| LinkedIn comments | Email digest → Gmail API | 0 |
| Reddit replies | Email notification → Gmail API | 0 |
| Product Hunt | Email → Gmail API | 0 |

All incoming signals funnel through Gmail. Single auth, single parser, zero platform API lock-in.

**Outbound (reply/action)** — split by channel:

| Channel | Outbound path | Risk |
|---------|---------------|------|
| Gmail | Gmail API | 0 |
| X DM | mac-control-mcp → X web (user's session) | Low (personal desktop, not mass scrape) |
| LinkedIn DM | mac-control-mcp → LinkedIn web (user's session) | Low (same as above) |
| Calendar | Google Calendar API | 0 |
| Notion CRM | Notion API | 0 |

**Critical distinction**: RESPONDER is a *personal desktop agent on one user's machine using their own authenticated sessions*. This is architecturally and legally distinct from mass-scrape bots running on VPSs with fake accounts. The desktop automation does what the user would do manually — just faster.

### 3.3 Agent teams topology (Opus 4.7)

Leverage Opus 4.7 agent teams for parallel work on each message:

```
[orchestrator]
    ├─ [classifier agent]      → intent + urgency + risk
    ├─ [memory agent]          → relationship card lookup + update
    └─ [drafter agent]         → reply in founder voice
          └─ [action planner]   → calendar + CRM + routing
```

Parallel execution = lower latency. Each agent has a narrow role, narrow prompt, narrow failure surface.

### 3.4 Confidence gate policy

Every draft ships with a confidence score + risk tier:

| Intent | Default action | Override |
|--------|---------------|----------|
| Noise / spam | Archive, no reply | Never auto-reply |
| Customer FAQ (known answer in memory) | Auto-send | Founder can toggle off |
| Partner / collaboration | Auto-draft, one-tap approve | Default: approve required |
| Investor / press | Auto-draft, MANDATORY approval | Never auto-send, ever |
| High-stakes (anything new or ambiguous) | Escalate to founder | Always |

Approval UX: Telegram bot for mobile ("Reply as: [DRAFT]. Approve? [Y/N/Edit]"). Raycast extension for desktop.

---

## 4. Data shapes

### 4.1 UnifiedMessage (normalization output)

```typescript
interface UnifiedMessage {
  id: string;                    // stable hash
  receivedAt: string;            // ISO 8601
  channel: "gmail" | "x_dm" | "linkedin_dm" | "linkedin_inmail" | ...;
  from: {
    name: string;
    email?: string;
    xHandle?: string;
    linkedinUrl?: string;
  };
  subject?: string;              // gmail only
  body: string;                  // normalized plaintext
  rawSource: string;             // original email HTML for debugging
  threadId?: string;             // gmail thread / linkedin conversation id
  attachments: string[];         // file paths on disk
}
```

### 4.2 RelationshipCard (neuromcp persistent memory)

```typescript
interface RelationshipCard {
  id: string;                          // stable identity key
  names: string[];                     // known aliases
  contacts: {
    emails: string[];
    xHandles: string[];
    linkedinUrls: string[];
    phones: string[];
  };
  context: {
    firstMet?: string;                 // where/when we met them
    company?: string;
    role?: string;
    bio?: string;                      // 1-2 sentence summary
    tags: string[];                    // e.g. "investor", "customer", "press"
  };
  history: Interaction[];              // time-ordered interactions
  openAsks: string[];                  // unresolved things they asked for
  lastInteractionAt?: string;
  importance: 1 | 2 | 3 | 4 | 5;       // for auto-send gating
}

interface Interaction {
  at: string;
  channel: string;
  summary: string;
  outcome?: string;
}
```

Stored as markdown with frontmatter in `~/.neuromcp/wiki/contacts/<id>.md`. Auto-committed per session (existing neuromcp behaviour).

### 4.3 ActionPlan

```typescript
interface ActionPlan {
  intent: "investor" | "customer" | "partner" | "press" | "noise";
  urgency: "now" | "today" | "this_week" | "defer";
  confidence: number;                  // 0-1
  riskTier: "low" | "medium" | "high";
  steps: Action[];
  requiresApproval: boolean;
  approvalReason?: string;             // why we're asking
}

type Action =
  | { type: "reply"; channel: string; body: string; threadId?: string }
  | { type: "book_meeting"; attendee: string; duration: number; windowStart: string; windowEnd: string }
  | { type: "log_crm"; entry: CrmEntry }
  | { type: "route_to"; channel: "slack" | "notion" | "telegram"; note: string }
  | { type: "archive"; reason: string };
```

---

## 5. Demo scenarios (3 uncut runs)

Each run: real clock, real APIs, no cherry-picking. Timestamped pipeline stages overlaid on video.

### Demo A: "Warm investor intro"
Input: Email arrives from a known VC firm's partner with subject "Intro to Adel from [mutual connection]".
Expected output: within 60s, RESPONDER:
1. Classifies: investor, high stakes
2. Memory recall: pulls past interactions with mutual + partner's portfolio
3. Drafts reply proposing 3 calendar slots
4. Escalates to approval (because investor = mandatory gate)
5. On approval: sends reply, creates Calendar tentative holds, logs Notion CRM entry

### Demo B: "Cold customer FAQ"
Input: Email from a stranger asking "Does RESPONDER work with LinkedIn InMail?"
Expected output: within 30s, RESPONDER:
1. Classifies: customer FAQ, low stakes, known answer
2. Drafts reply with accurate answer from memory
3. Auto-sends (confidence gate clears)
4. Logs in Notion as "prospect - asked question"
5. Adds to "followup in 7 days if no reply" queue

### Demo C: "LinkedIn DM with failure recovery"
Input: LinkedIn DM notification email from a potential partner.
Expected output:
1. Classifies: partner, medium stakes
2. Drafts reply
3. Attempts API send → Gmail (fails: not a Gmail thread, need LinkedIn web)
4. Falls back to mac-control-mcp: opens LinkedIn web, types reply in the user's authenticated session
5. On first action, AX button not found → triggers OCR fallback → clicks via coordinate + OCR match
6. Confirms send by reading back message from LinkedIn web
7. Logs outcome

Demo C specifically showcases: cross-channel, failure recovery, mac-control-mcp's AX+OCR+fallback stack, all on video uncut.

---

## 6. Metrics (measurable claim)

Instrument every pipeline stage with timing + outcome. Collected in `~/.neuromcp/metrics/responder/<session>.jsonl`.

**Target metrics** (measured on a labeled test set of 50 real messages from Adel's recent history):

| Metric | Target | Stretch |
|--------|--------|---------|
| Median signal → closed-loop time | < 60s | < 30s |
| p95 signal → closed-loop time | < 180s | < 90s |
| Intent routing accuracy | ≥ 90% | ≥ 95% |
| Auto-send false-positive rate | < 1% | 0% |
| Draft quality rating (founder) | ≥ 4/5 | ≥ 4.5/5 |

**Baseline** (manual handling of same 50 messages, stopwatched on a day in April 2026): target ~11 min median, ~20 min p95.

---

## 7. Day-by-day build plan

### Day 0–2 (Apr 19-20, pre-start, IF time allows)
- Scaffold repo: monorepo layout, tsconfig, Bun runtime, CI
- Gmail OAuth flow working end-to-end
- neuromcp relationship card schema + CRUD
- Test fixture: 50 labeled messages from Adel's history

### Day 1 (Apr 21, official start)
- Claude Agent SDK orchestrator
- Classifier agent prompt + eval on fixture (target: >90% on first pass)
- Memory retrieval agent
- End-to-end: email → classify → card lookup → DRAFT printed to console

### Day 2 (Apr 22)
- Drafter agent with founder-voice brand guide
- Action planner (decides: reply / book / log / route)
- Confidence gate logic
- First end-to-end send via Gmail API (low-stakes FAQ scenario)

### Day 3 (Apr 23)
- Telegram approval bot for escalated messages
- Calendar integration (Google Calendar API)
- Notion CRM integration
- mac-control-mcp handoff for LinkedIn/X web channels
- Demo A and Demo B fully working

### Day 4 (Apr 24)
- Demo C (LinkedIn with failure recovery)
- Pre-compute all memory for demo fixtures (no live memory build during demo = reliability)
- Shoot 3 uncut screen recordings
- Metrics dashboard (simple HTML + jsonl read)

### Day 5 (Apr 25-26)
- Final video cut (90 sec): hook → 3 demos → metrics → CTA
- Submission narrative (written)
- Polish README + open-source release prep
- Submit

---

## 8. Failure modes & recovery

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Gmail API rate limit | 429 response | Exponential backoff, queue |
| Classifier confidence < 0.7 | Score check | Force escalation to approval |
| Memory card not found | Lookup miss | Create card from message signals; flag "new contact" |
| Drafter produces hallucination (fake context) | Grounding check (every fact must trace to memory card) | Regenerate with stricter prompt |
| mac-control-mcp action fails | AX error code | Fall back through stack: AX action → coord click → OCR → screenshot to user |
| Calendar conflict on proposed slot | Pre-check before proposing | Propose alternatives |
| Telegram approval timeout (>30 min for urgent) | Wall clock | Hold, surface in daily digest |
| LinkedIn session expired | Login page detected in UI | Surface to founder: "re-auth LinkedIn, then resume" |

---

## 9. Technical stack

| Layer | Tech | Rationale |
|-------|------|-----------|
| Runtime | Bun 1.x on macOS | Fast dev loop, native TS, sqlite built-in |
| Language | TypeScript 5.6 | Ecosystem maturity for Gmail/Google/Notion SDKs |
| AI orchestration | Claude Agent SDK (official) | Agent teams, native Opus 4.7 |
| Desktop control | mac-control-mcp v0.2.3+ (ours) | Signed, notarized, AX-native, Electron-unlocked |
| Memory | neuromcp (ours) | Wiki-based markdown + git auto-commit |
| Gmail | googleapis npm | Canonical |
| Calendar | googleapis npm | Canonical |
| Notion | @notionhq/client | Canonical |
| Telegram bot | telegraf | Approval UX |
| Desktop UI (optional) | Raycast extension | Alternative approval surface |
| Metrics | jsonl + sqlite | Simple, greppable |

**No cloud deployment.** Everything runs on the user's Mac. Data never leaves the device. This is the product's moat and the privacy story.

---

## 10. Risk register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Rejected from hackathon | Medium | High | Parallel: architecture + mac-control-mcp polish are useful anyway |
| Gmail OAuth complexity eats Day 1 | Medium | Medium | Dry-run OAuth flow pre-start |
| Classifier accuracy below target | Medium | High | Rigorous eval on Day 1, iterate prompt aggressively |
| Demo C fails on stage | Medium | Critical | Pre-shoot all 3 demos; never live-demo a multi-step UI-automation run |
| Confidence gate too loose → bad auto-reply | Low | Catastrophic | Never auto-send to investor/press, hardcoded |
| Memory hallucination (fake "we met at X") | Medium | High | Grounding: every fact in reply must trace to a memory card entry |
| 5 days not enough | Medium | High | Ruthless scope: 2 channels + email, 3 demos only |
| Judges find similar tool exists | Low | High | Already researched: nothing combines channels + memory + local-only |

---

## 11. Submission narrative (one-liner + 60s pitch)

**One-liner**: "RESPONDER is an inbound operating system for solo founders. Every message becomes a closed-loop thread in under 60 seconds — on-device, privacy-first, built on Opus 4.7 agent teams."

**60s pitch**: see application.

**Video CTA**: `github.com/AdelElo13/responder` + `respond.er` (or similar) landing page for waitlist.

---

## 12. Open questions (for Codex / Gemini review)

1. Is Bun the right runtime, or does Node 24 offer less risk (fewer edge-case bugs)?
2. Should the Telegram approval bot be optional or core? It doubles demo wow but adds build time.
3. Do we need a dedicated "explain why this was flagged" output for every escalation, or is a simple confidence score enough?
4. Is 50 labeled messages enough for classifier eval, or should we aim for 200?
5. Should we open-source before or after judging?
6. Is "RESPONDER" the right name, or does it collide with existing products we missed?

---

*End of design doc. Next step: adversarial review by Codex + Gemini.*
