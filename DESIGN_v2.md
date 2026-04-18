# LOBBY — Design v2

> **Status**: Scope-collapsed v2 after Codex (6.2/10) + Gemini (4/10 feasibility) adversarial review.
> **Changed**: rename (RESPONDER → LOBBY), scope cut to single-channel, verifier agent added, evidence-grounded trust UX, Node not Bun, credible metrics, Day 3 offloaded.
> **Target**: Cerebral Valley × Anthropic "Built with Opus 4.7" (Apr 21-26, 2026, $100k prize).

---

## 0. What changed from v1 (and why)

| v1 | v2 | Reason |
|----|----|--------|
| RESPONDER | **LOBBY** | v1 collides with Responder AI (PH), Responder Corp, Apple "Responder" app |
| Gmail + X + LinkedIn + Notion + Calendar + Telegram + Raycast | **Gmail + Telegram only** | Codex: "collapse to one reliable loop"; Gemini: "40h of OAuth eats the week" |
| Bun runtime | **Node 24 LTS** | Codex: Bun compat still shaky; hackathon is not the week to discover edge cases |
| 3 demos (investor / FAQ / LinkedIn-recovery) | **3 demos, all Gmail-based, one with flex** | Codex: "Demo C failure-chain fetish"; flex = live eval, not staged UI |
| 50-message labeled set | **100** | Codex: 50 statistically too weak for FP claims |
| "Data never leaves device" | **"Relationship memory + raw messages stay local; Opus 4.7 inference via Anthropic API"** | Codex: v1 claim conflicts with cloud model calls |
| No Verifier agent | **Verifier agent mandatory** | Both: hallucinated history is the assassin for trust; every draft must cite memory lines |
| SLA: 60s median, 180s p95 | **SLA: 30s median for drafting + approval; closed-loop time depends on user approval speed** | Codex: SLA across full approval chain not credible |
| "Launch Day Control Room" vibe | **"Inbound Triage + Evidence"** — no auto-send to high-stakes | Gemini: auto-send FAQ dangerous; Codex: blast radius too high |
| Identity resolution handwaved | **Explicit identity-resolution layer** with provenance | Codex + Gemini both flagged |

---

## 1. Problem (unchanged, sharper)

High-distribution founders drown in **inbound signals**, not leads. Every week: 50+ X DMs, 20-40 LinkedIn DMs/InMail, 50-100 Gmail threads, 20+ reply threads on posts. Context drops. Fast replies cool. The ones that matter (investors, customers, press) hide in noise.

**LOBBY** is the inbound front-desk: every message gets classified, grounded against relationship memory, drafted with evidence, and surfaced for founder approval — in under 30 seconds of agent work.

**Positioning line**: *"What Claude Code can't do yet — persistent cross-channel relationship memory and evidence-grounded founder-voice replies."*

---

## 2. Scope (v2 collapsed)

### In scope for hackathon week
- **Gmail** ingestion + outbound (OAuth, Gmail API)
- **Relationship memory** in neuromcp markdown wiki with identity resolution layer
- **Classifier / Memory / Drafter / Verifier / Action-planner** agent team (Opus 4.7)
- **Telegram bot** for single-surface approval with evidence panel
- **Eval harness** on 100-message labeled set

### Explicit non-scope (v1 deletions)
- ❌ X DM ingestion (demo mentions as "integrates via email notifications" only)
- ❌ LinkedIn DM execution via mac-control-mcp (mentioned as "planned" — not shipped)
- ❌ Notion CRM (demo mentions "CRM-ready via webhooks" only)
- ❌ Google Calendar (demo mentions "proposes slots from clipboard-pasted avail")
- ❌ Raycast extension (Telegram only)
- ❌ Auto-send to any class except *already-whitelisted FAQ templates*

**mac-control-mcp still appears in demo** as the "cross-channel reach" flex — but one deterministic screenshot, not a live multi-step UI automation chain.

---

## 3. Architecture (simplified)

```
Gmail API (poll every 30s)
    │
    ▼
Normalize → UnifiedMessage
    │
    ▼
┌─────────────────────────────────────────────┐
│  Agent Team (Claude Agent SDK, Opus 4.7)    │
│                                             │
│   [Classifier]  → intent + risk + urgency   │
│                                             │
│   [Memory]      → RelationshipCard lookup   │
│                   + identity resolution     │
│                                             │
│   [Drafter]     → reply body + evidence ids │
│                                             │
│   [Verifier]    → every claim cites memory  │
│                   line; rejects fabrication │
│                                             │
│   [Planner]     → ActionPlan                │
└─────────────────────────────────────────────┘
    │
    ▼
Confidence gate
    │
    ├─ whitelisted FAQ + confidence ≥0.95 → Gmail send
    └─ anything else → Telegram approval card
                              │
                              ├─ ✅ approve  → send
                              ├─ ✏️ edit    → user-edited send
                              └─ ❌ reject  → archive w/ reason
```

