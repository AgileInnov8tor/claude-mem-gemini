import { describe, test, expect } from "bun:test";
import { writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { extractLastMessage } from "../../src/shared/transcript-parser.js";

function writeTmp(name: string, content: string): string {
  const dir = join(tmpdir(), "transcript-parser-tests");
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, name);
  writeFileSync(filePath, content);
  return filePath;
}

describe("transcript-parser: Gemini JSON format", () => {
  test("detects Gemini JSON format (full-file JSON.parse succeeds with messages array)", () => {
    const transcript = JSON.stringify({
      sessionId: "abc",
      messages: [
        { id: "1", type: "user", content: [{ text: "Hello" }] },
        { id: "2", type: "gemini", content: [{ text: "Hi there!" }] },
      ],
    });
    const path = writeTmp("gemini-format.json", transcript);
    const result = extractLastMessage(path, "assistant");
    expect(result).toBe("Hi there!");
  });

  test('maps type "gemini" to role "assistant"', () => {
    const transcript = JSON.stringify({
      messages: [
        { type: "user", content: [{ text: "Question" }] },
        { type: "gemini", content: [{ text: "Answer" }] },
      ],
    });
    const path = writeTmp("gemini-mapping.json", transcript);
    expect(extractLastMessage(path, "assistant")).toBe("Answer");
    expect(extractLastMessage(path, "user")).toBe("Question");
  });

  test("extracts last message (multiple gemini turns)", () => {
    const transcript = JSON.stringify({
      messages: [
        { type: "gemini", content: [{ text: "First response" }] },
        { type: "user", content: [{ text: "Follow-up" }] },
        { type: "gemini", content: [{ text: "Second response" }] },
      ],
    });
    const path = writeTmp("gemini-multi.json", transcript);
    expect(extractLastMessage(path, "assistant")).toBe("Second response");
  });

  test("joins multiple text parts in content array", () => {
    const transcript = JSON.stringify({
      messages: [
        { type: "gemini", content: [{ text: "Part 1" }, { text: "Part 2" }] },
      ],
    });
    const path = writeTmp("gemini-parts.json", transcript);
    expect(extractLastMessage(path, "assistant")).toBe("Part 1\nPart 2");
  });

  test("ignores non-text entries in content array", () => {
    const transcript = JSON.stringify({
      messages: [
        {
          type: "gemini",
          content: [{ functionCall: { name: "foo" } }, { text: "Actual text" }],
        },
      ],
    });
    const path = writeTmp("gemini-mixed.json", transcript);
    expect(extractLastMessage(path, "assistant")).toBe("Actual text");
  });

  test("returns empty string when no matching role found", () => {
    const transcript = JSON.stringify({
      messages: [{ type: "user", content: [{ text: "Only user message" }] }],
    });
    const path = writeTmp("gemini-no-assistant.json", transcript);
    expect(extractLastMessage(path, "assistant")).toBe("");
  });
});

describe("transcript-parser: JSONL format (Claude Code)", () => {
  test("detects JSONL format (full-file JSON.parse fails, falls back to line-by-line)", () => {
    const lines = [
      JSON.stringify({ type: "user", message: { content: "Hello" } }),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "World" }] },
      }),
    ].join("\n");
    const path = writeTmp("claude-format.jsonl", lines);
    expect(extractLastMessage(path, "assistant")).toBe("World");
  });

  test("handles string content in JSONL", () => {
    const lines = [
      JSON.stringify({
        type: "assistant",
        message: { content: "Plain string response" },
      }),
    ].join("\n");
    const path = writeTmp("claude-string.jsonl", lines);
    expect(extractLastMessage(path, "assistant")).toBe("Plain string response");
  });

  test("skips malformed lines in JSONL", () => {
    const content = [
      "not json at all",
      JSON.stringify({ type: "assistant", message: { content: "Valid" } }),
    ].join("\n");
    const path = writeTmp("claude-malformed.jsonl", content);
    expect(extractLastMessage(path, "assistant")).toBe("Valid");
  });
});

describe("transcript-parser: error cases", () => {
  test("throws on missing transcript path", () => {
    expect(() => extractLastMessage("", "assistant")).toThrow();
  });

  test("throws on non-existent file", () => {
    expect(() =>
      extractLastMessage("/tmp/does-not-exist-xyz.json", "assistant"),
    ).toThrow();
  });

  test("strips system-reminder tags when stripSystemReminders=true", () => {
    const transcript = JSON.stringify({
      messages: [
        {
          type: "gemini",
          content: [
            {
              text: "Real content\n<system-reminder>hidden</system-reminder>\nMore content",
            },
          ],
        },
      ],
    });
    const path = writeTmp("gemini-strip.json", transcript);
    const stripped = extractLastMessage(path, "assistant", true);
    expect(stripped).not.toContain("<system-reminder>");
    expect(stripped).toContain("Real content");
    expect(stripped).toContain("More content");
  });
});
