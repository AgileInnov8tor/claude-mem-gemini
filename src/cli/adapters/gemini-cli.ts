import type { PlatformAdapter } from "../types.js";

/**
 * Maps Gemini CLI stdin format (session_id, cwd, tool_name, etc.)
 * Note: formatOutput strips hookEventName as Gemini CLI only expects additionalContext.
 */
export const geminiCliAdapter: PlatformAdapter = {
  normalizeInput(raw) {
    const r = (raw ?? {}) as any;
    return {
      sessionId:
        r.session_id ?? process.env.GEMINI_SESSION_ID ?? r.id ?? r.sessionId,
      cwd:
        r.cwd ??
        process.env.GEMINI_PROJECT_DIR ??
        process.env.GEMINI_CWD ??
        process.cwd(),
      prompt: r.prompt,
      toolName: r.tool_name,
      toolInput: r.tool_input,
      toolResponse: r.tool_response,
      transcriptPath: r.transcript_path,
      platform: "gemini-cli",
    };
  },
  formatOutput(result) {
    if (result.hookSpecificOutput) {
      // Gemini CLI: no hookEventName needed, just additionalContext
      const output: Record<string, unknown> = {
        hookSpecificOutput: {
          additionalContext: result.hookSpecificOutput.additionalContext,
        },
      };
      if (result.systemMessage) {
        output.systemMessage = result.systemMessage;
      }
      return output;
    }
    return {
      continue: result.continue ?? true,
      suppressOutput: result.suppressOutput ?? true,
    };
  },
};
