# gemini-mem: Memory System

claude-mem is running and capturing observations from this session.

## Memory Search Workflow

To search past work history, use the MCP tools directly in conversation:

**1. Search by keyword:**
> "Use the mcp-search search tool to search for 'your topic'"

**2. View timeline:**
> "Use the mcp-search timeline tool to show recent activity"

**3. Get observation details:**
> "Use the mcp-search get_observations tool with IDs [1234, 1235]"

## Available MCP Tools

| Tool | Purpose |
|------|---------|
| `search` | Full-text search across past observations |
| `timeline` | Show chronological session history |
| `get_observations` | Fetch full detail for specific observation IDs |
| `smart_search` | Search with semantic understanding |
| `smart_outline` | Get file structure overview |
| `smart_unfold` | Expand specific code sections |

## Observation Viewer

View all captured observations live at: http://localhost:37777
