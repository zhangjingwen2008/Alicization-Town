/**
 * AI Memory Store
 * Persists NPC conversations, player relationships, and important events.
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const { DATA_ROOT } = require('../../config/service-config');

const MEMORY_DB_FILE = path.join(DATA_ROOT, 'ai-memory.sqlite');

class MemoryStore {
  constructor() {
    // Ensure data directory exists
    fs.mkdirSync(path.dirname(MEMORY_DB_FILE), { recursive: true });
    this.db = new DatabaseSync(MEMORY_DB_FILE);
    this.initializeSchema();
  }

  initializeSchema() {
    this.db.exec(`
      -- Conversation history
      CREATE TABLE IF NOT EXISTS npc_conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        npc_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        session_id TEXT,
        importance REAL DEFAULT 0.5,
        metadata TEXT
      );

      -- Player relationships
      CREATE TABLE IF NOT EXISTS npc_relationships (
        npc_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        player_name TEXT,
        relationship_type TEXT DEFAULT 'stranger',
        trust_score REAL DEFAULT 0.0,
        interaction_count INTEGER DEFAULT 0,
        last_interaction INTEGER,
        notes TEXT,
        PRIMARY KEY (npc_id, player_id)
      );

      -- Important events
      CREATE TABLE IF NOT EXISTS npc_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        npc_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        description TEXT NOT NULL,
        player_id TEXT,
        importance REAL DEFAULT 0.5,
        timestamp INTEGER NOT NULL,
        expires_at INTEGER
      );

      -- NPC current goals
      CREATE TABLE IF NOT EXISTS npc_goals (
        npc_id TEXT PRIMARY KEY,
        current_goal TEXT,
        mood TEXT DEFAULT 'neutral',
        context TEXT,
        updated_at INTEGER
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_conv_npc_player ON npc_conversations(npc_id, player_id);
      CREATE INDEX IF NOT EXISTS idx_conv_timestamp ON npc_conversations(timestamp);
      CREATE INDEX IF NOT EXISTS idx_rel_interaction ON npc_relationships(last_interaction);
      CREATE INDEX IF NOT EXISTS idx_events_npc ON npc_events(npc_id, importance DESC);
    `);
  }

  // ── Conversation History ──────────────────────────────────────────────────

  /**
   * Add a conversation message.
   * @param {string} npcId - NPC ID
   * @param {string} playerId - Player ID
   * @param {string} role - 'npc' or 'player'
   * @param {string} content - Message content
   * @param {Object} [options] - Additional options
   */
  addConversation(npcId, playerId, role, content, options = {}) {
    const stmt = this.db.prepare(`
      INSERT INTO npc_conversations
        (npc_id, player_id, role, content, timestamp, session_id, importance, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      npcId, playerId, role, content,
      Date.now(), options.sessionId || null,
      options.importance || 0.5, options.metadata ? JSON.stringify(options.metadata) : null
    );
  }

  /**
   * Get recent conversations between NPC and player.
   * @param {string} npcId - NPC ID
   * @param {string} playerId - Player ID
   * @param {number} [limit=10] - Max messages to return
   * @returns {Array<{role: string, content: string, timestamp: number}>}
   */
  getRecentConversations(npcId, playerId, limit = 10) {
    const stmt = this.db.prepare(`
      SELECT role, content, timestamp, importance
      FROM npc_conversations
      WHERE npc_id = ? AND player_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    const rows = stmt.all(npcId, playerId, limit);
    return rows.reverse().map(r => ({
      role: r.role,
      content: r.content,
      timestamp: r.timestamp,
      importance: r.importance,
    }));
  }

  /**
   * Prune old low-importance conversations.
   * @param {number} [olderThanDays=30] - Days threshold
   */
  pruneOldConversations(olderThanDays = 30) {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const stmt = this.db.prepare(`
      DELETE FROM npc_conversations
      WHERE timestamp < ? AND importance < 0.7
    `);
    stmt.run(cutoff);
  }

  // ── Relationships ──────────────────────────────────────────────────────────

  /**
   * Get relationship between NPC and player.
   * @param {string} npcId - NPC ID
   * @param {string} playerId - Player ID
   * @returns {Object|null}
   */
  getRelationship(npcId, playerId) {
    const stmt = this.db.prepare(`
      SELECT * FROM npc_relationships
      WHERE npc_id = ? AND player_id = ?
    `);
    const row = stmt.get(npcId, playerId);
    if (row && row.notes) {
      try {
        row.notes = JSON.parse(row.notes);
      } catch (e) {
        row.notes = null;
      }
    }
    return row;
  }

  /**
   * Update or create relationship.
   * @param {string} npcId - NPC ID
   * @param {string} playerId - Player ID
   * @param {string} playerName - Player display name
   * @param {Object} updates - Fields to update
   */
  upsertRelationship(npcId, playerId, playerName, updates = {}) {
    const existing = this.getRelationship(npcId, playerId);

    if (existing) {
      const setClauses = [];
      const values = [];

      if (updates.trustDelta !== undefined) {
        setClauses.push('trust_score = MAX(-1, MIN(1, trust_score + ?))');
        values.push(updates.trustDelta);
      }
      if (updates.relationshipType) {
        setClauses.push('relationship_type = ?');
        values.push(updates.relationshipType);
      }
      if (updates.notes) {
        setClauses.push('notes = ?');
        values.push(JSON.stringify(updates.notes));
      }
      if (playerName) {
        setClauses.push('player_name = ?');
        values.push(playerName);
      }

      setClauses.push('interaction_count = interaction_count + 1');
      setClauses.push('last_interaction = ?');
      values.push(Date.now());
      values.push(npcId, playerId);

      this.db.prepare(`
        UPDATE npc_relationships
        SET ${setClauses.join(', ')}
        WHERE npc_id = ? AND player_id = ?
      `).run(...values);
    } else {
      this.db.prepare(`
        INSERT INTO npc_relationships
          (npc_id, player_id, player_name, relationship_type,
           trust_score, interaction_count, last_interaction, notes)
        VALUES (?, ?, ?, 'stranger', 0.0, 1, ?, ?)
      `).run(
        npcId, playerId, playerName || 'Unknown',
        Date.now(),
        updates.notes ? JSON.stringify(updates.notes) : null
      );
    }
  }

  /**
   * Get all relationships for an NPC.
   * @param {string} npcId - NPC ID
   * @param {number} [limit=20] - Max results
   * @returns {Array}
   */
  getRelationshipsForNpc(npcId, limit = 20) {
    const stmt = this.db.prepare(`
      SELECT player_id, player_name, relationship_type,
             trust_score, interaction_count, last_interaction, notes
      FROM npc_relationships
      WHERE npc_id = ?
      ORDER BY interaction_count DESC
      LIMIT ?
    `);
    const rows = stmt.all(npcId, limit);
    return rows.map(r => {
      if (r.notes) {
        try {
          r.notes = JSON.parse(r.notes);
        } catch (e) {
          r.notes = null;
        }
      }
      return r;
    });
  }

  // ── Important Events ───────────────────────────────────────────────────────

  /**
   * Record an important event.
   * @param {string} npcId - NPC ID
   * @param {string} eventType - Event type (discovery, gift, conflict, etc.)
   * @param {string} description - Event description
   * @param {string} [playerId] - Related player ID
   * @param {number} [importance=0.5] - Importance score (0-1)
   */
  recordEvent(npcId, eventType, description, playerId = null, importance = 0.5) {
    this.db.prepare(`
      INSERT INTO npc_events
        (npc_id, event_type, description, player_id, importance, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(npcId, eventType, description, playerId, importance, Date.now());
  }

  /**
   * Get important events for an NPC.
   * @param {string} npcId - NPC ID
   * @param {number} [limit=10] - Max results
   * @returns {Array}
   */
  getImportantEvents(npcId, limit = 10) {
    const now = Date.now();
    const stmt = this.db.prepare(`
      SELECT event_type, description, player_id, timestamp, importance
      FROM npc_events
      WHERE npc_id = ?
        AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY importance DESC, timestamp DESC
      LIMIT ?
    `);
    return stmt.all(npcId, now, limit);
  }

  /**
   * Summarize recent events by type.
   * @param {string} npcId - NPC ID
   * @param {number} [hoursBack=24] - Hours to look back
   * @returns {Array}
   */
  summarizeRecentEvents(npcId, hoursBack = 24) {
    const cutoff = Date.now() - hoursBack * 60 * 60 * 1000;
    const stmt = this.db.prepare(`
      SELECT event_type, COUNT(*) as count
      FROM npc_events
      WHERE npc_id = ? AND timestamp > ?
      GROUP BY event_type
    `);
    return stmt.all(npcId, cutoff);
  }

  // ── NPC Goals ──────────────────────────────────────────────────────────────

  /**
   * Get NPC's current goal.
   * @param {string} npcId - NPC ID
   * @returns {Object|null}
   */
  getGoal(npcId) {
    const stmt = this.db.prepare(`
      SELECT current_goal, mood, context, updated_at
      FROM npc_goals
      WHERE npc_id = ?
    `);
    const row = stmt.get(npcId);
    if (row && row.context) {
      try {
        row.context = JSON.parse(row.context);
      } catch (e) {
        row.context = null;
      }
    }
    return row;
  }

  /**
   * Set NPC's current goal.
   * @param {string} npcId - NPC ID
   * @param {string} goal - Goal description
   * @param {string} [mood='neutral'] - Current mood
   * @param {Object} [context] - Additional context
   */
  setGoal(npcId, goal, mood = 'neutral', context = null) {
    this.db.prepare(`
      INSERT OR REPLACE INTO npc_goals
        (npc_id, current_goal, mood, context, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(npcId, goal, mood, context ? JSON.stringify(context) : null, Date.now());
  }

  /**
   * Clear NPC's goal.
   * @param {string} npcId - NPC ID
   */
  clearGoal(npcId) {
    this.db.prepare(`DELETE FROM npc_goals WHERE npc_id = ?`).run(npcId);
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  /**
   * Close the database connection.
   */
  close() {
    this.db.close();
  }
}

// Singleton instance
let instance = null;

function getMemoryStore() {
  if (!instance) {
    instance = new MemoryStore();
  }
  return instance;
}

module.exports = { MemoryStore, getMemoryStore };
