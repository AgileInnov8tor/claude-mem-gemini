# Code Review: Full Diff 2026-03-05 — Platform Labeling & Gemini CLI Integration

**Scope:** All uncommitted changes in `/Users/rk/01_projects/claude-mem-gemini` (git diff HEAD)
**Date:** 2026-03-05

---

## Summary

The diff implements multi-platform attribution (Gemini CLI support) across the full stack: DB migration, session creation, backfill logic, adapter, context handler, frontend display, and transcript parsing. The architecture is sound. Three confirmed issues and two gaps follow.

---

## Critical — Runtime Crash

### Issue 3 — `getSessionSummaryById` references non-existent columns (confidence: 95)

**File:** `src/services/sqlite/sessions/get.ts`, lines 88–108

The function queries `sdk_sessions` for columns `request_summary`, `learned_summary`, `content_session_id`, `created_at`, and `created_at_epoch` — none of which exist in that table. The summary fields live in `session_summaries`, and the timestamp columns are `started_at`/`started_at_epoch`. This will throw a SQLite "no such column" error at runtime for any caller.

---

## Important — Logic Bugs

### Issue 2 — `platform` missing from SSE `new_prompt` broadcast (confidence: 92)

**File:** `src/services/worker/http/routes/SessionRoutes.ts`, lines 346–354

The `broadcastNewPrompt()` call in `handleSessionInit` constructs the prompt object without a `platform` field. Prompts arriving via SSE will always render without a platform badge in `PromptCard` until the user refreshes and loads via the paginated REST endpoint (`PaginationHelper.getPrompts()`, which does correctly SELECT `s.platform`).

### Issue 1 — Platform backfill race: observation/summarize paths pass no platform (confidence: 90)

**File:** `src/services/sqlite/sessions/create.ts`, lines 59–67 + `src/services/worker/http/routes/SessionRoutes.ts`, lines 534, 606, 657

The platform backfill only fires when the caller explicitly passes a non-default platform. The three `createSDKSession` calls for the observation, summarize, and complete paths pass no platform argument. If a post-tool-use hook fires before the init hook for a Gemini session (race condition), the session row will permanently retain `platform = 'claude-code'`.

### Issue 4 — `prompts/get.ts` queries don't SELECT `s.platform` (confidence: 90)

**File:** `src/services/sqlite/prompts/get.ts`

`getLatestUserPrompt()` and `getUserPromptsByIds()` JOIN `sdk_sessions` but don't SELECT `s.platform`. Chroma search hydration and the SSE broadcast path receive no `platform` field — `PromptCard` always suppresses the platform badge for those code paths.

---

## Low Risk

### Issue 5 — Gemini format detection ambiguous with single-line JSONL (confidence: 82)

**File:** `src/shared/transcript-parser.ts`, lines 27–34

The format detection relies on `JSON.parse()` succeeding and the result having a `.messages` array. A single-line JSONL file whose content object contains a top-level `messages` key would be silently misidentified as Gemini format. Low real-world risk given the schema differences between formats.

---

## Confirmed Non-Issues

- `SessionStore.getSessionById` — correctly SELECTs `platform`. ✅
- `getSdkSessionsBySessionIds` — correctly SELECTs `platform`. ✅
- Migration 24 (`addSessionPlatformColumn`) — idempotent, correct DEFAULT `'claude-code'`. ✅
- `geminiCliAdapter.normalizeInput` — correctly sets `platform: 'gemini-cli'`. ✅
- `getPlatformAdapter` — correctly routes `'gemini-cli'` to `geminiCliAdapter`. ✅
- `session-init.ts` — correctly skips SDK agent init for `gemini-cli`. ✅
- `PromptCard.tsx` `PLATFORM_LABELS` — correct mapping, suppresses `Claude` badge by design. ✅
- Backfill condition `platform !== "claude-code"` — correct, avoids no-op writes. ✅

---

## Verdict

**Issue 3 must be fixed before shipping** — runtime crash in `getSessionSummaryById`.
**Issues 1, 2, 4** are platform attribution gaps — low urgency, Gemini badges will be missing/stale in specific paths.
**Issue 5** is low risk, worth a test case.
