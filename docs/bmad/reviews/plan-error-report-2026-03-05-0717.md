# Plan Error Evaluation Report

**Plan:** floating-snacking-cosmos.md (Add Platform Labeling to Sessions)
**Evaluation Date:** 2026-03-05
**Tier:** Standard (9 categories evaluated)
**Overall Health Score:** 64/100

---

## Executive Summary

The plan is well-structured and clearly motivated, with a logical 5-step progression from schema through API to UI. The primary risk is insufficient error handling at data path boundaries — particularly missing null/undefined guards for `platform` in the API layer. Three medium-severity gaps (no rollback, no tests, migration version assumption) are quick fixes that will meaningfully reduce implementation risk before starting.

**Finding Counts:**
- 🔴 Critical: 0
- 🟠 High: 1
- 🟡 Medium: 4
- 🟢 Low: 3
- ℹ️ Info: 0

**Total Findings:** 8

---

## Critical Findings

✅ No critical findings detected.

---

## High Severity Findings

### 1. Missing Error Handling for Null/Undefined Platform

**Severity:** 🟠 High
**Category:** Omission/Commission Errors (06)
**Confidence:** 90%

**Description:**
The plan threads `platform: input.platform` directly from POST body to INSERT, but specifies no validation or default for when `platform` is absent from the request body.

**Impact:**
New sessions created by clients that omit `platform` (e.g., future adapters, test scripts, or curl calls) will store `null` in the database, bypassing the migration's DEFAULT and breaking the platform badge in the viewer UI.

**Recommendation:**
Add explicit fallback in `SessionRoutes.ts`: `const platform = req.body.platform ?? 'claude-code'`. Document that unknown platforms should be stored as-is (permissive) or rejected with 400 (strict). Clarify which policy applies.

**Evidence:**
```
Step 3: "Add `platform: input.platform` to the POST body sent to `/api/sessions/init`"
Step 3: "Extract `platform` from `req.body`, pass to `createSDKSession()`"
(No validation or default specified for either step)
```

---

## Medium Severity Findings

### 2. No Migration Rollback Strategy

**Severity:** 🟡 Medium
**Category:** Process/Workflow Errors (07)
**Confidence:** 85%

**Description:**
No rollback procedure is documented for migration v24. SQLite's `DROP COLUMN` support requires version 3.35.0+, which may not be universal across dev environments.

**Impact:**
If migration v24 causes issues (corrupt state, wrong default, collision with another migration), developers have no documented recovery path. On older SQLite, rollback may require recreating the table.

**Recommendation:**
Add to Verification section: "If rollback needed: SQLite 3.35+ → `ALTER TABLE sdk_sessions DROP COLUMN platform`. Older SQLite → recreate table from schema. Verify `sqlite3 --version` ≥ 3.35 before implementing."

**Evidence:**
```
"Add migration version 24: ALTER TABLE sdk_sessions ADD COLUMN platform TEXT DEFAULT 'claude-code'"
(No rollback procedure mentioned anywhere in the plan)
```

---

### 3. No Testing Strategy

**Severity:** 🟡 Medium
**Category:** Omission/Commission Errors (06)
**Confidence:** 85%

**Description:**
The verification section relies entirely on manual SQLite queries and visual UI inspection. No automated tests are specified for a change touching 8 files across 3 architectural layers.

**Impact:**
Regressions in session creation, platform storage, or API responses will require manual re-verification after each subsequent change. The platform field is invisible to automated test suites.

**Recommendation:**
Add a testing sub-section:
- Unit: Verify migration v24 adds column with correct default
- Integration: POST to `/api/sessions/init` with `platform: 'gemini-cli'`, assert stored value via GET
- Component: Verify UI badge renders for `'gemini-cli'`, `'claude-code'`, and null

**Evidence:**
```
## Verification
1. Build: `npm run build-and-sync`
2. Start a Gemini session → check sqlite3 query
3. Start a Claude Code session → same query
4. Check viewer — platform badge visible
5. Existing sessions should show `claude-code`
(All steps are manual; no automated test coverage)
```

---

### 4. Migration Version Collision Risk

**Severity:** 🟡 Medium
**Category:** Assumption Errors (01)
**Confidence:** 75%

**Description:**
The plan assigns migration version 24 without verifying it's the next available version. If another migration was added (in a parallel branch or since the plan was written), version 24 may already be taken.

**Impact:**
Migration collision causes the `isVersionApplied` guard to silently skip a legitimate migration — or worse, records v24 as applied when a different schema change was applied under that number.

**Recommendation:**
Add prerequisite: "Before implementation, check current max version in `runAllMigrations()`. Use `currentMax + 1`. Do not hardcode 24."

**Evidence:**
```
"Add migration version 24" (stated as fact, not verified)
"private addSessionPlatformColumn(db: Database): void {
  if (this.isVersionApplied(db, 24)) return;"
```

---

### 5. UI Badge Specification Too Vague

**Severity:** 🟡 Medium
**Category:** Design/Specification Errors (09)
**Confidence:** 80%

**Description:**
The badge is described as "small platform badge/icon" on either "PromptCard or session headers" — leaving placement, design, null behavior, and visual style entirely to the implementer's discretion.

**Impact:**
Two developers could produce incompatible implementations. Without a null/unknown state spec, the UI may crash or look broken for sessions without a platform value.

**Recommendation:**
Specify: "Add text pill badge to PromptCard header row (not session headers). Display: `gemini-cli` → 'Gemini', `claude-code` → 'Claude'. Omit badge entirely if platform is null/undefined. Use existing pill/tag styles from the design system."

