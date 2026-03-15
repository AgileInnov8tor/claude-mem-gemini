# Plan Error Evaluation Report

**Plan:** claude-mem → totalmem (Rename + MCP-First Architecture)
**Source:** `~/.claude/plans/zazzy-forging-creek.md`
**Evaluation Date:** 2026-03-05
**Tier:** Standard (9 categories evaluated)
**Overall Health Score:** 39/100

---

## Executive Summary

The totalmem migration plan is structurally well-conceived: it has a phased approach, an explicit risk register, incremental rollback points, and a research gate before risky installer work. These are genuine strengths that many migration plans lack.

However, the evaluation found 11 issues across 7 categories. The most significant risk is a **logical parallelization conflict in the dependency diagram** — Phases 2-5 cannot actually run in parallel as stated because Phase 2 generates new code using old names that Phase 3 must then rename. Additionally, the **effort estimate appears overconfident** for the scope of change, and **CI/CD pipeline updates are absent** from the critical files list.

The health score of 39 is primarily driven by 3 high-severity and 5 medium-severity findings. The underlying plan quality is solid; most findings are refinements and clarifications rather than fundamental design flaws.

**Finding Counts:**
- Critical: 0
- High: 3
- Medium: 5
- Low: 3
- Info: 0

**Total Findings:** 11

---

## Critical Findings

No critical findings detected.

---

## High Severity Findings

### 1. Phases 2-5 Parallelization Conflict

**Severity:** High
**Category:** Process/Workflow Errors + Logical Reasoning
**Confidence:** 90%

**Description:**
The dependency diagram states "Phases 2-5 can run in parallel after Phase 1." But Phase 2 adds new code (MCP prompts, resources) and Phase 2c explicitly renames the MCP server identity (`claude-mem` → `totalmem`). Phase 3 then performs a bulk rename of `\bclaude-mem\b` across the codebase. If these run in parallel, Phase 3's bulk rename will either miss Phase 2's new code or create conflicting edits to the same files.

**Impact:**
Parallel execution of Phases 2-5 as described will produce merge conflicts, missed renames in Phase 2's new code, or double-rename errors. The dependency diagram misleads anyone planning to dispatch subagents.

