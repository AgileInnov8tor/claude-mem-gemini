# Code Review: Platform Labeling Implementation

**Feature:** End-to-end platform labeling for SDK sessions
**Base SHA:** 7342f92d
**Reviewer:** Senior Code Reviewer (Claude Sonnet 4.6)
**Date:** 2026-03-05

---

## Summary

The implementation threads a `platform` string (e.g. `'gemini-cli'`, `'claude-code'`, `'cursor'`) from the hook layer through the worker API, database, and viewer UI. The overall design is correct and follows existing project patterns well. Four issues are identified below, ranging from important to suggestion level.

---

## What Was Done Well

1. **Migration idempotency is robust.** The `addSessionPlatformColumn()` migration in both `MigrationRunner` and `SessionStore` checks `schema_versions` first, then verifies the column actually exists before issuing `ALTER TABLE`. The `DEFAULT 'claude-code'` is an O(1) schema-only operation in SQLite — correct choice that avoids a full-table rewrite.

2. **Input sanitization in `SessionRoutes`.** The `rawPlatform` processing at line 702 chains `.toString().trim().toLowerCase().slice(0, 64)` before use. This prevents case mismatches, whitespace issues, and oversized values from reaching the database.

3. **Correct `??` vs `||` choice for the null-coalescing fallback.** Using `??` on `req.body.platform` correctly treats `undefined`/`null` as missing while allowing falsy non-null values. The subsequent `|| 'claude-code'` after `.slice()` catches the edge case where trim produces an empty string.

4. **UI badge suppression for the default platform.** Hiding the badge when `platformLabel === "Claude"` keeps the UI clean for the common case. Falling back to `prompt.platform` as the raw label for unknown platforms is a sensible forward-compatibility choice.

5. **`gemini-cli` adapter correctly omits `platform` from `normalizeInput`.** Because the session-init handler injects `platform: input.platform` into the POST body, and `NormalizedHookInput.platform` is populated by the outer routing layer (not the adapter), this is the right division of responsibility.

---

## Issues

### IMPORTANT — Missing `platform` in `SessionStore.getSessionById()` legacy wrapper

**File:** `/Users/rk/01_projects/claude-mem-gemini/src/services/sqlite/SessionStore.ts` lines 1689-1705

The legacy `getSessionById` method on `SessionStore` (the class wrapper, not the standalone function in `sessions/get.ts`) does NOT include `platform` in its SELECT list or return type:

```typescript
// SessionStore.ts (class method) — MISSING platform
getSessionById(id: number): {
  id: number;
  content_session_id: string;
  memory_session_id: string | null;
  project: string;
  user_prompt: string;
  custom_title: string | null;  // platform absent here
} | null {
  const stmt = this.db.prepare(`
    SELECT id, content_session_id, memory_session_id, project, user_prompt, custom_title
    FROM sdk_sessions WHERE id = ? LIMIT 1
  `);
```

The standalone function in `sessions/get.ts` (line 20) correctly includes `platform`:

```typescript
// sessions/get.ts — CORRECT
SELECT id, content_session_id, memory_session_id, project, user_prompt, custom_title, platform
```

The `SessionRoutes.handleSessionInitByClaudeId` calls `store.getSessionById(sessionDbId)` (the class method) immediately after creating the session, but only reads `memory_session_id` from the result. So this does not cause a bug today. However, any future caller of the class-level `getSessionById` that expects `platform` will silently get `undefined` from a `SELECT` that doesn't fetch it. The two implementations are now out of sync.

**Recommendation:** Add `platform` to the class-level `getSessionById` SELECT and return type, or route all callers to the standalone function.

---

### IMPORTANT — `platform` not backfilled when session already exists

**File:** `/Users/rk/01_projects/claude-mem-gemini/src/services/sqlite/SessionStore.ts` lines 1791-1814 (and the matching block in `sessions/create.ts` lines 40-59)

Both `createSDKSession` implementations have an "existing session" path. In that path, `project` and `customTitle` are conditionally backfilled, but `platform` is not:

```typescript
if (existing) {
  if (project) {
    // backfill project
  }
  if (customTitle) {
    // backfill custom_title
  }
  // platform is NOT backfilled
  return existing.id;
}
```

**Scenario that surfaces this bug:** A Gemini CLI hook fires for prompt #2 of a session. Prompt #1 was also from Gemini CLI, so the session exists. The `existing` branch is taken, `platform` is never written, and the value from prompt #1's INSERT is used. That is fine — IF prompt #1 was also from Gemini CLI.

The real risk scenario: the observation hook and summarize hook both call `store.createSDKSession(contentSessionId, '', '')` (with no platform argument). These calls hit the existing-session path and do nothing to platform — which is fine because platform is already set. However, if a session is somehow created first by a hook that passes no platform (defaulting to `'claude-code'` in the INSERT) and then the session-init hook fires later with `platform='gemini-cli'`, the platform stored would be wrong.

