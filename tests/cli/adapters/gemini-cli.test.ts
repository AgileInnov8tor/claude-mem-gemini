import { describe, it, expect } from 'bun:test';
import { geminiCliAdapter } from '../../../src/cli/adapters/gemini-cli.js';

describe('geminiCliAdapter', () => {
  describe('normalizeInput', () => {
    it('should use session_id when present', () => {
      const input = geminiCliAdapter.normalizeInput({ session_id: 'gemini-123', cwd: '/tmp' });
      expect(input.sessionId).toBe('gemini-123');
    });

    it('should use GEMINI_SESSION_ID env var as fallback', () => {
      const original = process.env.GEMINI_SESSION_ID;
      process.env.GEMINI_SESSION_ID = 'env-session';
      try {
        const input = geminiCliAdapter.normalizeInput({ cwd: '/tmp' });
        expect(input.sessionId).toBe('env-session');
      } finally {
        process.env.GEMINI_SESSION_ID = original;
      }
    });

    it('should use GEMINI_PROJECT_DIR env var as fallback for cwd', () => {
      const original = process.env.GEMINI_PROJECT_DIR;
      process.env.GEMINI_PROJECT_DIR = '/project/root';
      try {
        const input = geminiCliAdapter.normalizeInput({ session_id: 's1' });
        expect(input.cwd).toBe('/project/root');
      } finally {
        process.env.GEMINI_PROJECT_DIR = original;
      }
    });

    it('should handle AfterTool specific fields', () => {
      const raw = {
        session_id: 's1',
        cwd: '/tmp',
        tool_name: 'read_file',
        tool_input: { path: 'README.md' },
        tool_response: { llmContent: 'file content' }
      };
      const input = geminiCliAdapter.normalizeInput(raw);
      expect(input.toolName).toBe('read_file');
      expect(input.toolInput).toEqual({ path: 'README.md' });
      expect(input.toolResponse).toEqual({ llmContent: 'file content' });
    });
  });

  describe('formatOutput', () => {
    it('should strip hookEventName and preserve additionalContext', () => {
      const result = {
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: 'important info'
        },
        systemMessage: 'hello user'
      };
      const output = geminiCliAdapter.formatOutput(result) as any;
      expect(output.hookSpecificOutput).toEqual({ additionalContext: 'important info' });
      expect(output.systemMessage).toBe('hello user');
      expect(output.hookSpecificOutput.hookEventName).toBeUndefined();
    });

    it('should default continue and suppressOutput to true', () => {
      const output = geminiCliAdapter.formatOutput({});
      expect(output).toEqual({ continue: true, suppressOutput: true });
    });
  });
});
