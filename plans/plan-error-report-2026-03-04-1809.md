# Plan error evaluation report

This report evaluates the plan at
`/Users/rk/.claude/plans/hashed-toasting-book.md` against the
`evaluating-plan-errors` standard-tier taxonomy (categories 01–09). It focuses
on issues that could block implementation or cause rework.

**Plan:** Fork claude-mem for Gemini CLI compatibility
**Evaluated:** March 4, 2026 18:09
**Tier:** Standard (9 categories)
**Complexity score:** 89.1
**Health score:** 61/100

## Executive summary

The plan is structured and implementable, but it relies on several unverified
Gemini CLI extension and hook details. Tightening the input/output contracts
and adding an early proof-of-concept (POC) will reduce the risk of building the
wrong adapter and hook configuration.

- **Total findings:** 7
- **By severity:** High: 2 | Medium: 3 | Low: 2
- **Most affected categories:** Assumption errors, data quality errors, and
  design and specification errors

## Findings by severity

### High

#### Unverified Gemini CLI extension and hooks schema (manifest, hooks file, templating)

| Attribute | Value |
|---|---|
| **Severity** | High |
| **Category** | Assumption errors (01) |
| **Confidence** | 80% |

**Evidence:**
> “Package as a Gemini CLI extension (installable via `gemini extensions install`).”
>
> `gemini-extension/gemini-extension.json` includes `"mcpServers": {...}` and
> uses `"${extensionPath}${/}..${/}plugin..."`
>
> `gemini-extension/hooks/hooks.json` defines `"matcher"`, `"sequential"`,
> `"timeout"`, and command templates with `"${extensionPath}/../plugin/..."`

**Issue:**
The plan assumes the Gemini CLI extension manifest schema, hook configuration
schema, and string templating behavior match the proposed JSON examples. If any
of these keys or templating conventions are wrong, the extension will not load,
hooks will not fire, or commands will run with incorrect paths.

**Remediation:**
Move a minimal “schema validation POC” to the top of Phase 4:

- Install/link a stub extension that only prints a `SessionStart` message and
  logs the received stdin payload.
- Validate supported manifest keys (`contextFileName`, `hooks`, any `mcpServers`
  equivalent) and confirm the exact templating syntax for paths.
- Only then finalize `gemini-extension.json` and `hooks.json`.

---

#### Transcript parsing detection is brittle and under-specifies Gemini message shapes

| Attribute | Value |
|---|---|
| **Severity** | High |
| **Category** | Design and specification errors (09) |
| **Confidence** | 75% |

**Evidence:**
> “If content starts with '{' and has a 'messages' key → JSON (Gemini CLI)
> Otherwise → JSONL (Claude Code)”
>
> “Extract content from message.content[] (array of {text: string})”

**Issue:**
JSONL transcripts also start with `{`, and the “has a `messages` key” heuristic
is not sufficient to guarantee correct format detection. The plan also assumes
Gemini `message.content[]` items are always `{text: string}`.

This can cause parse failures (attempting to `JSON.parse` JSONL) or incorrect
message extraction when Gemini content contains non-text blocks.

**Remediation:**
Specify a deterministic parsing strategy and tests:

- Attempt `JSON.parse` the full file; accept Gemini JSON only if the root value
  is an object with `messages: array`.
- Otherwise parse as JSONL line-by-line with per-line `JSON.parse`.
- In Gemini parsing, treat `message.content` as a union and extract text safely
  (concatenate only entries that have a string `text` field).
- Add fixture-based tests for: valid JSONL, valid Gemini JSON, malformed JSON,
  and Gemini messages containing mixed content entries.

## Medium

#### Hook input and output contracts are assumed, not explicitly specified and validated

| Attribute | Value |
|---|---|
| **Severity** | Medium |
| **Category** | Data quality errors (05) |
| **Confidence** | 70% |

**Evidence:**
> Adapter input assumes fields like `session_id`, `cwd`, `tool_name`,
> `tool_input`, `tool_response`, and `transcript_path`.
>
> Output uses `systemMessage` and `hookSpecificOutput: { additionalContext: ... }`.

**Issue:**
The plan implies “same fields” across platforms but does not define a concrete
contract per hook event (what fields Gemini sends for `BeforeAgent`, `AfterTool`,
`SessionStart`, and `SessionEnd`). If Gemini omits `cwd` or `transcript_path`,
the adapter will silently fall back (for example to `process.cwd()`), producing
incorrect session metadata.

**Remediation:**
Add a short “Gemini hook contract” section:

- For each Gemini hook event you rely on, document the expected stdin JSON keys
  and which are required vs optional.
- In `normalizeInput`, validate required fields and emit a clear error (or a
  “no-op” response) when critical fields are missing.
- Add a debug mode that logs the raw input payload so mismatches are easy to
  diagnose.

---

#### SessionEnd best-effort makes summarize/complete unreliable without an asynchronous fallback

| Attribute | Value |
|---|---|
| **Severity** | Medium |
| **Category** | Process and workflow errors (07) |
| **Confidence** | 80% |

