/**
 * Session Completion Handler
 *
 * Consolidates session completion logic for manual session deletion/completion.
 * Used by DELETE /api/sessions/:id and POST /api/sessions/:id/complete endpoints.
 *
 * Completion flow:
 * 1. Delete session from SessionManager (aborts SDK agent, cleans up in-memory state)
 * 2. Broadcast session completed event (updates UI spinner)
 */

import { SessionManager } from '../SessionManager.js';
import { SessionEventBroadcaster } from '../events/SessionEventBroadcaster.js';
import { DatabaseManager } from '../DatabaseManager.js';
import { logger } from '../../../utils/logger.js';

export class SessionCompletionHandler {
  constructor(
    private sessionManager: SessionManager,
    private eventBroadcaster: SessionEventBroadcaster,
    private dbManager: DatabaseManager,
  ) {}

  /**
   * Complete session by database ID
   * Used by DELETE /api/sessions/:id and POST /api/sessions/:id/complete
   */
  async completeByDbId(sessionDbId: number): Promise<void> {
    this.dbManager.getSessionStore().finalizeSession(
      sessionDbId,
      'completed',
      'session_complete',
    );

    // Delete from session manager (aborts SDK agent)
    await this.sessionManager.deleteSession(sessionDbId);

    // Broadcast session completed event
    this.eventBroadcaster.broadcastSessionCompleted(sessionDbId);
  }

  finalizeAfterGeneratorExit(
    sessionDbId: number,
    status: 'stale' | 'failed',
    endReason: string,
  ): void {
    const finalized = this.dbManager
      .getSessionStore()
      .finalizeSession(sessionDbId, status, endReason);

    this.sessionManager.removeSessionImmediate(sessionDbId);

    if (finalized) {
      logger.info('SESSION', 'Session finalized after generator exit', {
        sessionId: sessionDbId,
        status,
        endReason,
      });
      this.eventBroadcaster.broadcastSessionCompleted(sessionDbId);
    }
  }
}
