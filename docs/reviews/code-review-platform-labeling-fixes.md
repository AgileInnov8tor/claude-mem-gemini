# Code Review: Platform Labeling Fixes

**Date:** 2026-03-05
**Scope:** 4 code review fixes for platform labeling implementation
**Files reviewed:**
- `src/services/sqlite/SessionStore.ts`
- `src/services/sqlite/sessions/create.ts`
- `src/services/worker-types.ts`
- `src/cli/adapters/gemini-cli.ts`

---

## Summary

The fixes correctly address the 3 IMPORTANT issues and 1 SUGGESTION from the prior review. One new gap was identified during this review.

---

## Findings

### ⚠️ WARNING — `UserPrompt.platform` declared but never populated by queries

**File:** `src/services/worker-types.ts:156` + `src/services/sqlite/prompts/get.ts`

The `UserPrompt` interface now includes `platform?: string`, but **none of the queries in `prompts/get.ts` SELECT `s.platform`** from the JOIN with `sdk_sessions`. Affected queries:

- `getAllRecentUserPrompts` — explicit column list, no `s.platform`
- `getPromptById` — explicit column list, no `s.platform`
- `getPromptsByIds` — explicit column list, no `s.platform`
- `getUserPromptsByIds` — uses `up.*` which covers `user_prompts` columns only (platform lives in `sdk_sessions`)
- `getLatestUserPrompt` — uses `up.*` + explicit `s.project, s.memory_session_id`, no `s.platform`

**Result:** `UserPrompt.platform` will always be `undefined` at runtime, even though the type allows it. Any consumer reading `prompt.platform` to route or label data will silently get `undefined`.

**Fix:** Add `s.platform` to SELECT in the queries that return `UserPrompt`-shaped data. For `getAllRecentUserPrompts` this is the primary consumer:

```sql
SELECT
  up.id,
  up.content_session_id,
  s.project,
  s.platform,       -- add this
  up.prompt_number,
  ...
```

---

## Approved Fixes

### ✅ Fix 1 — `getSessionById` return type + SELECT

`platform?: string` added to return type and `platform` added to `SELECT`. Correct.

### ✅ Fix 1b — `getSdkSessionsBySessionIds` return type + SELECT

`platform?: string` added to return type and `platform` added to `SELECT`. Correct.

### ✅ Fix 2 — Platform backfill on existing-session path

Backfill block added after `customTitle` backfill with correct idempotency guard:
```sql
WHERE platform IS NULL OR platform = 'claude-code'
```
The `platform !== 'claude-code'` guard in TypeScript prevents no-op updates. Pattern is consistent with existing `customTitle` backfill. Correct.

### ✅ Fix 3 — `UserPrompt.platform` field declared

Type declaration is correct. See WARNING above for the query gap.

### ✅ Fix 4 — Gemini adapter explicit `platform: 'gemini-cli'`

`NormalizedHookInput` already had `platform?: string` so this is fully type-safe and correct.

---

## Checklist

| Category | Status |
|----------|--------|
| Security — no hardcoded secrets | ✅ |
| Security — no injection risk | ✅ (parameterized queries throughout) |
| Types complete | ⚠️ (interface declared, queries missing) |
| No N+1 queries | ✅ |
| Build passes | ✅ |
