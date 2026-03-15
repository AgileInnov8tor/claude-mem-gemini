# Plan Error Report
**Plan:** `plan-to-evaluate.md`
**Date:** March 5, 2026
**Tier:** Deep
**Evaluator:** Codex

## Executive Summary

This plan is directionally solid (clear file touch points, sensible data flow,
and a concrete verification checklist). The main risks are (1) assumptions and
data-quality claims around “backfilling” existing sessions, and (2) missing
specification/validation for `platform` across the API boundary, which can
create incorrect data, brittle integrations, or confusing UI output.

## Issues Found

### CRITICAL (must fix before proceeding)

These issues can lead to incorrect stored data or a brittle rollout.

- **[01] Assumption errors:** The plan assumes migration versioning and
  backfill behavior without a verification step.
  - **Evidence:** “Add migration version 24” and “Default `'claude-code'`
    backfills existing sessions.”
  - **Risk:** Version `24` may already be used; SQLite default behavior and
    existing-row semantics can differ from expectations; historical sessions may
    be mislabeled.
  - **Suggested fix:** Add an explicit preflight step:
    - Confirm the next available migration version in
      `src/services/sqlite/migrations/runner.ts`.
    - Confirm `sdk_sessions` exists and whether existing rows will read as
      `'claude-code'`, `NULL`, or something else after `ALTER TABLE`.
    - Decide and document the intended semantics for historical rows (for
      example, `NULL`/`unknown` versus forced `'claude-code'`).

- **[05] Data quality errors:** The plan presents an important correctness claim
  as fact, without marking it as an assumption or adding a validation query.
  - **Evidence:** “Default `'claude-code'` backfills existing sessions.”
  - **Risk:** If the claim is wrong, the system can silently store incorrect
    labels for existing sessions, making the UI badge misleading and reducing
    trust in the viewer.
  - **Suggested fix:** Add a verification step that inspects several existing
    rows after migration, and consider an explicit `UPDATE` backfill strategy
    (or leaving historical rows as `NULL`/`unknown`) instead of relying only on
    a column default.

- **[09] Design & specification errors:** The plan does not define the interface
  contract for `/api/sessions/init` after adding `platform`.
  - **Evidence:** “Add `platform: input.platform` to the POST body … Extract
    `platform` from `req.body` … pass to `createSDKSession()`.”
  - **Risk:** Without a contract, clients/servers can disagree on required vs.
    optional, accepted values, and defaulting behavior. This increases the
    chance of runtime errors and inconsistent data.
  - **Suggested fix:** Specify:
    - Whether `platform` is required or optional on the endpoint.
    - Accepted values (for example, `'claude-code' | 'gemini-cli' | 'cursor'`).
    - Server-side default when missing/unknown.
    - Response shape guarantees for session read endpoints (including how
      `NULL`/missing is represented).

- **[19] Boundary & constraint errors:** The plan does not define constraints
  for `platform` values or how to handle out-of-bound inputs.
  - **Evidence:** “Extract `platform` from `req.body`” with no validation step,
    and UI display guidance that assumes only “Gemini / Claude / Cursor.”
  - **Risk:** Any caller can send unexpected strings (empty, extremely long,
    new values), leading to confusing UI, inconsistent DB contents, or display
    regressions.
  - **Suggested fix:** Add validation and constraints at the worker boundary:
    - Whitelist known values and map unknowns to `unknown`.
    - Cap length (for example, 32–64 chars) before inserting.
    - Ensure the viewer has a safe fallback label for unknown values.

### HIGH (should fix)

These issues are likely to cause integration bugs or increase rework.

- **[06] Omission & commission errors:** The plan omits a testing strategy for
  the cross-layer change (migration → insert → read → UI render).
  - **Evidence:** Verification is manual-only and does not mention automated
    tests.
  - **Suggested fix:** Add at least one automated check (unit/integration) that
    asserts:
    - `createSDKSession()` persists `platform`.
    - Read queries return `platform`.
    - The worker route accepts missing/unknown `platform` safely.

