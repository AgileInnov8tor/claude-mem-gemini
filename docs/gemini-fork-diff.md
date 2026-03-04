# Gemini Fork Diff — Upstream Change Audit

**Fork:** AgileInnov8tor/claude-mem-gemini
**Upstream:** thedotmack/claude-mem
**Date:** 2026-03-05
**Purpose:** Document the minimal changeset added by this fork to ease monthly rebasing.

---

## Modified Upstream Files (6 files)

These files exist in upstream and were modified by the fork.
When rebasing, conflicts will only appear in these files.

| File | +Added | -Removed | Summary |
|------|--------|----------|---------|
| `src/cli/adapters/index.ts` | +3 | -1 | Register Gemini CLI adapter |
| `src/cli/handlers/session-init.ts` | +4 | -2 | Detect Gemini environment at session start |
| `src/shared/transcript-parser.ts` | ~50 | ~45 | Add Gemini transcript format parsing |
| `src/services/worker-service.ts` | ~500 | ~422 | Add `generate-gemini` route, context-file rename |
| `src/cli/handlers/context.ts` | ~45 | ~36 | Context file command rename (claude-md → context-file) |
| `src/utils/logger.ts` | ~120 | ~82 | Add CONTEXT_FILE component (was CLAUDE_MD) |

### Key Rename (Fork Only)

`src/cli/claude-md-commands.ts` → `src/cli/context-file-commands.ts`
All exported functions renamed: `generateClaudeMd` → `generateContextFile`, `cleanClaudeMd` → `cleanContextFiles`

> **Note:** Upstream still uses the old name `claude-md-commands.ts`. This rename is fork-only.
> When merging upstream, re-apply the rename or keep both and re-export.

---

## New Additive Files (Gemini-only, no upstream conflict)

These files are purely additive — not present in upstream. No rebase conflicts expected.

### Extension
```
gemini-extension/
  gemini-extension.json   # Extension manifest
  GEMINI.md               # Gemini API integration spec
  README.md               # Extension docs
  hooks/
    hooks.json            # Gemini lifecycle hook definitions
```

### Source
```
src/cli/adapters/gemini-cli.ts        # Gemini CLI adapter implementation
src/cli/context-file-commands.ts      # Renamed from claude-md-commands.ts (fork-only rename)
```

### Tests
```
tests/cli/adapters/gemini-cli.test.ts              # Adapter unit tests
tests/shared/transcript-parser-gemini.test.ts      # Gemini transcript parser tests
tests/shared/transcript-parser.test.ts             # General transcript parser tests
tests/shared/settings-defaults-manager.test.ts     # Settings tests
tests/shared/timeline-formatting.test.ts           # Timeline formatting tests
```

---

## Merge Policy

**Schedule:** Pull from upstream monthly (first week of each month)

**Procedure:**
1. `git fetch upstream main`
2. `git rebase upstream/main`
3. Resolve conflicts in the **6 modified files** above only
4. New Gemini files are additive — no conflicts expected
5. Re-verify: `grep -c 'generateContextFile' plugin/scripts/worker-service.cjs` (must be ≥ 1)
6. Run `npm run build` to regenerate `.cjs` bundles
7. Run Gemini extension smoke test: `gemini extensions link ./gemini-extension`

**Known conflict zones:**
- `worker-service.ts` — largest diff; the `generate-gemini` case block is the key addition
- `transcript-parser.ts` — Gemini format detection added near bottom of `detectFormat()`
- `logger.ts` — `CONTEXT_FILE` component type added to enum

---

## Full Diff

Full patch captured at: `/tmp/upstream-diff.txt`
(Regenerate: `git diff -- src/cli/adapters/index.ts src/cli/handlers/session-init.ts src/shared/transcript-parser.ts src/services/worker-service.ts src/cli/handlers/context.ts src/utils/logger.ts > /tmp/upstream-diff.txt`)
