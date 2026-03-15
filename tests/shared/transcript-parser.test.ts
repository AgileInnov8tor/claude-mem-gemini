import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, unlinkSync } from 'fs';
import { extractLastMessage } from '../../src/shared/transcript-parser.js';

describe('transcript-parser', () => {
  const TEST_FILE = '/tmp/test-transcript.json';

  afterEach(() => {
    try {
      unlinkSync(TEST_FILE);
    } catch {}
  });

  describe('Claude Code (JSONL) format', () => {
    it('should extract last assistant message', () => {
      const content = 
        JSON.stringify({ type: 'user', message: { content: 'hello' } }) + '\n' +
        JSON.stringify({ type: 'assistant', message: { content: 'hi there' } }) + '\n' +
        JSON.stringify({ type: 'user', message: { content: 'how are you?' } });
      writeFileSync(TEST_FILE, content);

      expect(extractLastMessage(TEST_FILE, 'assistant')).toBe('hi there');
    });

    it('should extract last user message', () => {
      const content = 
        JSON.stringify({ type: 'user', message: { content: 'first' } }) + '\n' +
        JSON.stringify({ type: 'user', message: { content: 'second' } });
      writeFileSync(TEST_FILE, content);

      expect(extractLastMessage(TEST_FILE, 'user')).toBe('second');
    });

    it('should handle array content', () => {
      const content = JSON.stringify({ 
        type: 'assistant', 
        message: { 
          content: [
            { type: 'text', text: 'part 1' },
            { type: 'text', text: 'part 2' }
          ] 
        } 
      });
      writeFileSync(TEST_FILE, content);

      expect(extractLastMessage(TEST_FILE, 'assistant')).toBe('part 1\npart 2');
    });
  });

  describe('Gemini CLI (JSON) format', () => {
    it('should detect Gemini JSON format and extract last gemini message', () => {
      const transcript = {
        messages: [
          { type: 'user', content: [{ text: 'u1' }] },
          { type: 'gemini', content: [{ text: 'g1' }] },
          { type: 'user', content: [{ text: 'u2' }] },
          { type: 'gemini', content: [{ text: 'g2' }] }
        ]
      };
      writeFileSync(TEST_FILE, JSON.stringify(transcript));

      expect(extractLastMessage(TEST_FILE, 'assistant')).toBe('g2');
    });

    it('should extract last user message from Gemini JSON', () => {
      const transcript = {
        messages: [
          { type: 'user', content: [{ text: 'u1' }] },
          { type: 'gemini', content: [{ text: 'g1' }] }
        ]
      };
      writeFileSync(TEST_FILE, JSON.stringify(transcript));

      expect(extractLastMessage(TEST_FILE, 'user')).toBe('u1');
    });

    it('should handle mixed content types in Gemini JSON', () => {
      const transcript = {
        messages: [
          { 
            type: 'gemini', 
            content: [
              { text: 'thought' },
              { tool_use: { name: 'ls' } }, // should be ignored
              { text: 'result' }
            ] 
          }
        ]
      };
      writeFileSync(TEST_FILE, JSON.stringify(transcript));

      expect(extractLastMessage(TEST_FILE, 'assistant')).toBe('thought\nresult');
    });

    it('should strip system reminders in Gemini JSON', () => {
      const transcript = {
        messages: [
          { 
            type: 'gemini', 
            content: [{ text: 'header\n<system-reminder>ignore me</system-reminder>\nfooter' }] 
          }
        ]
      };
      writeFileSync(TEST_FILE, JSON.stringify(transcript));

      expect(extractLastMessage(TEST_FILE, 'assistant', true)).toBe('header\n\nfooter');
    });
  });

  describe('Edge cases', () => {
    it('should return empty string if role not found', () => {
      const content = JSON.stringify({ type: 'user', message: { content: 'hello' } });
      writeFileSync(TEST_FILE, content);

      expect(extractLastMessage(TEST_FILE, 'assistant')).toBe('');
    });

    it('should throw if file does not exist', () => {
      expect(() => extractLastMessage('/tmp/nonexistent.json', 'user')).toThrow();
    });

    it('should throw if file is empty', () => {
      writeFileSync(TEST_FILE, '');
      expect(() => extractLastMessage(TEST_FILE, 'user')).toThrow();
    });
  });
});
