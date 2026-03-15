/**
 * Tests for SessionStore in-memory database operations
 *
 * Mock Justification: NONE (0% mock code)
 * - Uses real SQLite with ':memory:' - tests actual SQL and schema
 * - All CRUD operations are tested against real database behavior
 * - Timestamp handling and FK relationships are validated
 *
 * Value: Validates core persistence layer without filesystem dependencies
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { SessionStore } from '../src/services/sqlite/SessionStore.js';

describe('SessionStore', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('should correctly count user prompts', () => {
    const claudeId = 'claude-session-1';
    store.createSDKSession(claudeId, 'test-project', 'initial prompt');
    
    // Should be 0 initially
    expect(store.getPromptNumberFromUserPrompts(claudeId)).toBe(0);

    // Save prompt 1
    store.saveUserPrompt(claudeId, 1, 'First prompt');
    expect(store.getPromptNumberFromUserPrompts(claudeId)).toBe(1);

    // Save prompt 2
    store.saveUserPrompt(claudeId, 2, 'Second prompt');
    expect(store.getPromptNumberFromUserPrompts(claudeId)).toBe(2);

    // Save prompt for another session
    store.createSDKSession('claude-session-2', 'test-project', 'initial prompt');
    store.saveUserPrompt('claude-session-2', 1, 'Other prompt');
    expect(store.getPromptNumberFromUserPrompts(claudeId)).toBe(2);
  });

  it('should store observation with timestamp override', () => {
    const claudeId = 'claude-sess-obs';
    const memoryId = 'memory-sess-obs';
    const sdkId = store.createSDKSession(claudeId, 'test-project', 'initial prompt');

    // Set the memory_session_id before storing observations
    // createSDKSession now initializes memory_session_id = NULL
    store.updateMemorySessionId(sdkId, memoryId);

    const obs = {
      type: 'discovery',
      title: 'Test Obs',
      subtitle: null,
      facts: [],
      narrative: 'Testing',
      concepts: [],
      files_read: [],
      files_modified: []
    };

    const pastTimestamp = 1600000000000; // Some time in the past

    const result = store.storeObservation(
      memoryId, // Use memorySessionId for FK reference
      'test-project',
      obs,
      1,
      0,
      pastTimestamp
    );

    expect(result.createdAtEpoch).toBe(pastTimestamp);

    const stored = store.getObservationById(result.id);
    expect(stored).not.toBeNull();
    expect(stored?.created_at_epoch).toBe(pastTimestamp);

    // Verify ISO string matches
    expect(new Date(stored!.created_at).getTime()).toBe(pastTimestamp);
  });

  it('should store summary with timestamp override', () => {
    const claudeId = 'claude-sess-sum';
    const memoryId = 'memory-sess-sum';
    const sdkId = store.createSDKSession(claudeId, 'test-project', 'initial prompt');

    // Set the memory_session_id before storing summaries
    store.updateMemorySessionId(sdkId, memoryId);

    const summary = {
      request: 'Do something',
      investigated: 'Stuff',
      learned: 'Things',
      completed: 'Done',
      next_steps: 'More',
      notes: null
    };

    const pastTimestamp = 1650000000000;

    const result = store.storeSummary(
      memoryId, // Use memorySessionId for FK reference
      'test-project',
      summary,
      1,
      0,
      pastTimestamp
    );

    expect(result.createdAtEpoch).toBe(pastTimestamp);

    const stored = store.getSummaryForSession(memoryId);
    expect(stored).not.toBeNull();
    expect(stored?.created_at_epoch).toBe(pastTimestamp);
  });

  it('should finalize sessions with terminal lifecycle metadata', () => {
    const sessionDbId = store.createSDKSession(
      'claude-sess-finalize',
      'test-project',
      'initial prompt',
    );

    const finalized = store.finalizeSession(
      sessionDbId,
      'stale',
      'idle_timeout',
      1700000000000,
    );

    expect(finalized).toBe(true);

    const session = store.getSessionById(sessionDbId);
    expect(session?.status).toBe('stale');
    expect(session?.completed_at_epoch).toBe(1700000000000);
    expect(session?.reaped_at_epoch).toBe(1700000000000);
    expect(session?.end_reason).toBe('idle_timeout');
  });

  it('should revive stale sessions and refresh last activity', () => {
    const sessionDbId = store.createSDKSession(
      'claude-sess-revive',
      'test-project',
      'initial prompt',
    );

    store.finalizeSession(sessionDbId, 'stale', 'idle_timeout', 1234);
    store.reviveStaleSession(sessionDbId, 5678);

    const session = store.getSessionById(sessionDbId);
    expect(session?.status).toBe('active');
    expect(session?.completed_at_epoch).toBeNull();
    expect(session?.reaped_at_epoch).toBeNull();
    expect(session?.end_reason).toBeNull();
    expect(session?.last_activity_epoch).toBe(5678);
  });
});