**Evidence:**
```
"Add a small platform badge/icon next to session entries.
Show 'Gemini' / 'Claude' / 'Cursor' label on `PromptCard` or session headers."
(No placement, visual spec, null handling, or component reference)
```

---

## Low Severity Findings

### 6. Platform Type May Be Comment-Only Fix

**Severity:** 🟢 Low
**Category:** Omission/Commission Errors (06)
**Confidence:** 70%

**Description:**
The plan updates `src/cli/types.ts` to add a comment for `'gemini-cli'`, but doesn't verify whether `platform` is typed as `string` or a literal union like `'claude-code' | 'gemini-cli'`.

**Recommendation:**
Check the TypeScript type of `platform` in `NormalizedHookInput`. If it's a string literal union, update the type itself (not just the comment) to include `'gemini-cli'`.

**Evidence:**
```
`src/cli/types.ts` — Update comment to include `'gemini-cli'`
```

---

### 7. Missing Null Guard in Read/UI Layer

**Severity:** 🟢 Low
**Category:** Omission/Commission Errors (06)
**Confidence:** 70%

**Description:**
The migration applies DEFAULT at the schema level, but TypeScript types will expose `platform?: string`. The UI badge renderer and any display logic have no explicit null/undefined handling specified.

**Recommendation:**
Add to verification step 5: "Confirm all existing rows show `'claude-code'` (not NULL) after running migration. Confirm UI badge renders nothing (not crashes) for a session with null platform."

**Evidence:**
```
"Expose in API responses" — platform field added to SELECT
(No null handling mentioned for TypeScript consuming code or React rendering)
```

---

### 8. Line Number Reference Will Drift

**Severity:** 🟢 Low
**Category:** LLM-Specific Errors (03)
**Confidence:** 65%

**Description:**
The plan pins a change to `line ~53` of `session-init.ts`. Any preceding edit invalidates this reference, creating friction for implementers who navigate by line number.

**Recommendation:**
Replace with function/context anchor: "In `session-init.ts`, find the `fetch('/api/sessions/init', ...)` POST call and add `platform: input.platform` to its body object."

**Evidence:**
```
"`src/cli/handlers/session-init.ts` (line ~53) — Add `platform: input.platform` to the POST body"
```

---

## Category Coverage

| Category | Findings | Severity Breakdown |
|----------|----------|--------------------|
| Assumption Errors (01) | 1 | 1 Medium |
| Logical Reasoning Errors (02) | 0 | — |
| LLM-Specific Errors (03) | 1 | 1 Low |
| Cognitive Biases (04) | 0 | — |
| Data Quality Errors (05) | 0 | — |
| Omission/Commission Errors (06) | 4 | 1 High, 1 Medium, 2 Low |
| Process/Workflow Errors (07) | 1 | 1 Medium |
| Communication Errors (08) | 0 | — |
| Design/Specification Errors (09) | 1 | 1 Medium |

**Categories Analyzed:** 9/19

---

## Overall Assessment

### Strengths
- Clear motivation and context — the problem is well-stated
- Logical 5-step flow from schema → API → UI matches architectural layers
- Verification section included with concrete SQLite queries
- Migration uses safe `PRAGMA table_info` guard before ALTER TABLE
- Default value `'claude-code'` correctly backfills existing sessions
- Critical files table is thorough and accurate

### Areas for Improvement
- Add null/undefined fallback at API boundary before storage
- Specify rollback path for the schema migration
- Add at least one integration test to the verification steps
- Confirm migration version before hardcoding 24
- Tighten UI badge specification with placement and null behavior

### Risk Level
**Fair** — The plan is implementable as written but has a meaningful probability of a subtle production bug (null platform stored for some sessions) and no safety net (no automated tests, no rollback).

---

## Recommendations

### Immediate Actions (High Priority)
1. Add `platform ?? 'claude-code'` fallback in `SessionRoutes.ts` before passing to `createSDKSession()`
2. Verify next available migration version number before implementation

### Short-term Improvements (Medium Priority)
1. Document migration rollback procedure (SQLite version requirement)
2. Add one integration test to the verification checklist
3. Specify UI badge placement, null behavior, and visual style

### Long-term Enhancements (Low Priority)
1. Check if `platform` should be typed as a string literal union in `cli/types.ts`
2. Replace line number reference with function-context anchor

---

## Next Steps

**Recommended Action Plan:**

- [ ] Fix #1 (High): Add null fallback for `platform` in API route handler
- [ ] Fix #4 (Medium): Check migration version before hardcoding 24
- [ ] Fix #2 (Medium): Add rollback note to plan
- [ ] Fix #3 (Medium): Add integration test to verification section
- [ ] Fix #5 (Medium): Tighten UI badge spec
- [ ] Schedule follow-up evaluation after corrections (optional)

**Re-evaluation Recommended:** No — fixes are small; self-review after addressing High finding is sufficient.

---

## Appendix

### Evaluation Methodology

**Tier:** Standard (9 categories)

**Categories Evaluated:**
- Assumption Errors (01)
- Logical Reasoning Errors (02)
- LLM-Specific Errors (03)
- Cognitive Biases (04)
- Data Quality Errors (05)
- Omission/Commission Errors (06)
- Process/Workflow Errors (07)
- Communication Errors (08)
- Design/Specification Errors (09)

---

**Report Generated:** 2026-03-05 07:17
**Evaluator:** claude-haiku-4-5 (evaluating-plan-errors skill)
**Plan Source:** /Users/rk/.claude/plans/floating-snacking-cosmos.md

---

*This report was generated by the plan-error-evaluator skill. Review findings critically and validate recommendations against project context.*
