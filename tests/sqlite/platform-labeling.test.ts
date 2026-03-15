/**
 * Platform labeling tests
 * Tests platform attribution for multi-platform support (Claude Code, Gemini CLI, Cursor)
 *
 * Sources:
 * - src/services/sqlite/sessions/create.ts  — createSDKSession platform backfill
 * - src/services/sqlite/sessions/get.ts     — getSessionById, getSessionSummaryById
 * - src/services/sqlite/prompts/get.ts      — platform propagation via JOIN
 * - src/cli/adapters/gemini-cli.ts          — normalizeInput platform field
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ClaudeMemDatabase } from "../../src/services/sqlite/Database.js";
import {
  createSDKSession,
  getSessionById,
  getSessionSummaryById,
  updateMemorySessionId,
} from "../../src/services/sqlite/Sessions.js";
import {
  saveUserPrompt,
  getLatestUserPrompt,
  getAllRecentUserPrompts,
  getPromptById,
  getPromptsByIds,
  getUserPromptsByIds,
} from "../../src/services/sqlite/Prompts.js";
import { geminiCliAdapter } from "../../src/cli/adapters/gemini-cli.js";
import type { Database } from "bun:sqlite";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setupSession(
  db: Database,
  contentSessionId: string,
  opts: { platform?: string; project?: string } = {},
): number {
  return createSDKSession(
    db,
    contentSessionId,
    opts.project ?? "test-project",
    "test prompt",
    undefined,
    opts.platform,
  );
}

function setupSessionWithPrompt(
  db: Database,
  contentSessionId: string,
  opts: { platform?: string } = {},
): { sessionId: number; promptId: number } {
  const sessionId = setupSession(db, contentSessionId, opts);
  const promptId = saveUserPrompt(db, contentSessionId, 1, "test user prompt");
  return { sessionId, promptId };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Platform Labeling", () => {
  let db: Database;

  beforeEach(() => {
    db = new ClaudeMemDatabase(":memory:").db;
  });

  afterEach(() => {
    db.close();
  });

  // ── createSDKSession: new session ─────────────────────────────────────────

  describe("createSDKSession — new session platform", () => {
    it("should default platform to claude-code when no platform provided", () => {
      const sessionId = createSDKSession(
        db,
        "session-default",
        "project",
        "prompt",
      );
      const row = db
        .prepare("SELECT platform FROM sdk_sessions WHERE id = ?")
        .get(sessionId) as { platform: string };
      expect(row.platform).toBe("claude-code");
    });

    it("should store gemini-cli platform on new session", () => {
      const sessionId = setupSession(db, "session-gemini", {
        platform: "gemini-cli",
      });
      const row = db
        .prepare("SELECT platform FROM sdk_sessions WHERE id = ?")
        .get(sessionId) as { platform: string };
      expect(row.platform).toBe("gemini-cli");
    });

    it("should store cursor platform on new session", () => {
      const sessionId = setupSession(db, "session-cursor", {
        platform: "cursor",
      });
      const row = db
        .prepare("SELECT platform FROM sdk_sessions WHERE id = ?")
        .get(sessionId) as { platform: string };
      expect(row.platform).toBe("cursor");
    });

    it("should store claude-code when platform explicitly provided as claude-code", () => {
      const sessionId = setupSession(db, "session-explicit-claude", {
        platform: "claude-code",
      });
      const row = db
        .prepare("SELECT platform FROM sdk_sessions WHERE id = ?")
        .get(sessionId) as { platform: string };
      expect(row.platform).toBe("claude-code");
    });
  });

  // ── createSDKSession: platform backfill ───────────────────────────────────

  describe("createSDKSession — platform backfill on existing session", () => {
    it("should backfill platform when existing session has default claude-code", () => {
      // First call: creates session with default platform
      const sessionId = createSDKSession(
        db,
        "session-backfill-1",
        "project",
        "prompt",
      );
      let row = db
        .prepare("SELECT platform FROM sdk_sessions WHERE id = ?")
        .get(sessionId) as { platform: string };
      expect(row.platform).toBe("claude-code");

      // Second call with gemini-cli: should upgrade
      createSDKSession(
        db,
        "session-backfill-1",
        "project",
        "prompt",
        undefined,
        "gemini-cli",
      );
      row = db
        .prepare("SELECT platform FROM sdk_sessions WHERE id = ?")
        .get(sessionId) as { platform: string };
      expect(row.platform).toBe("gemini-cli");
    });

    it("should NOT overwrite non-default platform with claude-code", () => {
      const sessionId = setupSession(db, "session-no-overwrite", {
        platform: "gemini-cli",
      });

      // Subsequent call with no platform (defaults to undefined → guard fires)
      createSDKSession(db, "session-no-overwrite", "project", "prompt");
      const row = db
        .prepare("SELECT platform FROM sdk_sessions WHERE id = ?")
        .get(sessionId) as { platform: string };
      expect(row.platform).toBe("gemini-cli");
    });

    it("should NOT overwrite gemini-cli with another non-default platform", () => {
      const sessionId = setupSession(db, "session-no-overwrite-2", {
        platform: "gemini-cli",
      });

      // Calling with cursor should NOT overwrite gemini-cli (already non-default)
      createSDKSession(
        db,
        "session-no-overwrite-2",
        "project",
        "prompt",
        undefined,
        "cursor",
      );
      const row = db
        .prepare("SELECT platform FROM sdk_sessions WHERE id = ?")
        .get(sessionId) as { platform: string };
      expect(row.platform).toBe("gemini-cli");
    });

    it("should NOT backfill when called with claude-code (no-op guard)", () => {
      const sessionId = createSDKSession(
        db,
        "session-no-op",
        "project",
        "prompt",
      );

      // Explicit claude-code should NOT trigger the backfill (outer guard: platform !== 'claude-code')
      createSDKSession(
        db,
        "session-no-op",
        "project",
        "prompt",
        undefined,
        "claude-code",
      );
      const row = db
        .prepare("SELECT platform FROM sdk_sessions WHERE id = ?")
        .get(sessionId) as { platform: string };
      expect(row.platform).toBe("claude-code");
    });
  });

  // ── getSessionById: platform in return value ──────────────────────────────

  describe("getSessionById — platform field", () => {
    it("should return platform field for claude-code session", () => {
      const sessionId = createSDKSession(
        db,
        "session-get-claude",
        "project",
        "prompt",
      );
      const session = getSessionById(db, sessionId);
      expect(session?.platform).toBe("claude-code");
    });

    it("should return platform field for gemini-cli session", () => {
      const sessionId = setupSession(db, "session-get-gemini", {
        platform: "gemini-cli",
      });
      const session = getSessionById(db, sessionId);
      expect(session?.platform).toBe("gemini-cli");
    });

    it("should return null for non-existent session", () => {
      const session = getSessionById(db, 99999);
      expect(session).toBeNull();
    });
  });

  // ── getSessionSummaryById: JOIN correctness ───────────────────────────────

  describe("getSessionSummaryById — JOIN with session_summaries", () => {
    it("should return session fields including platform", () => {
      const sessionId = setupSession(db, "session-summary-1", {
        platform: "gemini-cli",
      });
      updateMemorySessionId(db, sessionId, "mem-summary-1");

      const detail = getSessionSummaryById(db, sessionId);
      expect(detail).not.toBeNull();
      expect(detail?.platform).toBe("gemini-cli");
      expect(detail?.id).toBe(sessionId);
    });

    it("should return null request_summary and learned_summary when no summary stored", () => {
      const sessionId = setupSession(db, "session-no-summary");
      const detail = getSessionSummaryById(db, sessionId);
      expect(detail?.request_summary).toBeNull();
      expect(detail?.learned_summary).toBeNull();
    });

    it("should return stored summary fields when session_summaries row exists", () => {
      const sessionId = setupSession(db, "session-has-summary");
      updateMemorySessionId(db, sessionId, "mem-has-summary");

      // Insert a summary row directly
      db.prepare(
        `
        INSERT INTO session_summaries (memory_session_id, project, request, learned, created_at, created_at_epoch)
        VALUES (?, 'test-project', ?, ?, datetime('now'), unixepoch())
      `,
      ).run("mem-has-summary", "Request summary text", "Learned summary text");

      const detail = getSessionSummaryById(db, sessionId);
      expect(detail?.request_summary).toBe("Request summary text");
      expect(detail?.learned_summary).toBe("Learned summary text");
    });

    it("should return null for non-existent session ID", () => {
      const detail = getSessionSummaryById(db, 99999);
      expect(detail).toBeNull();
    });
  });

  // ── getLatestUserPrompt: platform propagation ─────────────────────────────

  describe("getLatestUserPrompt — platform from sdk_sessions JOIN", () => {
    it("should include platform for gemini-cli session", () => {
      const {} = setupSessionWithPrompt(db, "session-latest-gemini", {
        platform: "gemini-cli",
      });
      const result = getLatestUserPrompt(db, "session-latest-gemini");
      expect(result?.platform).toBe("gemini-cli");
    });

    it("should include platform for claude-code session", () => {
      setupSessionWithPrompt(db, "session-latest-claude");
      const result = getLatestUserPrompt(db, "session-latest-claude");
      expect(result?.platform).toBe("claude-code");
    });

    it("should return null/undefined when no prompt exists", () => {
      setupSession(db, "session-no-prompt");
      const result = getLatestUserPrompt(db, "session-no-prompt");
      expect(result == null).toBe(true);
    });
  });

  // ── getAllRecentUserPrompts: platform propagation ─────────────────────────

  describe("getAllRecentUserPrompts — platform from sdk_sessions JOIN", () => {
    it("should include platform for each prompt", () => {
      setupSessionWithPrompt(db, "session-recent-gemini", {
        platform: "gemini-cli",
      });
      setupSessionWithPrompt(db, "session-recent-claude");

      const results = getAllRecentUserPrompts(db, 10);
      const geminiPrompt = results.find(
        (p) => p.content_session_id === "session-recent-gemini",
      );
      const claudePrompt = results.find(
        (p) => p.content_session_id === "session-recent-claude",
      );

      expect(geminiPrompt?.platform).toBe("gemini-cli");
      expect(claudePrompt?.platform).toBe("claude-code");
    });
  });

  // ── getPromptById: platform propagation ──────────────────────────────────

  describe("getPromptById — platform from sdk_sessions JOIN", () => {
    it("should include platform for gemini-cli session", () => {
      const { promptId } = setupSessionWithPrompt(db, "session-byid-gemini", {
        platform: "gemini-cli",
      });
      const result = getPromptById(db, promptId);
      expect(result?.platform).toBe("gemini-cli");
    });

    it("should include platform for claude-code session", () => {
      const { promptId } = setupSessionWithPrompt(db, "session-byid-claude");
      const result = getPromptById(db, promptId);
      expect(result?.platform).toBe("claude-code");
    });

    it("should return null for non-existent prompt", () => {
      expect(getPromptById(db, 99999)).toBeNull();
    });
  });

  // ── getPromptsByIds: platform propagation ─────────────────────────────────

  describe("getPromptsByIds — platform from sdk_sessions JOIN", () => {
    it("should include platform for each prompt", () => {
      const { promptId: id1 } = setupSessionWithPrompt(
        db,
        "session-byids-gemini",
        { platform: "gemini-cli" },
      );
      const { promptId: id2 } = setupSessionWithPrompt(
        db,
        "session-byids-claude",
      );

      const results = getPromptsByIds(db, [id1, id2]);
      const geminiPrompt = results.find(
        (p) => p.content_session_id === "session-byids-gemini",
      );
      const claudePrompt = results.find(
        (p) => p.content_session_id === "session-byids-claude",
      );

      expect(geminiPrompt?.platform).toBe("gemini-cli");
      expect(claudePrompt?.platform).toBe("claude-code");
    });

    it("should return empty array for empty ids", () => {
      expect(getPromptsByIds(db, [])).toEqual([]);
    });
  });

  // ── getUserPromptsByIds: platform propagation ─────────────────────────────

  describe("getUserPromptsByIds — platform from sdk_sessions JOIN", () => {
    it("should include platform for gemini-cli session", () => {
      const { promptId } = setupSessionWithPrompt(
        db,
        "session-byids-search-gemini",
        { platform: "gemini-cli" },
      );
      const results = getUserPromptsByIds(db, [promptId]);
      expect(results[0]?.platform).toBe("gemini-cli");
    });

    it("should include platform for claude-code session", () => {
      const { promptId } = setupSessionWithPrompt(
        db,
        "session-byids-search-claude",
      );
      const results = getUserPromptsByIds(db, [promptId]);
      expect(results[0]?.platform).toBe("claude-code");
    });

    it("should return empty array for empty ids", () => {
      expect(getUserPromptsByIds(db, [])).toEqual([]);
    });
  });

  // ── Gemini CLI adapter: normalizeInput ────────────────────────────────────

  describe("geminiCliAdapter.normalizeInput — platform field", () => {
    it("should always return platform: gemini-cli", () => {
      const result = geminiCliAdapter.normalizeInput({
        session_id: "abc",
        cwd: "/tmp",
      });
      expect(result.platform).toBe("gemini-cli");
    });

    it("should set platform: gemini-cli even when raw input is empty", () => {
      const result = geminiCliAdapter.normalizeInput({});
      expect(result.platform).toBe("gemini-cli");
    });

    it("should set platform: gemini-cli even when raw input is null", () => {
      const result = geminiCliAdapter.normalizeInput(null);
      expect(result.platform).toBe("gemini-cli");
    });

    it("should map session_id correctly alongside platform", () => {
      const result = geminiCliAdapter.normalizeInput({
        session_id: "my-session",
      });
      expect(result.sessionId).toBe("my-session");
      expect(result.platform).toBe("gemini-cli");
    });

    it("should fall back to env GEMINI_SESSION_ID when session_id absent", () => {
      process.env.GEMINI_SESSION_ID = "env-session-id";
      const result = geminiCliAdapter.normalizeInput({});
      expect(result.sessionId).toBe("env-session-id");
      expect(result.platform).toBe("gemini-cli");
      delete process.env.GEMINI_SESSION_ID;
    });
  });
});
