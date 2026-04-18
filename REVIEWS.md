# Design Review Log

## Gemini review (Apr 18, 21:02)

### Scores
- Technical soundness: 7/10
- 5-day feasibility: **4/10** ← KILLER
- Judge appeal: 9/10
- Defensibility vs Anthropic: 6/10
- Day 1 actionability: 8/10

### Key hits (must address)

1. **Gmail funnel for X/LinkedIn is brittle**
   - Email notifications truncate text, mangle links, lose thread metadata
   - X/LinkedIn notification latency 2-5 min → breaks 60s SLA claim
   - Recommended: use mac-control-mcp to READ the native UI once notified, not parse the email body

2. **Too many integrations for 5 days**
   - Gmail + X + LinkedIn + Notion + Calendar + Telegram + Raycast = ~40h of OAuth/API plumbing
   - Cut: Notion, Calendar (optional), Raycast (pick ONE approval surface), Reddit, PH
   - Keep: Gmail, X via email-trigger, LinkedIn via email-trigger, 1 approval surface (Telegram)

3. **RelationshipCard schema too flat**
   - Need "graph of intent", not list of interactions
   - "VC who's also a friend who's also a customer" breaks the schema
   - Each relationship needs multiple overlapping contexts

4. **Demo A + B are table stakes; Demo C is the flex**
   - A (investor intro): boring, every agent does this
   - B (auto-send FAQ): DANGEROUS — hallucination kills trust, judges will flag
   - C (LinkedIn failure recovery): 80% focus here — this is the "Built with Opus 4.7" flex

5. **Pivot Demo B**: from "auto-send FAQ" to "auto-triage + proactive research"
   - Show agent doing the RESEARCH work, not the SEND work
   - "Found their recent LinkedIn post, drafted reply referencing it" is wow; "sent a canned response" is meh

6. **No Fact-Checker agent**
   - Opus 4.7 will hallucinate relationship history in long threads
   - Add Verifier agent: every claim in draft must cite a specific line in the memory card
   - If no citation, claim is rejected, draft regenerated

7. **Day 3 is the death trap**
   - Telegram + Calendar + Notion + mac-control-mcp + 2 demos in one day
   - If LinkedIn changes one CSS class, whole schedule collapses

8. **Identity resolution handwaved**
   - How does email@x.com ↔ @xhandle ↔ linkedin.com/in/y map?
   - Without this, "Founder Voice" will be wrong (too formal with close friends, etc.)

9. **Video production is a nightmare**
   - 3 uncut runs of UI automation = 10+ hours to get "perfect takes"
   - Build in Day 3 buffer, not Day 4 as a single block

10. **Framing hook**
    - Explicitly position: "Building what Claude Code can't do yet — persistent cross-channel relationship memory"
    - Address the judges' own product directly

### Missing risks Gemini flagged
- Silent failure of local Bun process (no push, Gmail polls — if process hangs, miss SLA invisibly)
- X/LinkedIn notification latency
- LinkedIn account suspension if we polled/scraped aggressively (separate from the email-trigger approach — still a risk for demo reply execution via UI)

### Novelty check (Gemini)
- Shortwave / Superhuman: no cross-channel, no UI automation → we win
- Lindy / Maven: cloud-based, heavy setup → we win on local/speed
- HeyHarvey / Laine: legal/vertical specific → we win on founder-grade
- **Real threat**: Claude Code itself adding "Desktop Control" MCP → our project becomes a feature of theirs

### Top 5 changes (Gemini, ranked by win-probability impact)
1. Kill Gmail funnel for LinkedIn/X — scrape UI directly OR use email-as-trigger + UI-as-reader
2. Consolidate approval UX: Telegram OR Raycast, not both
3. Add Verifier/Fact-Checker agent with citation requirement
4. Pivot Demo B to "auto-triage + proactive research"
5. Frame pitch as "what Claude Code can't do yet"

---

## Codex review (pending)

(awaiting)

---

## Synthesis (after both reviews)

(to be written)