**Evidence:**
> “SessionEnd is best-effort (CLI won't wait). Accept possible data loss.”
>
> `SessionEnd` hooks run `summarize` then `session-complete` sequentially.

**Issue:**
If the CLI does not wait for `SessionEnd`, sequential summarize/complete is
likely to be truncated frequently. This creates intermittent summaries and
non-deterministic “complete” behavior.

**Remediation:**
Add a workflow that can recover from truncated `SessionEnd`:

- On `SessionEnd`, enqueue a “finalize session” job to the worker and return
  immediately (do not attempt full summarize inline).
- On the next `SessionStart` (or via the long-running worker), finish any
  pending finalization for previous sessions.
- Document how you detect and retry incomplete finalizations.

---

#### Configuration story is split across user settings and extension packaging, and lacks rollback steps

| Attribute | Value |
|---|---|
| **Severity** | Medium |
| **Category** | Omission and commission errors (06) |
| **Confidence** | 65% |

**Evidence:**
> “`mcpServers` key in `~/.gemini/settings.json`”
>
> Also adds `mcpServers` in `gemini-extension/gemini-extension.json`.

**Issue:**
The plan proposes two configuration surfaces for MCP and hooks (user settings
and extension manifest) without picking a single recommended approach or
defining precedence. It also lacks “disable/uninstall quickly” steps, which are
important when hooks are misconfigured.

**Remediation:**
Choose one primary approach for v1 and document it:

- If using an extension-only approach, document the minimal user steps and what
  must still live in `~/.gemini/settings.json` (if anything).
- If using user settings, remove duplicated config from the extension manifest.
- Add rollback steps: how to disable hooks, unlink the extension, and verify
  that the worker stops capturing data.

## Low

#### Verification steps and test commands are not tied to the actual toolchain

| Attribute | Value |
|---|---|
| **Severity** | Low |
| **Category** | Communication errors (08) |
| **Confidence** | 60% |

**Evidence:**
> “Unit tests: `npm test -- --grep gemini`”

**Issue:**
The verification plan is plausible, but `--grep` and even `npm test` semantics
depend on the repo’s actual test runner. This can lead to “plan says run X” but
X does nothing or fails for unrelated reasons.

**Remediation:**
Replace with repo-specific commands once the fork is created:

- Name the test runner (for example, Vitest/Jest) and provide the exact filter
  syntax that works in that runner.
- Add a single “smoke script” that simulates each Gemini hook with minimal JSON
  and asserts the worker endpoints received data.

---

#### Effort estimate and “straightforward” framing understate key unknowns

| Attribute | Value |
|---|---|
| **Severity** | Low |
| **Category** | Cognitive biases (04) |
| **Confidence** | 70% |

**Evidence:**
> “...making the adaptation straightforward.”
>
> “~2h (±30%)”

**Issue:**
Given the unverified extension/hook schema and transcript variations, the plan
reads more certain than the current evidence supports.

**Remediation:**
Add an “unknowns” list and widen the estimate:

- Example unknowns: exact extension schema keys, hook input payload shapes,
  `SessionEnd` behavior under real workloads, and transcript file discovery.
- Provide a P50/P90 estimate (for example, “P50: 4–6h, P90: 1–2 days”).

## Category coverage

This section summarizes which standard-tier categories were evaluated and what
they contributed.

| Category | Findings | Status | Notes |
|---|---:|---|---|
| Assumption errors (01) | 1 | Evaluated | Largest risk: unverified Gemini extension and hook schema |
| Logical reasoning errors (02) | 0 | Evaluated | No major fallacies detected |
| LLM-specific errors (03) | 0 | Evaluated | Not a primary issue for this plan |
| Cognitive biases (04) | 1 | Evaluated | Overconfidence in “straightforward” and time estimate |
| Data quality errors (05) | 1 | Evaluated | Input/output contract details are not fully grounded |
| Omission and commission errors (06) | 1 | Evaluated | Missing rollback and config precedence decisions |
| Process and workflow errors (07) | 1 | Evaluated | SessionEnd best-effort needs async fallback |
| Communication errors (08) | 1 | Evaluated | Test commands not anchored to actual tooling |
| Design and specification errors (09) | 1 | Evaluated | Transcript parsing approach needs a precise spec |

## Health score calculation

This score uses the default rubric from the evaluator:

```
Health score = 100 - (High × 10) - (Medium × 5) - (Low × 2)
```

Calculated score:

- High: 2 → -20
- Medium: 3 → -15
- Low: 2 → -4

**Your score:** 61/100

## Recommendations

This section lists the minimum changes that most improve the plan.

1. **Immediate (high):** Add an early Gemini CLI “schema validation POC” for
   extension manifest, hooks config, and templating.
2. **Immediate (high):** Replace transcript format detection with a robust
   parse-first strategy and expand content extraction to handle mixed blocks.
3. **Short-term (medium):** Document and validate per-hook stdin and stdout
   contracts (required vs optional keys), and add a debug logging mode.
4. **Short-term (medium):** Add an asynchronous finalization workflow so
   summaries and completion are reliable despite `SessionEnd` best-effort.
5. **Short-term (medium):** Pick a single configuration surface (extension or
   user settings) and add rollback instructions.

## Evaluation details

This section records evaluation metadata for later comparison.

- **Taxonomy version:** 2026.01
- **Categories evaluated:** 9
- **Interactive mode:** Disabled
- **Plan source:** `/Users/rk/.claude/plans/hashed-toasting-book.md`

