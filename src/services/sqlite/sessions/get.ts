/**
 * Session retrieval functions
 * Database-first parameter pattern for functional composition
 */

import type { Database } from "bun:sqlite";
import { logger } from "../../../utils/logger.js";
import type {
  SessionBasic,
  SessionFull,
  SessionWithStatus,
  SessionSummaryDetail,
} from "./types.js";

/**
 * Get session by ID (basic fields only)
 */
export function getSessionById(db: Database, id: number): SessionBasic | null {
  const stmt = db.prepare(`
    SELECT id, content_session_id, memory_session_id, project, user_prompt,
           custom_title, platform, status, last_activity_epoch,
           completed_at, completed_at_epoch, reaped_at_epoch, end_reason
    FROM sdk_sessions
    WHERE id = ?
    LIMIT 1
  `);

  return (stmt.get(id) as SessionBasic | undefined) || null;
}

/**
 * Get SDK sessions by memory session IDs
 * Used for exporting session metadata
 */
export function getSdkSessionsBySessionIds(
  db: Database,
  memorySessionIds: string[],
): SessionFull[] {
  if (memorySessionIds.length === 0) return [];

  const placeholders = memorySessionIds.map(() => "?").join(",");
  const stmt = db.prepare(`
    SELECT id, content_session_id, memory_session_id, project, user_prompt, custom_title, platform,
           started_at, started_at_epoch, last_activity_epoch,
           completed_at, completed_at_epoch, reaped_at_epoch, end_reason, status
    FROM sdk_sessions
    WHERE memory_session_id IN (${placeholders})
    ORDER BY started_at_epoch DESC
  `);

  return stmt.all(...memorySessionIds) as SessionFull[];
}

/**
 * Get recent sessions with their status and summary info
 * Returns sessions ordered oldest-first for display
 */
export function getRecentSessionsWithStatus(
  db: Database,
  project: string,
  limit: number = 3,
): SessionWithStatus[] {
  const stmt = db.prepare(`
    SELECT * FROM (
      SELECT
        s.memory_session_id,
        s.status,
        s.started_at,
        s.started_at_epoch,
        s.user_prompt,
        CASE WHEN sum.memory_session_id IS NOT NULL THEN 1 ELSE 0 END as has_summary
      FROM sdk_sessions s
      LEFT JOIN session_summaries sum ON s.memory_session_id = sum.memory_session_id
      WHERE s.project = ? AND s.memory_session_id IS NOT NULL
      GROUP BY s.memory_session_id
      ORDER BY s.started_at_epoch DESC
      LIMIT ?
    )
    ORDER BY started_at_epoch ASC
  `);

  return stmt.all(project, limit) as SessionWithStatus[];
}

/**
 * Get full session summary by ID (includes request_summary and learned_summary)
 */
export function getSessionSummaryById(
  db: Database,
  id: number,
): SessionSummaryDetail | null {
  const stmt = db.prepare(`
    SELECT
      s.id,
      s.memory_session_id,
      s.content_session_id,
      s.project,
      s.user_prompt,
      s.platform,
      s.status,
      s.started_at AS created_at,
      s.started_at_epoch AS created_at_epoch,
      ss.request AS request_summary,
      ss.learned AS learned_summary
    FROM sdk_sessions s
    LEFT JOIN session_summaries ss ON s.memory_session_id = ss.memory_session_id
    WHERE s.id = ?
    LIMIT 1
  `);

  return (stmt.get(id) as SessionSummaryDetail | undefined) || null;
}
