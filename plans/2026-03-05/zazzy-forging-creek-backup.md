# Plan: claude-mem → totalmem (Rename + MCP-First Architecture)

## Context

claude-mem is being forked as **totalmem** — a platform-agnostic persistent memory layer for AI coding CLIs (Claude Code, Gemini CLI, Codex CLI, QWEN CLI). This is a fork under `totalmem-ai/totalmem`, not replacing upstream `thedotmack/claude-mem`.

The rename is combined with an architectural shift: **MCP server becomes the primary interface**, with CLI-specific plugin wrappers as optional adapters. This makes totalmem natively usable by any MCP-compatible client without requiring platform-specific plugin installation.

## Architecture: Current vs Target

```
CURRENT (Claude-plugin-first):                TARGET (MCP-first):
.claude-plugin/plugin.json  ← entry point     packages/core/         ← MCP server (universal)
plugin/hooks/hooks.json     ← Claude hooks     packages/cli-adapters/
plugin/skills/*/SKILL.md    ← Claude skills      ├── claude-plugin/   ← .claude-plugin + hooks
gemini-extension/           ← separate copy       ├── gemini-ext/      ← gemini-extension.json
cursor-hooks/               ← separate copy       ├── cursor-hooks/    ← cursor hooks
                                                   └── qwen-ext/       ← future
Worker (localhost:37777)    ← already generic   Worker (localhost:37777)  ← unchanged
MCP server (7 tools only)   ← thin proxy       MCP server (tools + prompts + resources)
```

## Key Decisions

| Decision | Choice |
|----------|--------|
| GitHub org/repo | `totalmem-ai/totalmem` |
| Data directory | **Keep `~/.claude-mem/`** for v1 (v2 milestone: `~/.totalmem/` with symlink compat) |
| Env var prefix | `TOTALMEM_` with `CLAUDE_MEM_` fallback |
| MCP server package | `@totalmem/server` |
| Marketplace namespace | `totalmem-ai` |
| Docs domain | `docs.totalmem.ai` |
| Chroma prefix | Keep `cm__` (no re-embedding) |
| DB filename | Keep `claude-mem.db` |

## Risk Register

| ID | Risk | Sev | Mitigation | Contingency Trigger |
|----|------|-----|------------|---------------------|
| R1 | Phase 1 restructure breaks hundreds of paths | High | Incremental move (7 sub-steps), green baseline, test after each | >20 test failures after a single move step → `git reset HEAD~1` |
| R2 | `sd` bulk rename false positives | Med | Word-boundary regex, exclusion list, mandatory `git diff` review | Any external URL or dep name corrupted → `git reset HEAD~1`, refine regex |
| R3 | Qwen/Codex CLI config formats unknown | High | Phase 0a research gate blocks Phase 6 | Docs not found → defer those CLIs to future release |
| R4 | MCP SDK lacks prompts/resources support | Med | Phase 0a: verify `npm ls @modelcontextprotocol/sdk` version | SDK too old → upgrade first; clients don't consume → defer Phase 2 resources |
| R5 | Workspace cross-package imports fail | Med | Explicit dependency graph + `workspace:*` protocol in Phase 1 | TypeScript project references fail → fallback to path aliases |
| R6 | CI/CD pipelines break after restructure | High | Add `.github/workflows/` to Phase 1 critical files; test branch push in Phase 7 | CI fails on first push → hotfix in Phase 1 |
| R7 | Effort overrun (monorepo restructures routinely 2x estimates) | Med | Three-point estimate; Phase 1 budgeted at 4-6h, not 2.5h | Hitting P90 → re-scope: defer Phase 6 to separate PR |

## Effort Estimate (Three-Point)

| Scenario | Hours | Notes |
|----------|-------|-------|
| P10 (optimistic) | 12h | Everything works first try, no workspace issues |
| **P50 (expected)** | **18h** | Normal debugging, some path issues in Phase 1 |
| P90 (conservative) | 28h | Workspace hoisting conflicts, CI rework, MCP SDK upgrade |

**Plan at P50. Commit at P90.** If hitting P90, descope Phase 6 (multi-CLI installer) to a separate follow-up.