**Recommendation:**
Reorder as: Phase 2 (add features using old names) → Phase 3 (bulk rename including Phase 2's new code) → Phases 4+5 (branding/docs, genuinely parallelizable with each other). Update the dependency diagram accordingly. Or: Phase 2 writes new code using new names from the start, with Phase 3 explicitly excluding Phase 2's new files from bulk rename.

**Evidence:**
```
Dependency diagram: "Phases 2-5 can run in parallel after Phase 1"
Phase 2c: "Rename MCP server identity: claude-mem → totalmem"
Phase 3: "Rename — Core Identity" using \bclaude-mem\b → totalmem
```

---

### 2. Overconfident Effort Estimate

**Severity:** High
**Category:** Cognitive Biases (Overconfidence)
**Confidence:** 85%

**Description:**
The plan estimates "~10h (±30%)" total, with Phase 1 (monorepo restructure) at ~2.5h for 7 sub-steps (21 min/step). Monorepo restructures routinely hit unexpected issues: build tool path resolution failures, workspace hoisting conflicts, IDE indexing breakage, and CI configuration drift. The 10h estimate leaves no slack for diagnosis and recovery.

**Impact:**
If the estimate is wrong by 2x (a common outcome for structural refactors), the plan's timeline doubles without a contingency strategy. Downstream scheduling based on this estimate will be disrupted.

**Recommendation:**
Three-point estimate:
- P10 (optimistic): 10h
- P50 (expected): 16h
- P90 (conservative): 24h

Plan at P50; commit at P90. Phase 1 specifically should be budgeted at 4-6h, not 2.5h.

**Evidence:**
```
"~10h (±30%) — Phase 0 (~1h), Phase 1 (~2.5h incremental moves),
Phase 2 (~1.5h MCP enhancement), Phases 3-5 (~3h rename, parallelizable),
Phase 6 (~1.5h installer), Phase 7 (~0.5h validation)"
```

---

### 3. Missing CI/CD Pipeline Updates

**Severity:** High
**Category:** Omission Errors
**Confidence:** 80%

**Description:**
The plan's "Critical files to update per step" lists `sync-marketplace.cjs`, `build-hooks.js`, `package.json`, `hooks.json`, and `tsconfig.json`. No mention is made of CI/CD configuration files (GitHub Actions workflows, or equivalent). After Phase 1's monorepo restructure, any CI that references old file paths will fail silently on the next push.

**Impact:**
First PR after Phase 1 will break CI. Depending on branch protection, this may block merging and require an unplanned hotfix pass.

**Recommendation:**
Add to Phase 1 critical files list: `.github/workflows/*.yml` (or project's CI equivalent). Add verification step to Phase 7: "CI pipeline runs green on a test branch push."

**Evidence:**
```
Critical files listed in Phase 1:
- scripts/sync-marketplace.cjs
- scripts/build-hooks.js
- package.json
- All hooks.json files
- tsconfig.json
[No CI/CD configuration files mentioned]
```

---

## Medium Severity Findings

### 4. MCP SDK Capability Assumption

**Severity:** Medium
**Category:** Assumption Errors
**Confidence:** 75%

**Description:**
Phase 2 adds MCP Prompts and Resources capabilities without verifying that the current MCP SDK version supports them, or that target client CLIs (Gemini CLI, Cursor) consume prompts/resources rather than only tools.

**Impact:**
If the MCP SDK version is pre-prompts/resources, Phase 2 requires a dependency upgrade not mentioned in the plan. If target CLIs don't consume prompts, the Phase 2 investment may have no effect for those users.

**Recommendation:**
Add to Phase 0a: (1) `npm ls @modelcontextprotocol/sdk` to confirm version and feature support, (2) verify Gemini CLI and Cursor MCP client behavior — do they call `prompts/list` and `resources/list`?

---

### 5. Unverified File Count Claims

**Severity:** Medium
**Category:** LLM-Specific Errors (Hallucination Risk)
**Confidence:** 70%

**Description:**
The plan references "~79 files importing these constants" (Phase 3a), "~47 files" and "~60 files" (Phase 5 docs), and "~25 files" (Phase 5 i18n). These are estimates that could be significantly off.

**Impact:**
If the actual count for env var imports is 120+ files, Phase 3a becomes a much larger and riskier operation than planned. Scope miscalibration mid-execution creates pressure to cut corners on the mandatory diff review.

**Recommendation:**
Add to Phase 0b: run actual counts before starting:
```bash
rg "\bCLAUDE_MEM_" --count src/ | awk -F: '{sum += $2} END {print sum}'
rg "docs\.claude-mem\.ai" --count docs/ | awk -F: '{sum += $2} END {print sum}'
```
Update plan with verified numbers.

---

### 6. Phase 3-5 Rename Has No Rollback Strategy

**Severity:** Medium
**Category:** Process/Workflow Errors
**Confidence:** 85%

**Description:**
Phase 1 has explicit rollback (`git reset HEAD~1` on >20 test failures). Phases 3-5 only have "mandatory diff review before each commit" as mitigation, but no rollback strategy if a rename batch is committed and then found to have false positives or breaks tests.

**Impact:**
A bad `sd` batch committed across hundreds of files is messy to undo without a defined strategy. If parallel subagents are used, interleaved commits from multiple agents compound the complexity.

**Recommendation:**
Add rollback rule to Phases 3-5: "If `npm test` fails after a rename commit, `git reset HEAD~1` immediately. Refine regex and retry. Do not commit partial-rename state." If subagents are used, each agent works on a separate branch; review + merge sequentially.

---

### 7. MCP Prompts/Resources Underspecified

**Severity:** Medium
**Category:** Design/Specification Errors
**Confidence:** 80%

**Description:**
Phase 2a says to "source prompt text from the same markdown files, served over MCP `prompts/get` handler" but doesn't specify how SKILL.md frontmatter maps to MCP prompt fields (`name`, `description`, `arguments`). Phase 2b defines resource URIs but not content type, response structure, or behavior when the worker is unavailable.

**Impact:**
An implementer starting Phase 2 will face multiple unspecified design decisions. Two implementers could produce incompatible implementations.

**Recommendation:**
Add design notes to Phase 2:
- Prompts: strip YAML frontmatter, use `description:` field for MCP prompt description, use content body as prompt `text`, no arguments (static prompts)
- Resources: `text/plain` MIME type, return empty string if worker unavailable (not error), include cache-control header

---

### 8. npm Workspace Cross-Package Import Strategy Missing

**Severity:** Medium
**Category:** Design/Specification Errors
**Confidence:** 75%

**Description:**
Phase 1.8 adds workspaces config but doesn't specify how packages import each other, what the build order is, or whether TypeScript project references are used. This is the most common failure point in monorepo migrations.

**Impact:**
Without explicit workspace dependency declarations, `packages/cli-adapters/` won't be able to import from `packages/core/` without manual path hacks. TypeScript may not find types across packages without project references. Build order may be wrong.

**Recommendation:**
Add a "Package Dependency Graph" to Phase 1:
```
core/     — no internal deps, builds first
installer/ — depends on core (settings types)
cli-adapters/claude-plugin/ — depends on core
cli-adapters/gemini-ext/    — depends on core
```
Specify workspace protocol: `"@totalmem/core": "workspace:*"` in each adapter's `package.json`. Document whether TypeScript `tsc -b` (project references) is used.

---

## Low Severity Findings

### 9. Stale Context Tag Migration Path Missing

**Severity:** Low
**Category:** Omission Errors
**Confidence:** 80%

**Description:**
Phase 4a acknowledges that existing CLAUDE.md files will have stale `<claude-mem-context>` tags, but the plan offers no migration path. Heavy users with many projects may see degraded behavior for an extended period.

**Recommendation:**
Add post-Phase-4a step: provide migration utility `totalmem migrate-context` (or equivalent) that scans session history for projects with injected context files and renames old tags. Document in release notes.

---

### 10. Permanent Data Directory Identity Mismatch

**Severity:** Low
**Category:** Cognitive Biases (Similarity Bias)
**Confidence:** 70%

**Description:**
Keeping `~/.claude-mem/` for a product called "totalmem" is a justified short-term trade-off to avoid migration friction, but creates a permanent identity mismatch. For Gemini/Codex users who install totalmem with no Claude involvement, the data directory name will be confusing or alarming.

**Recommendation:**
Time-box the decision: keep `~/.claude-mem/` for v1 (as stated). Add a future milestone for v2: "XDG-compliant `~/.totalmem/` with backward-compat symlink from `~/.claude-mem/`." Document the rationale prominently in README and first-run output.

---

### 11. Subagent Execution Model Underdefined

**Severity:** Low
**Category:** Communication Errors
**Confidence:** 65%

**Description:**
The plan says Phases 3-5 are "parallelizable across subagents" but doesn't specify the execution model, orchestration protocol, or which files each subagent must avoid to prevent conflicts.

**Recommendation:**
Add "Execution Model" section: "Human-driven sequential execution for Phase 1. Phases 3a-3d, 4a-4c, and 5 can be dispatched to parallel subagents IF file sets are non-overlapping: Phase 3 → `src/`, Phase 4 → `plugin/`, Phase 5 → `docs/`. Root config files (`package.json`, `tsconfig.json`) are shared — assign to a single agent."

---

## Category Coverage

| Category | Findings | Severity |
|----------|----------|----------|
| Assumption Errors | 1 | Medium |
| Logical Reasoning | 1 (merged with #1) | — |
| LLM-Specific Errors | 1 | Medium |
| Cognitive Biases | 2 | High, Low |
| Data Quality | 0 | — |
| Omission/Commission | 2 | High, Low |
| Process/Workflow | 2 | High, Medium |
| Communication | 1 | Low |
| Design/Specification | 2 | Medium, Medium |

**Categories Analyzed:** 9/19

---

## Overall Assessment

### Strengths
- Explicit risk register with 5 identified risks and contingency triggers
- Phase 0 research gate that blocks installer work until CLI configs are validated
- Incremental Phase 1 with per-step commits and test runs
- Comprehensive exclusion list for the rename (data dir, db filename, Chroma prefix)
- 10-item verification checklist in the Verification section
- Rollback strategy already defined for Phase 1

### Areas for Improvement
- Fix the Phase 2-5 parallelization order before delegating to subagents
- Add CI/CD files to Phase 1 critical update list
- Verify file counts in Phase 0b before committing to scope
- Add workspace dependency graph for monorepo structure

### Risk Level
**MODERATE** — The plan is well-structured but has 3 high-severity gaps that should be addressed before execution begins, particularly the phase ordering conflict which could cause wasted work if subagents are used.

---

## Recommendations

### Immediate Actions (High Priority)
1. Fix Phase 2-5 ordering: Phase 2 → Phase 3 → Phases 4+5 (parallel). Update dependency diagram.
2. Add `.github/workflows/` to Phase 1 critical files list. Add CI green check to Phase 7 verification.
3. Revise effort estimate to P10/P50/P90 format; adjust Phase 1 to 4-6h.

### Short-term Improvements (Medium Priority)
1. Add to Phase 0b: run actual file count commands (`rg` for env vars, docs URLs).
2. Define rollback rule for Phases 3-5 rename commits.
3. Add MCP SDK version check to Phase 0a prerequisites.
4. Expand Phase 2 design notes with prompt/resource schema specifications.
5. Add workspace package dependency graph to Phase 1.

### Long-term Enhancements (Low Priority)
1. Plan v2 `~/.totalmem/` data directory migration with backward compat.
2. Add `totalmem migrate-context` utility for stale CLAUDE.md tag cleanup.
3. Clarify subagent file ownership for parallel Phase 3-5 execution.

---

## Next Steps

**Recommended Action Plan:**

- [ ] Address the Phase 2-5 ordering conflict before execution
- [ ] Add CI/CD to Phase 1 critical files
- [ ] Run Phase 0b file count commands now to calibrate scope
- [ ] Revise effort estimate with three-point format
- [ ] Schedule re-evaluation after addressing high-severity items

**Re-evaluation Recommended:** Yes — after addressing High findings, re-run to confirm health score improves to 70+.

---

## Appendix

### Evaluation Methodology

**Tier:** Standard (9 categories)
- Covers foundational + process/design categories
- Excludes deep-tier categories (measurement, human factors, causal inference, etc.)

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

**Report Generated:** 2026-03-05
**Evaluator:** plan-error-evaluator skill (Standard tier)
**Model:** claude-opus-4-6

---

*Review findings critically and validate recommendations against project context. The plan's existing strengths (risk register, gated phases, incremental rollback) are genuine — these findings are refinements, not fundamental redesigns.*