**Key invariant**: the Verifier has veto. If any factual claim in the draft can't be traced to a RelationshipCard line ID or the inbound message itself, the draft is rejected and regenerated with stricter constraints. Three regen failures → escalate with "cannot ground this claim" message.

---

## 4. Data shapes (v2)

### UnifiedMessage
```typescript
interface UnifiedMessage {
  id: string;                    // gmail message id (idempotency)
  receivedAt: string;            // ISO 8601
  channel: "gmail";              // v2 is gmail-only
  from: { name: string; email: string; };
  subject: string;
  body: string;                  // plaintext
  threadId: string;
  isLinkedInNotification: boolean;  // parsed flag — future use
  isXNotification: boolean;         // future use
}
```

### RelationshipCard (graph-of-intent, not list)
```typescript
interface RelationshipCard {
  id: string;                    // stable hash
  identities: Identity[];        // one person, many channels
  contexts: Context[];           // VC + friend + customer = 3 contexts
  interactions: Interaction[];   // addressable by id for verifier
  openAsks: OpenAsk[];
  importance: 1 | 2 | 3 | 4 | 5;
  lastInteractionAt?: string;
}

interface Identity {
  type: "email" | "x_handle" | "linkedin_url" | "phone" | "name";
  value: string;
  provenance: string;            // how we know — msg id or user input
  confidence: number;
}

interface Context {
  role: "investor" | "customer" | "partner" | "press" | "friend" | "ex-colleague";
  company?: string;
  established: string;           // when this context began
  evidence: string[];            // interaction ids supporting this
}

interface Interaction {
  id: string;                    // citable by Verifier
  at: string;
  channel: string;
  summary: string;               // 1-2 sentences
  rawRef?: string;               // pointer to raw message for audit
  outcome?: string;
}

interface OpenAsk {
  id: string;
  askedAt: string;
  request: string;               // "intro to Sarah at Ycomb"
  status: "open" | "in-progress" | "closed";
  resolution?: string;
}
```

### DraftWithEvidence
```typescript
interface DraftWithEvidence {
  body: string;
  claims: EvidenceClaim[];       // parallel to body
  confidence: number;
  verifierPass: boolean;
}

interface EvidenceClaim {
  textRange: [number, number];   // char offsets in body
  cites: Citation[];             // must be non-empty
}

interface Citation {
  source: "interaction" | "inbound_message" | "context" | "ask";
  refId: string;
  excerpt: string;               // the specific line justifying the claim
}
```

**Why this shape**: every factual claim in the draft is pinned to a specific memory/message line. Hallucination becomes architecturally harder than truth. This is the trust UX.

---

## 5. Demos (v2 rebuilt)

### Demo 1: Warm investor reply with cited memory
Input: Real-looking email from a partner at a known fund, referencing a mutual connection.

Pipeline on camera:
1. Gmail poll picks up message (t=0s)
2. Classifier: `investor, high-stakes, medium urgency` (t=3s)
3. Memory lookup: found card — we met at "Paris AI Summit March 2026", they invested in one of our peer companies (t=5s)
4. Drafter proposes reply: mentions Paris Summit + portfolio overlap
5. **Verifier check** shown on screen: each claim highlighted + source line displayed (t=8s)
6. Telegram approval card: "Draft ready. Evidence: [2 citations]. Approve? / Edit? / Reject?"
7. Adel taps approve → Gmail sends (t=~30-45s depending on human approval speed)

**Judge takeaway**: evidence grounding. Not hallucinated. "Paris summit" came from an actual memory card line they can read on screen.

### Demo 2: Stranger email with "proactive research" (Gemini's suggestion)
Input: Cold email from someone the system has never seen.

Pipeline on camera:
1. Gmail poll picks up (t=0s)
2. Classifier: `unknown, customer-shape, medium risk` (t=3s)
3. Memory lookup: new identity → create card stub (t=5s)
4. **Drafter calls a research tool**: pulls sender's public signals (website from email signature, cached X bio if available, LinkedIn URL from email footer)
5. Draft with evidence: "Their website says X, last public post mentioned Y" — clearly cited
6. Verifier: all claims cite research artifacts (not memory, because memory was empty)
7. Telegram approval with "NEW CONTACT — drafted from public signals only"