| Phase | P10 | P50 | P90 |
|-------|-----|-----|-----|
| Phase 0 (research + baseline) | 1h | 2h | 3h |
| Phase 1 (restructure) | 3h | 5h | 8h |
| Phase 2 (MCP enhance) | 1.5h | 2.5h | 4h |
| Phase 3 (rename core) | 1.5h | 2.5h | 4h |
| Phase 4 (rename branding) | 1h | 1.5h | 2h |
| Phase 5 (rename docs) | 1.5h | 2h | 3h |
| Phase 6 (installer) | 1.5h | 2h | 3h |
| Phase 7 (tests + validation) | 1h | 1.5h | 2h |

## Phases

### Phase 0: Research Gate + Green Baseline

**0a. Validate prerequisites** (blocks Phases 2 and 6)

CLI config schemas — research and document actual MCP config format per CLI:
- **Qwen CLI**: Find `~/.qwen/` config structure, MCP server declaration format
- **Codex CLI**: Find config location, MCP server declaration format
- **Gemini CLI**: Already validated — `~/.gemini/settings.json` with `mcpServers` key
- **Claude Code**: Already validated — `~/.claude/settings.json` with `mcpServers` key
- **Cursor**: Already validated — `.cursor/mcp.json` or UI

MCP SDK capability check:
- Run `npm ls @modelcontextprotocol/sdk` to confirm version
- Verify: does the SDK version support `prompts` and `resources` capabilities?
- Verify: do Gemini CLI and Cursor MCP clients call `prompts/list` and `resources/list`?

**Output**: CLI config table + MCP SDK version confirmation.
**Gate**: Phase 6 blocked until CLI table complete. Phase 2 blocked until SDK capabilities confirmed. Unvalidated CLIs shown as "coming soon."

**0b. Establish green baseline**
- Run `npm test` and `npm run build` — record test count, pass/fail
- Run actual file counts to calibrate scope:
  ```bash
  rg "\bCLAUDE_MEM_" --type ts --type js -c | wc -l    # env var files
  rg "docs\.claude-mem\.ai" -c | wc -l                  # docs domain files
  rg "\bclaude-mem\b" --type ts --type js --type json -c | wc -l  # total source files
  ```
- Fix any failing tests before proceeding
- Tag: `git tag pre-totalmem-baseline`

### Phase 1: Monorepo Restructure

Incremental moves, each with own commit + test run.

**Package Dependency Graph:**
```
@totalmem/core     — no internal deps, builds first
  ├── packages/installer/           — imports core settings types
  ├── packages/cli-adapters/claude-plugin/  — depends on core (worker-service.cjs, mcp-server.cjs)
  ├── packages/cli-adapters/gemini-ext/     — depends on core (same built scripts)
  ├── packages/cli-adapters/cursor-hooks/   — depends on core (worker-service.cjs)
  └── packages/cli-adapters/openclaw/       — depends on core (worker HTTP API)
```

**Workspace protocol**: Each adapter's `package.json` declares `"@totalmem/core": "workspace:*"`. Root `package.json` uses npm/bun workspaces. TypeScript uses `tsc -b` with project references (`tsconfig.json` `references` array). If project references fail, fallback to `paths` aliases in `tsconfig.json`.

**Execution order** (each step = own commit + test):

| Step | Action | Test gate |
|------|--------|-----------|
| 1.1 | Create empty `packages/` directory structure | `npm test` (no change expected) |
| 1.2 | Move `src/` → `packages/core/src/`, update `tsconfig.json` paths | `npm test` |
| 1.3 | Move `plugin/` → `packages/cli-adapters/claude-plugin/`, update `hooks.json` script paths, `sync-marketplace.cjs`, `build-hooks.js` | `npm test` |
| 1.4 | Move `gemini-extension/` → `packages/cli-adapters/gemini-ext/`, update hook paths | `npm test` |
| 1.5 | Move `cursor-hooks/` → `packages/cli-adapters/cursor-hooks/` | `npm test` |
| 1.6 | Move `openclaw/` → `packages/cli-adapters/openclaw/` | `npm test` |
| 1.7 | Move `installer/` → `packages/installer/` | `npm test` |
| 1.8 | Update root `package.json` workspaces, add workspace protocol to adapter `package.json` files, update `.github/workflows/*.yml` CI paths | `npm test` + `npm run build` |