- **[07] Process/workflow errors:** The plan does not define a failure/rollback
  path for the migration and deploy sequence.
  - **Evidence:** The plan adds a migration but does not describe rollback or
    how to recover if partial rollout occurs (new code writing `platform` while
    some environments are not migrated yet).
  - **Suggested fix:** Add explicit sequencing and rollback notes:
    - Order: deploy migration-compatible code, run migration, then enable
      writer, then UI.
    - Define what to do if migration fails or is partially applied.

- **[12] System integration errors:** The plan does not address compatibility
  with older clients/agents that might not send `platform`.
  - **Evidence:** `platform` is added to the POST body, but missing-input
    behavior is not described.
  - **Suggested fix:** Treat `platform` as optional at the API boundary, with a
    server-side default, and ensure the system remains compatible with clients
    that do not supply the field.

### MEDIUM (consider fixing)

These issues reduce clarity and increase the chance the implementation misses
some required edits.

- **[03] LLM-specific errors:** Several steps are phrased as “check X” without
  enumerating concrete search targets.
  - **Evidence:** “Check `src/services/sqlite/sessions/read.ts` — the SELECT
    queries need to include `platform`.”
  - **Suggested fix:** Add explicit guidance for discovery, for example:
    - `rg -n "SELECT .*sdk_sessions" src/services/sqlite/sessions/read.ts`
    - `rg -n "createSDKSession\\(" src/ -S`
    and list the exact functions/queries that must be updated.

- **[08] Communication errors:** The plan does not define the authoritative
  source of truth for platform labels and naming.
  - **Evidence:** It lists example strings and UI labels, but does not specify
    where the mapping lives or how new platforms should be added.
  - **Suggested fix:** Define a single mapping (shared constant/type) used by:
    - request validation,
    - DB insertion defaults,
    - UI label rendering.

- **[10] Measurement errors:** Success criteria are mostly activity-based and
  do not include negative/edge acceptance checks.
  - **Evidence:** Verification checks only “should show `gemini-cli`” and “badge
    visible.”
  - **Suggested fix:** Add measurable acceptance checks such as:
    - “When `platform` is missing, DB stores `unknown` (or `claude-code`) and UI
      displays a safe fallback label.”
    - “Session list endpoints return `platform` for both new and historical
      sessions.”

- **[18] Encoding & translation errors:** The plan risks semantic drift between
  stored values and UI display strings.
  - **Evidence:** Stored values are `"gemini-cli"`, `"claude-code"`, `"cursor"`,
    while UI shows “Gemini / Claude / Cursor.”
  - **Suggested fix:** Specify the exact mapping rules (including case and
    hyphenation) and how unknown values are displayed.

### LOW (nice to fix)

These issues are minor but improve maintainability and future changes.

- **[11] Software execution errors:** The plan does not mention input
  sanitization/normalization (trim, lowercase) before storing `platform`.
  - **Evidence:** `platform` is passed through from `req.body` directly.
  - **Suggested fix:** Normalize `platform` on write and document behavior
    (for example, lowercase and trim).

- **[14] Knowledge/skill gaps:** The plan assumes familiarity with the project’s
  migration system and session lifecycle.
  - **Evidence:** “Add call in `runAllMigrations()`” without describing how to
    validate migration ordering and versioning in this repo.
  - **Suggested fix:** Add a brief note on how to confirm migrations ran (log
    message, version table, or a query) and where versions are recorded.

## Strengths

The plan has several strong elements that reduce ambiguity and implementation
thrash:

- Clear end-to-end threading from hook input → worker API → DB → read API → UI.
- Concrete file list that is likely close to the actual touch points.
- Idempotent migration approach that checks for an existing column first.
- A practical manual verification checklist that exercises both Gemini CLI and
  Claude Code paths.

## Verdict

NEEDS WORK — The core approach is good, but you should tighten assumptions and
specification around backfill semantics, API contracts, and input constraints
before implementation.
