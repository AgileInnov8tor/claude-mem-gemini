# Code Review: Round 3 — Platform Labeling Feature

**Date:** 2026-03-05
**Focus:** Remaining issues not caught in rounds 1–2

---

## Critical

### Issue 1 — `SessionStore.getUserPromptsByIds` missing `s.platform` (confidence: 92)

**File:** `src/services/sqlite/SessionStore.ts`, lines 2330–2343

Two parallel implementations of `getUserPromptsByIds` exist. The new standalone one in `prompts/get.ts` selects `s.platform`. The old one inside `SessionStore` does not — it selects `up.*, s.project, s.memory_session_id`. Callers (`SearchManager`, `ChromaSearchStrategy`) call through `SessionStore`, not the new module. Platform is silently absent from all search results.

**Fix:** Add `s.platform` to the SELECT in `SessionStore.getUserPromptsByIds`.

---

### Issue 2 — `UserPromptRecord` type missing `platform?` (confidence: 88)

**File:** `src/types/database.ts`, lines 100–108

`getUserPromptsByIds` in `prompts/get.ts` returns `UserPromptRecord[]` and selects `s.platform`, but `UserPromptRecord` has no `platform?` field. The value exists at runtime but is invisible to TypeScript.

**Fix:** Add `platform?: string` to `UserPromptRecord`.

---

## Important

### Issue 3 — Old broken `SessionStore.getSessionSummaryById` is dead code (confidence: 90)

**File:** `src/services/sqlite/SessionStore.ts`, lines 2624–2657

The pre-fix broken method still exists. It queries `request_summary`, `learned_summary`, `created_at`, `created_at_epoch` directly from `sdk_sessions` — none of these exist. SQLite doesn't crash; it silently returns `null` for unknown columns. Zero call sites exist in TypeScript source or either `.cjs` bundle.

**Fix:** Delete the method from `SessionStore.ts`.

---

### Issue 4 — Bundles not rebuilt (confidence: 95)

**Files:** `plugin/scripts/worker-service.cjs`, `context-generator.cjs`

Both `.cjs` bundles still contain pre-fix versions of `getPromptById`, `getPromptsByIds`, `getUserPromptsByIds` (all missing `s.platform`). Source changes in `prompts/get.ts` only take effect after rebuild.

**Fix:** Run `npm run build-and-sync` after all source fixes are applied.

---

## Confirmed Clean

- `sessions/get.ts:getSessionSummaryById` JOIN — correct (`LEFT JOIN session_summaries ss ON s.memory_session_id = ss.memory_session_id`, aliased columns)
- All 5 `prompts/get.ts` functions — now include `s.platform`, types correct
- `createSDKSession` arg order in `handleObservationsByClaudeId` — correct
- SSE `new_prompt` platform flow — complete end-to-end (broadcaster → SSEBroadcaster → frontend `UserPrompt.platform`)
- Frontend `Prompt`/`StreamEvent` types — correct
- Gemini transcript parser — sound
- Gemini CLI session-init skip path — correct
- No N+1 queries introduced

---

## Priority Order

1. `SessionStore.getUserPromptsByIds` — add `s.platform` (Issue 1)
2. `UserPromptRecord` — add `platform?` (Issue 2)
3. Delete dead `SessionStore.getSessionSummaryById` (Issue 3)
4. `npm run build-and-sync` (Issue 4)