**Critical files per step:**
- Step 1.2: `tsconfig.json` path mappings
- Step 1.3: `scripts/sync-marketplace.cjs`, `scripts/build-hooks.js`, `plugin/hooks/hooks.json` (script paths reference `../../plugin/scripts/`)
- Step 1.4: `gemini-extension/hooks/hooks.json`
- Step 1.8: Root `package.json` workspaces, `.github/workflows/*.yml` CI paths

**Rollback**: If any step breaks >20 tests → `git reset HEAD~1`, diagnose, try smaller move.

### Phase 2: MCP Server Enhancement (gated by Phase 0a SDK check)

**IMPORTANT**: Phase 2 writes all new code using **new names** (`totalmem`) from the start. This avoids Phase 3's bulk rename touching Phase 2's code.

**2a. Add MCP Prompts** (replaces SKILL.md for non-Claude clients)
- File: `packages/core/src/servers/mcp-server.ts`
- Add `prompts` capability to server initialization
- Register `prompts/list` and `prompts/get` handlers
- Prompt schema mapping from SKILL.md:
  - `name`: derive from skill directory name (e.g., `totalmem-search`)
  - `description`: use SKILL.md YAML frontmatter `description:` field
  - `messages`: single `user` role message with SKILL.md content body (frontmatter stripped)
  - `arguments`: none (static prompts, no user arguments)
- Prompts exposed:
  - `totalmem-search` (from `mem-search/SKILL.md`)
  - `totalmem-plan` (from `make-plan/SKILL.md`)
  - `totalmem-execute` (from `do/SKILL.md`)
  - `totalmem-explore` (from `smart-explore/SKILL.md`)
- Claude Code adapter continues to use SKILL.md directly (unchanged behavior)

**2b. Add MCP Resources** (optional, for rich clients)
- Register `resources/list` and `resources/read` handlers
- Resource definitions:

| URI | Worker endpoint | MIME type | Fallback |
|-----|----------------|-----------|----------|
| `totalmem://context/{project}` | `GET http://localhost:{port}/api/context/inject?projects={project}` | `text/plain` | Empty string if worker unavailable |
| `totalmem://sessions/recent` | `GET http://localhost:{port}/api/search/sessions?limit=10` | `application/json` | Empty array `[]` if worker unavailable |

- MCP server reads `getWorkerPort()` from settings for the HTTP base URL
- On worker connection failure: return empty content (not MCP error), log warning

**2c. Rename MCP server identity**
- Server name: `claude-mem` → `totalmem`
- Chroma MCP client: `claude-mem-chroma` → `totalmem-chroma`

### Phase 3: Rename — Core Identity (SEQUENTIAL, after Phase 2)

Mechanical find-replace. **Rename validation protocol**: after each `sd` batch, run `git diff` and manually review for false positives. **Rollback rule**: if `npm test` fails after a rename commit, `git reset HEAD~1` immediately. Refine regex and retry. Never commit partial-rename state.

**Targeted regex patterns** (word boundaries, not bare string):
- `\bclaude-mem\b` → `totalmem` (hyphenated identifiers)
- `\bCLAUDE_MEM_` → `TOTALMEM_` (env var prefix)
- `\bclaudeMem\b` → `totalMem` (camelCase)
- `\bClaudeMem\b` → `TotalMem` (PascalCase)
- `\bclaude_mem\b` → `totalmem` (underscore)
- `\bthedotmack\b` → `totalmem-ai` (marketplace namespace)

**Exclusion list** (do NOT rename):
- `~/.claude-mem/` data directory path references (intentionally kept)
- `claude-mem.db` database filename references (intentionally kept)
- `cm__` Chroma collection prefix
- External URLs to upstream `thedotmack/claude-mem` in CHANGELOG attribution
- Third-party package names or imports
- Phase 2's new code (already uses new names)

**3a. Environment Variable Migration Layer**
- File: `packages/core/src/shared/SettingsDefaultsManager.ts`
- Rename all 30+ keys: `CLAUDE_MEM_*` → `TOTALMEM_*` in the defaults map
- Add fallback resolver: `process.env[`TOTALMEM_${key}`] ?? process.env[`CLAUDE_MEM_${key}`]`
- Log deprecation warning (once per session) when any `CLAUDE_MEM_*` var is detected
- Update all files importing these constants
- **Test**: unit test for settings loading from both `TOTALMEM_*` and `CLAUDE_MEM_*`

