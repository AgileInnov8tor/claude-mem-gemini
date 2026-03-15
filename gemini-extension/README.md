# gemini-mem for Gemini CLI

Persistent memory for Gemini CLI sessions. Captures tool-use observations and injects relevant context at session start.

## Installation

```bash
# From GitHub (once published)
gemini extensions install github:AgileInnov8tor/claude-mem-gemini

# Local development
gemini extensions link ~/01_projects/claude-mem-gemini/gemini-extension
```

## How It Works

- **SessionStart**: Worker starts, past context injected into session
- **BeforeAgent**: Session initialized (deduped — safe to fire every turn)
- **AfterTool**: Tool observations captured and stored
- **SessionEnd**: Session summarized (best-effort — CLI won't wait)

## Memory Search

Use the MCP tools directly in Gemini CLI:
- `mcp-search search` — Full-text search
- `mcp-search timeline` — Recent session history
- `mcp-search get_observations` — Get full observation details

View observations at: http://localhost:37777

## Requirements

- Node.js
- Bun (auto-installed by worker on first run)

## Configuration

Settings in `~/.claude-mem/settings.json` (shared with Claude Code).

## Disable / Uninstall

```bash
gemini extensions disable gemini-mem   # Keep files, stop hooks
gemini extensions uninstall gemini-mem # Full removal
```
