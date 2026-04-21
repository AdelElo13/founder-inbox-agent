# Project: Founder Inbox

## Context
- **What this builds**: evidence-grounded inbound operator for solo founders. Gmail poll → classify → memory lookup → research → draft with cited claims → Verifier veto → Telegram approval card
- **Stack**: Node 22, TypeScript 6 strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), @anthropic-ai/sdk 0.90, Opus 4.7 (`claude-opus-4-7`), googleapis 171, telegraf 4, Vitest 4
- **Platform**: macOS (author's daily driver). Should run on any Node 22+ host.
- **Phase**: hackathon submission (Cerebral Valley × Anthropic "Built with Opus 4.7", Apr 21–26, 2026)
- **Public repo**: `github.com/AdelElo13/founder-inbox-agent` (currently private; flip at submission)

## Owner-only files (DO NOT MODIFY without explicit ask)

Some files encode the owner's personal voice, priorities, or identity. Claude must
NOT make any content changes to the *values* in these files unless the owner
explicitly asks. Refactoring types or helpers is fine — values are not.

| File | Why |
|------|-----|
| `src/identity/founder.ts` (the `DEFAULT_IDENTITY` constant + `FounderIdentity` values) | Encodes the founder's positioning, quarter priorities, voice/register/signoff, and hard rules. Drive-by polish, better wording, or "improving tone" without an explicit request is forbidden. |

Use the rule: **if the owner didn't ask for a change in those files, the answer is no**.

## External tools & model preferences

- **Codex CLI**: ALWAYS invoke with `--model gpt-5.3-codex` explicitly. Do not use older models unless a newer version is confirmed available and the owner agrees.
- **Gemini CLI**: used for adversarial second opinions. Default model is fine.
- **Anthropic SDK**: default model is `claude-opus-4-7` (set via `ANTHROPIC_MODEL` env). Don't downgrade without reason.

## Working style

- **Always plan before touching code.** State the change, risks, and verification plan first.
- **No commits without explicit ask.** The owner commits. Claude may stage (`git add`) only if asked.
- **Full files over snippets** when presenting changes.
- **Verify own work**: `pnpm typecheck && pnpm test` must pass before calling any task done.

## Verification

For any meaningful change:
1. `pnpm typecheck` (strict TS)
2. `pnpm test` (must stay at 24+ passing)
3. If touching the pipeline, runtime smoke: `pnpm setup` (6/6 green) → `pnpm daemon` (one cycle + SIGINT)

## What I do NOT want

- Temporary fixes that mask larger problems (e.g. swallowing errors to avoid a crash).
- Changes outside the task scope.
- New dependencies without prior discussion.
- Half-finished work handed back as complete.
- **Owner-only file edits** (see table above) without explicit owner request.

## Known pitfalls

- `metrics/` in `.gitignore` used to match `src/metrics/` — fixed on 2026-04-21 by anchoring to `/metrics/`. Check `.gitignore` if `src/...` files mysteriously disappear from `git status`.
- Opus 4.7 deprecated the `temperature` parameter; passing it silently fails. Don't add it back.
- Gmail labels `INBOX_AGENT_*` are the idempotency boundary. `src/gmail/lifecycle.ts` owns transitions — changes must clear non-terminal markers (ESCALATED) when moving to terminal states.
- Telegram bot token `TELEGRAM_BOT_TOKEN` must match `@founder_inbox_agent_bot` (dedicated). An older Claude Code Telegram bridge used the same token and caused 409 Conflict until the bots were separated.