**3b. Plugin Identity**
- Plugin name: `claude-mem` → `totalmem`
- Plugin key: `claude-mem@thedotmack` → `totalmem@totalmem-ai`
- Files: `.claude-plugin/*.json`, `plugin-state.ts`, `bun-runner.js`, `smart-install.js`
- Installer: `install.ts`, `welcome.ts`, `worker.ts`

**3c. Package Names**
- Root: `"name": "totalmem"`
- Core/MCP server: `"name": "@totalmem/server"`
- Plugin: `"name": "totalmem-plugin"`
- Installer: `"name": "totalmem-installer"`, bin: `totalmem-installer`
- OpenClaw: `"name": "@openclaw/totalmem"`

**3d. Marketplace Paths**
- `paths.ts`: `marketplaces/thedotmack` → `marketplaces/totalmem-ai`
- `sync-marketplace.cjs`, all installer references

### Phase 4: Rename — Branding & Tags (parallel with Phase 5)

**Rollback rule**: Same as Phase 3 — `git reset HEAD~1` on test failure, refine, retry.

**4a. XML Context Tags**
- `<claude-mem-context>` → `<totalmem-context>` in:
  - `claude-md-utils.ts`, `tag-stripping.ts`, `context-file-commands.ts`
- **Stale tag handling**: Add to tag-stripping regex: accept BOTH `<claude-mem-context>` and `<totalmem-context>` as valid during transition. Old tags cleaned up on next context regeneration.
- **v2 milestone**: `totalmem migrate-context` utility to scan projects and update stale tags

**4b. UI Branding**
- localStorage: `claude-mem-theme` → `totalmem-theme`
- Logo files: `claude-mem-logomark.webp` → `totalmem-logomark.webp`
- Cursor: `claude-mem-context.mdc` → `totalmem-context.mdc`
- Log prefix: `claude-mem-*.log` → `totalmem-*.log`

**4c. OpenClaw**
- Commands: `claude_mem_*` → `totalmem_*`
- Types: `ClaudeMemPluginConfig` → `TotalMemPluginConfig`
- Functions: `claudeMemPlugin` → `totalMemPlugin`
- `install.sh`: all variable renames

### Phase 5: Rename — Documentation & URLs (parallel with Phase 4)

- `docs.claude-mem.ai` → `docs.totalmem.ai` (~47 files)
- `github.com/thedotmack/claude-mem` → `github.com/totalmem-ai/totalmem` (~60 files)
- README.md full rebrand including logo URLs
- All `docs/i18n/README.*.md` translations (~25 files)
- CHANGELOG.md: add fork/rename note at top, preserve upstream `thedotmack` attribution
- Bug templates, cursor-hooks README
- **First-run output**: add note explaining `~/.claude-mem/` data dir naming for non-Claude users

### Phase 6: Multi-CLI Installer (gated by Phase 0a + Phase 5)

**6a. IDE Selection** (`packages/installer/src/steps/ide-selection.ts`)
- Add validated options: `gemini-cli` (validated), plus any CLIs confirmed in Phase 0a
- Keep `claude-code`, `cursor` as existing
- Unvalidated CLIs shown as "coming soon" (not selectable)

**6b. MCP Registration per CLI**

| CLI | Config file | MCP entry format | Status |
|-----|------------|------------------|--------|
| Claude Code | `~/.claude/settings.json` | `mcpServers.totalmem` | Validated |
| Gemini CLI | `~/.gemini/settings.json` | `mcpServers.totalmem` | Validated |
| Cursor | `.cursor/mcp.json` | `mcpServers.totalmem` | Validated |
| Qwen CLI | TBD (Phase 0a) | TBD | Blocked |
| Codex | TBD (Phase 0a) | TBD | Blocked |

Each writes a stdio MCP server entry pointing to local install of `@totalmem/server`.

**6c. Claude-specific extras** (only when `claude-code` selected)
- Register marketplace + plugin (existing logic)
- Install hooks via `hooks.json`
- Install skills as SKILL.md files