In practice the session-init hook fires first, so this race condition is unlikely. But the asymmetry between `customTitle` backfilling behavior and the lack of `platform` backfilling is a latent consistency risk. The fix is simple: add a platform backfill that only fires when platform is explicitly provided AND differs from the stored value.

---

### IMPORTANT — `worker-types.ts` `UserPrompt` interface not updated

**File:** `/Users/rk/01_projects/claude-mem-gemini/src/services/worker-types.ts` lines 148-156

The viewer-side `UserPrompt` type at `src/ui/viewer/types.ts` correctly has `platform?: string`. The `PaginationHelper.getPrompts` query correctly SELECTs `s.platform`. But the shared `UserPrompt` interface in `worker-types.ts` is missing `platform`:

```typescript
// worker-types.ts — MISSING platform
export interface UserPrompt {
  id: number;
  content_session_id: string;
  project: string;
  prompt_number: number;
  prompt_text: string;
  created_at: string;
  created_at_epoch: number;
  // platform is absent
}
```

`PaginationHelper` imports its types from `worker-types.ts` (line 17: `import type { PaginatedResult, Observation, Summary, UserPrompt } from "../worker-types.js"`). The `getPrompts` return type annotation is `PaginatedResult<UserPrompt>` using this import. TypeScript will not catch that the SQL result has `platform` but the type doesn't — it just silently discards the field at the type level.

Any downstream TypeScript code that calls `getPrompts()` and tries to access `.platform` on a result item will get a type error (or be forced to cast). The viewer component sidesteps this because it uses its own `types.ts` definition. But the shared type is a source of confusion and potential runtime-type mismatch if other server-side consumers emerge.

**Recommendation:** Add `platform?: string` to `UserPrompt` in `worker-types.ts`.

---

### SUGGESTION — `geminiCliAdapter.normalizeInput` does not set `platform`

**File:** `/Users/rk/01_projects/claude-mem-gemini/src/cli/adapters/gemini-cli.ts` lines 8-18

The `normalizeInput` function returns an object without a `platform` field:

```typescript
return {
  sessionId: r.session_id ?? ...,
  cwd: r.cwd ?? ...,
  prompt: r.prompt,
  toolName: r.tool_name,
  // no platform here
};
```

The `platform` value that reaches `session-init.ts` as `input.platform` therefore comes from wherever the outer dispatcher sets it before calling the adapter — presumably the routing layer sets `platform` on the raw input before normalizing, or reads it from `NormalizedHookInput`. This currently works because `session-init.ts` line 81 passes `platform: input.platform` and the fallback in `SessionRoutes` handles `undefined` with `?? 'claude-code'`.

However, if Gemini CLI's raw hook payload were to include a `platform` field in the future and the adapter's `normalizeInput` does not map it, the field would be silently dropped. More importantly, the adapter contract (the `PlatformAdapter` interface) has no documentation that the router is responsible for injecting `platform` before normalization. This implicit coupling is fragile.

**Recommendation:** Either explicitly set `platform: 'gemini-cli'` inside `geminiCliAdapter.normalizeInput` (making the source of truth explicit), or add a comment to the adapter explaining that `platform` is injected by the dispatch layer.

---

## Plan Alignment Verification

| Requirement | Status | Notes |
|-------------|--------|-------|
| Schema migration v24: ALTER TABLE sdk_sessions ADD COLUMN platform TEXT DEFAULT 'claude-code' | Implemented | Both `MigrationRunner` and `SessionStore` class; idempotent |
| Thread platform through createSDKSession | Implemented | Both standalone function and class method |
| Forward platform from session-init.ts via POST body | Implemented | `platform: input.platform` at line 81 |
| SessionRoutes extracts platform with `?? 'claude-code'` fallback | Implemented | Line 702-703; also normalizes case and length |
| Add platform to explicit SELECT lists in sessions/get.ts | Implemented | `getSessionById` and `getSdkSessionsBySessionIds` both include it |
| Add platform to PaginationHelper.getPrompts | Implemented | Line 166 |
| Add platform to viewer types (UserPrompt) and PromptCard badge | Implemented | Viewer types.ts line 38; PromptCard shows badge for non-Claude platforms |
| Update cli/types.ts comment | Implemented | Comment on `platform?` field updated |

All plan requirements are met. The three "IMPORTANT" issues above are gaps in the implementation that could cause bugs or type-safety problems for future callers but do not break the primary happy path today.

---

## Verdict

The implementation is functionally correct for the primary use case. Ship-blocking issues: none. The three IMPORTANT items should be addressed before the next feature build on top of this code, as they will become harder to fix once more callers depend on the inconsistent types and backfill behavior.