**Judge takeaway**: honest about what it knows vs. doesn't. No fabrication. The research work is the wow.

### Demo 3 (flex): Cross-channel tease
Input: A LinkedIn DM notification email arrives in Gmail.

Pipeline on camera:
1. Gmail detects LinkedIn notification format
2. Classifier flags: "LinkedIn message — read-only ingest for now"
3. Drafts a reply with evidence
4. **Telegram approval card has a special button**: "Open in LinkedIn web"
5. Tapping it uses `mac-control-mcp` to open LinkedIn web + navigate to the thread
6. Human completes send in browser (not automated — honest framing)

**Judge takeaway**: "handoff is solved, automation for LinkedIn send is a future milestone." No flaky UI automation on stage. The mac-control-mcp use is real but bounded — open + navigate only.

### Shot plan
- All 3 demos pre-shot on real accounts (Adel's own Gmail, test contacts)
- Single 90-second cut: hook → Demo 1 (30s) → Demo 2 (25s) → Demo 3 flex (15s) → metrics (10s) → CTA (10s)
- B-roll of Telegram approval cards + evidence panels

---

## 6. Metrics (credible v2)

**What we measure**:

| Metric | Target | Measurement |
|--------|--------|-------------|
| Median agent-work time (ingest → draft ready) | < 30s | Wall clock, instrumented |
| p95 agent-work time | < 75s | Same |
| Closed-loop time (ingest → sent reply) | Reported as distribution, not single number — depends on human approval | Histogram |
| Intent classification accuracy | ≥ 90% on 100-msg labeled set | Confusion matrix |
| Verifier rejection rate | Reported — typically 15-25% | Counter |
| Fabrication rate (claims without cites reaching approval) | 0% (hard invariant) | Reviewed by author on n=30 samples |
| Founder approval rate (drafts accepted unedited) | ≥ 60% | Counter |

**What we do NOT claim**:
- Universal 60s end-to-end closed-loop (not credible)
- Statistical FP rate < 1% on any action (n=100 is too small)
- "Replaces your inbox" (it triages, it doesn't replace)

**Baseline**: manual handling of same 100 messages by Adel, stopwatched in advance. Expected median ~7-12 min per message, dominated by context recall + research.

---

## 7. Day-by-day plan (v2 — cuts)

### Day 0 (Apr 19-20, pre-start, IF we're accepted + have time)
- Node 24 LTS scaffold
- Gmail OAuth end-to-end
- Claude Agent SDK stub with placeholder agents
- Label 100 messages from Adel's recent Gmail as ground truth
- neuromcp card schema + CRUD

### Day 1 (Apr 21) — CORE LOOP ONLY
- End of day: Gmail poll → Classifier → Memory → Drafter → Verifier → console log
- No approval surface yet
- Eval harness runs on 100-msg set, initial classifier numbers reported
- **Kill switch**: if classifier is <75% by EOD Day 1, revisit approach

### Day 2 (Apr 22) — APPROVAL + SEND
- Telegram bot with approval cards (3 buttons: approve / edit / reject)
- Gmail send on approval
- Evidence panel in approval card (cites shown inline)
- **Kill switch**: if approval UX is broken by EOD Day 2, drop Telegram and use a simple CLI approval

### Day 3 (Apr 23) — HARDENING + RESEARCH TOOL
- Prompt injection defenses
- Duplicate detection (idempotency via Gmail msg id + replied-marker label)
- Research tool for Demo 2 (simple URL fetch + extract from email signature)
- Demo 1 dry-run end-to-end

### Day 4 (Apr 24) — DEMO SHOOTING
- Pre-shoot Demo 1 (multiple takes)
- Pre-shoot Demo 2
- Pre-shoot Demo 3 flex
- Metrics dashboard (simple HTML reading jsonl)

### Day 5 (Apr 25-26) — VIDEO + SUBMISSION
- Final 90s cut
- README polish
- Submission narrative
- Submit

**Buffer**: Day 3 has slack — if Day 1 or 2 slipped, Day 3 absorbs. Day 4+5 are fixed (video + submission).

---

## 8. Failure modes + recovery (v2)

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Gmail rate limit | 429 | Exponential backoff; never lose message (queue) |
| Duplicate processing | Gmail label `LOBBY_PROCESSED` set after action | Skip if label present |
| Classifier low confidence | Score < 0.75 | Default to "needs approval" regardless of intent |
| Memory miss | Lookup returns nothing | Create new card; flag "NEW CONTACT"; drafter uses inbound-only citations |
| Verifier rejects 3× | Counter | Escalate with "cannot ground — see inbound body"; no send |
| Prompt injection | Regex + LLM-based detector on inbound | Quarantine; notify founder |
| Model outage | API 5xx | Queue; retry with backoff; surface stale queue after 5min |
| Approval timeout | 30 min | No action; daily digest surfaces pending items |
| Gmail label race (2 agents process same msg) | Lock via label | Only one agent proceeds |
| Bad identity merge | User reports via Telegram "not me" | Undo merge, re-split card |

---

## 9. Tech stack (v2)

| Layer | Tech |
|-------|------|
| Runtime | Node 24 LTS on macOS |
| Language | TypeScript 5.6 |
| Package manager | pnpm |
| AI | Claude Agent SDK (Opus 4.7 via Anthropic API) |
| Desktop | mac-control-mcp v0.2.3+ (demo flex only, not core) |
| Memory | neuromcp (markdown + git) |
| Gmail | googleapis |
| Telegram | telegraf |
| Eval | Vitest + tiny custom harness |
| Metrics | jsonl → simple HTML dashboard |

**Nothing else. No Redis, no Postgres, no Docker, no cloud.** Everything is Node + files.

---

## 10. Risk register (v2)

| Risk | Prob | Impact | Mitigation |
|------|------|--------|------------|
| Rejected from hackathon | M | H | Work is useful regardless (mac-control-mcp v0.3+, neuromcp memory schema) |
| Classifier <90% on real data | M | H | 100-msg eval from Day 1; 2 prompt iterations budgeted |
| Verifier rejects too often (>40%) | M | M | Tune citation strictness; Day 3 refinement |
| Demo shot fails | L | H | Pre-shoot; have 3 takes per demo; static fallback narration |
| Telegram flaky during demo | L | M | Use native Telegram app recording; switch to CLI approval if needed |
| Prompt injection on stage | L | H | Defense v1 live; quarantine + notify |
| Identity confusion (merged wrong) | M | M | User can un-merge; "NEW CONTACT" flag for ambiguous |
| Name collision (LOBBY) | L | L | Verify before submission; fallback names ready |
| Anthropic ships a similar feature before Apr 26 | L | H | Framing: our moat is founder-grade memory + verifier trust UX |
| Gmail OAuth complexity eats Day 0 | M | M | Dry-run today (Apr 18) |

---

## 11. Pitch (v2 anchor lines)

**One-liner**: *"LOBBY is the inbound front-desk for solo founders. Every message gets classified, grounded against your relationship memory, and drafted with evidence citations — so you never auto-reply to an investor with a hallucinated detail."*

**Why-Opus-4.7**: *"Agent teams (parallel classifier + memory + drafter + verifier) plus 1M-token context let us reason across your entire relationship history for every reply. Verifier wouldn't work below Opus-tier reasoning — below that, you get graded self-confidence not grounded evidence."*

**Judge-addressed framing**: *"This is what Claude Code can't do yet — persistent cross-channel relationship memory and citation-grounded founder-voice replies. You're building the platform; we're building the founder-ops layer on top of it."*

---

## 12. Answered open questions (Codex's concrete answers)

| Question | Answer |
|----------|--------|
| Runtime? | Node 24 LTS |
| Telegram bot core or optional? | Core — it's the single approval surface |
| Explain-why on escalation? | Required. Evidence panel on every card. |
| Eval set size? | 100 labeled messages |
| Open-source timing? | After judging |
| Name? | LOBBY (verify availability pre-submission) |

---

## 13. Remaining decisions

1. **LOBBY name availability** — check on Product Hunt, domain availability (lobby.ai? lobbyhq? getlobby?). 5-min task.
2. **Research tool for Demo 2** — build custom or use an existing skill (`market-research`, `lead-intelligence`)? Probably reuse.
3. **Gmail label strategy** — `LOBBY_QUEUED`, `LOBBY_PROCESSED`, `LOBBY_SENT`, `LOBBY_REJECTED`. Confirm.
4. **Eval set labels** — schema: `{msgId, intent, urgency, expectedCitations}`. Confirm.

---

*End v2. Next step: second review round. Ship to Codex + Gemini for AGREE/DISAGREE.*