**6d. Gemini-specific extras** (only when `gemini-cli` selected)
- Copy `gemini-extension.json` to `~/.gemini/extensions/`
- Install hooks via gemini `hooks.json`
- Generate `GEMINI.md` context file

### Phase 7: Tests & Build

- Update all test assertions referencing old names
- Key test files:
  - `tests/utils/claude-md-utils.test.ts` — context tags (including dual-tag acceptance)
  - `tests/infrastructure/plugin-disabled-check.test.ts` — plugin key
  - `tests/cursor-mcp-config.test.ts` — MCP server name
  - `tests/services/sqlite/PendingMessageStore.test.ts` — class name
- **New tests**:
  - Env var fallback: `CLAUDE_MEM_*` → `TOTALMEM_*` with deprecation warning
  - MCP `prompts/list` returns 4 prompts
  - MCP `resources/list` returns 2 resources
  - MCP `resources/read` returns empty on worker unavailable (not error)
- Run full test suite: `npm test` — compare count against Phase 0b baseline (must be ≥)
- Rebuild all bundles: `npm run build-and-sync`
- **CI verification**: push to a test branch, confirm `.github/workflows/` runs green

## Subagent Execution Model

When using parallel subagents for Phases 4+5:

| Agent | Owns files in | Must NOT touch |
|-------|--------------|----------------|
| Agent A (Phase 4) | `packages/core/src/utils/`, `packages/core/src/ui/`, `packages/cli-adapters/openclaw/`, `packages/cli-adapters/cursor-hooks/` | `docs/`, `README.md`, root config files |
| Agent B (Phase 5) | `docs/`, `README.md`, `CHANGELOG.md`, `docs/i18n/`, bug templates | `src/`, `packages/core/`, root config files |

Root config files (`package.json`, `tsconfig.json`) are **single-owner** — assigned to Phase 3 only. Phases 4+5 do not modify them.

If subagents are used for Phases 4+5, each works on a **separate branch**. Review + merge sequentially into the main work branch.

## Files NOT Changed

- `~/.claude-mem/` data directory path (v1 — see v2 milestone)
- `claude-mem.db` database filename
- `cm__` Chroma collection prefix
- Worker port 37777

## Milestone Dependencies

```
Phase 0a (research) ────────────────────────────────────┐
Phase 0b (baseline) ──┐                                 │
                      ▼                                  │
Phase 1 (restructure) ──┐                               │
                        ▼                                │
              Phase 2 (MCP enhance, uses new names) ─┐   │
                                                     ▼   │
              Phase 3 (rename core) ─────────────────┐   │
                                                     ▼   │
                            ┌── Phase 4 (branding)   │   │
                            │                        │   │
                            └── Phase 5 (docs) ──────┤   │
                                                     ▼   ▼
                            Phase 7 (tests) ◄── Phase 6 (installer)
```

**Ordering rationale**: Phase 2 writes new code using new names → Phase 3 renames old code → Phases 4+5 are purely branding/docs (safe to parallelize). Phase 6 depends on both Phase 0a research and Phase 5 completion.

## Verification

1. `rg "\bclaude-mem\b" packages/ --type ts --type js --type json` — 0 hits (except data dir/db path constants + upstream attribution)
2. `npm test` — all pass, count ≥ Phase 0b baseline
3. `npm run build-and-sync` — clean build
4. `node packages/core/dist/mcp-server.js` starts MCP server
5. MCP `tools/list` returns 7+ tools
6. MCP `prompts/list` returns 4 skill prompts (`totalmem-search`, etc.)
7. MCP `resources/list` returns 2 resources (`totalmem://context/*`, `totalmem://sessions/recent`)
8. Worker at localhost:37777, viewer loads with totalmem branding
9. Context injection uses `<totalmem-context>` tags
10. `CLAUDE_MEM_WORKER_PORT=37778 npm start` — fallback env var works with deprecation log
11. **CI green**: push test branch, `.github/workflows/` passes

## v2 Milestones (Out of Scope for This Plan)

- `~/.totalmem/` data directory with backward-compat symlink from `~/.claude-mem/`
- `totalmem migrate-context` utility for stale tag cleanup across projects
- Qwen CLI and Codex CLI installer support (pending Phase 0a research)
