import { readFileSync, existsSync } from 'fs';
import { logger } from '../utils/logger.js';

/**
 * Extract last message of specified role from transcript file
 * Supports both Claude Code (JSONL) and Gemini CLI (JSON) formats.
 * @param transcriptPath Path to transcript file
 * @param role 'user' or 'assistant'
 * @param stripSystemReminders Whether to remove <system-reminder> tags (for assistant)
 */
export function extractLastMessage(
  transcriptPath: string,
  role: 'user' | 'assistant',
  stripSystemReminders: boolean = false
): string {
  if (!transcriptPath || !existsSync(transcriptPath)) {
    throw new Error(`Transcript path missing or file does not exist: ${transcriptPath}`);
  }

  const content = readFileSync(transcriptPath, 'utf-8').trim();
  if (!content) {
    throw new Error(`Transcript file exists but is empty: ${transcriptPath}`);
  }

  // Detect format: Gemini CLI uses a single JSON object with a "messages" array.
  // Valid JSONL with multiple lines will fail full JSON.parse().
  try {
    const parsed = JSON.parse(content);
    if (parsed && Array.isArray(parsed.messages)) {
      return extractFromGeminiJson(parsed, role, stripSystemReminders);
    }
  } catch (e) {
    // If JSON.parse fails, it's likely JSONL format. Fall through to existing logic.
  }

  // Claude Code / JSONL logic
  const lines = content.split('\n');
  let foundMatchingRole = false;

  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const line = JSON.parse(lines[i]);
      if (line.type === role) {
        foundMatchingRole = true;

        if (line.message?.content) {
          let text = '';
          const msgContent = line.message.content;

          if (typeof msgContent === 'string') {
            text = msgContent;
          } else if (Array.isArray(msgContent)) {
            text = msgContent
              .filter((c: any) => c.type === 'text')
              .map((c: any) => c.text)
              .join('\n');
          } else {
            // Unknown content format - throw error
            throw new Error(`Unknown message content format in transcript. Type: ${typeof msgContent}`);
          }

          if (stripSystemReminders) {
            text = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
            text = text.replace(/\n{3,}/g, '\n\n').trim();
          }

          // Return text even if empty - caller decides if that's an error
          return text;
        }
      }
    } catch (e) {
      // Skip malformed lines
      continue;
    }
  }

  // If we searched the whole transcript and didn't find any message of this role
  return '';
}

/**
 * Helper to extract message from Gemini CLI JSON format
 */
function extractFromGeminiJson(parsed: any, role: 'user' | 'assistant', strip: boolean): string {
  const roleMap: Record<string, string> = { 'gemini': 'assistant', 'user': 'user' };
  const messages = parsed.messages ?? [];
  
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (roleMap[msg.type] === role) {
      // content is an array — safely extract text entries only
      const parts = Array.isArray(msg.content) ? msg.content : [];
      let text = parts
        .filter((p: any) => typeof p === 'object' && typeof p.text === 'string')
        .map((p: any) => p.text)
        .join('\n');
        
      if (strip) {
        text = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '');
        text = text.replace(/\n{3,}/g, '\n\n').trim();
      }
      return text;
    }
  }
  return '';
}
