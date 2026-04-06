/**
 * AI NPC Plugin
 *
 * Enables AI-driven NPC behavior with:
 * - Natural language conversation generation
 * - Autonomous action decisions (move, interact)
 * - Long-term memory (conversations, relationships, events)
 *
 * Configuration via environment variables:
 * - AI_PROVIDER: 'openai' or 'claude' (default: openai)
 * - OPENAI_API_KEY / ANTHROPIC_API_KEY: API key
 * - OPENAI_BASE_URL / ANTHROPIC_BASE_URL: Custom endpoint (optional)
 * - OPENAI_MODEL / ANTHROPIC_MODEL: Model name
 */

const { IPlugin } = require('@alicization/core-interfaces');
const { createAIClient, validateAIClientConfig } = require('../ai/client/client-factory');
const { AiScheduler } = require('../ai/scheduler/ai-scheduler');
const { getMemoryStore } = require('../ai/memory/memory-store');

// Plugin ID
const PLUGIN_ID = 'ai/npc';

// Global reference to engine (set during initialization)
let worldEngine = null;

/**
 * Set the world engine reference for AI NPC system.
 * Called from main.js after engine is initialized.
 * @param {Object} engine - World engine instance
 */
function setWorldEngine(engine) {
  worldEngine = engine;
}

/**
 * Get the world engine reference.
 * @returns {Object|null}
 */
function getWorldEngine() {
  return worldEngine;
}

class AiNpcPlugin extends IPlugin {
  constructor() {
    super();
    this.client = null;
    this.schedulers = new Map(); // npcId -> AiScheduler
    this.memoryStore = null;
    this.enabled = process.env.ALICIZATION_AI_NPC_ENABLED !== 'false';
  }

  get id() { return PLUGIN_ID; }
  get version() { return '1.0.0'; }

  /**
   * Called when plugin is registered.
   * @param {Object} ctx - Plugin context
   */
  async onRegister(ctx) {
    if (!this.enabled) {
      console.log('[ai-npc] Plugin disabled by environment variable');
      return;
    }

    // Validate configuration
    const { valid, errors, client } = validateAIClientConfig();
    if (!valid) {
      console.warn('[ai-npc] Configuration errors:', errors.join(', '));
      console.warn('[ai-npc] Plugin will be enabled but AI calls may fail');
    }

    this.client = client;
    this.memoryStore = getMemoryStore();

    console.log(`[ai-npc] Plugin registered (client: ${this.client?.getModelName() || 'not configured'})`);

    // Register the AI autonomous strategy so NpcBehavior can use it
    ctx.registerNpcStrategy('ai/autonomous', async ({ npc, config, nearbyPlayers, engine, greetHistory }) => {
      return await this._executeAiDecision(npc, config, nearbyPlayers, engine);
    });

    // Register event listeners for memory updates
    ctx.onEvent('chat', (entry) => this._onChatEvent(entry));
    ctx.onEvent('interaction', (entry) => this._onInteractionEvent(entry));
  }

  /**
   * Called when plugin is unregistered.
   */
  async onUnregister() {
    // Stop all schedulers
    for (const [npcId, scheduler] of this.schedulers) {
      scheduler.stop();
    }
    this.schedulers.clear();
    console.log('[ai-npc] Plugin unregistered');
  }

  /**
   * Start AI scheduler for an NPC.
   * @param {string} npcId - NPC player ID
   * @param {Object} config - NPC configuration
   */
  startNpc(npcId, config) {
    if (this.schedulers.has(npcId)) {
      console.warn(`[ai-npc] Scheduler already running for ${config.name}`);
      return;
    }

    if (!this.client) {
      console.warn(`[ai-npc] No AI client configured, skipping ${config.name}`);
      return;
    }

    if (!worldEngine) {
      console.warn(`[ai-npc] World engine not set, skipping ${config.name}`);
      return;
    }

    const scheduler = new AiScheduler({
      npcId,
      config,
      client: this.client,
      engine: worldEngine,
    });

    scheduler.start();
    this.schedulers.set(npcId, scheduler);

    console.log(`[ai-npc] Started AI scheduler for ${config.name}`);
  }

  /**
   * Stop AI scheduler for an NPC.
   * @param {string} npcId - NPC player ID
   */
  stopNpc(npcId) {
    const scheduler = this.schedulers.get(npcId);
    if (scheduler) {
      scheduler.stop();
      this.schedulers.delete(npcId);
      console.log(`[ai-npc] Stopped AI scheduler for ${npcId}`);
    }
  }

  /**
   * Get memory store for direct access.
   * @returns {MemoryStore}
   */
  getMemoryStore() {
    return this.memoryStore;
  }

  /**
   * Handle chat events to record player messages.
   * @param {Object} entry - Chat event entry
   */
  _onChatEvent(entry) {
    if (!entry.playerId) return;
    if (!worldEngine) return;

    // Find NPCs near this player and record conversations for AI NPCs
    const allPlayers = worldEngine.getAllPlayers();
    for (const [npcId, npc] of Object.entries(allPlayers)) {
      if (!npc.isNPC) continue;

      // Check if this NPC has AI enabled (via npc-config)
      const { NPC_PROFILES } = require('../npc/npc-config');
      const npcConfig = NPC_PROFILES.find(c => c.id === npcId);
      if (!npcConfig?.aiEnabled && !npcConfig?.strategy?.startsWith('ai/')) continue;

      const distance = Math.abs(npc.x - entry.x) + Math.abs(npc.y - entry.y);
      if (distance <= 15) { // Same perception range
        this.memoryStore.addConversation(npcId, entry.playerId, 'player', entry.message, {
          importance: 0.6,
          metadata: { playerName: entry.name },
        });
      }
    }
  }

  /**
   * Handle interaction events.
   * @param {Object} entry - Interaction event entry
   */
  _onInteractionEvent(entry) {
    if (entry.isNPC) return;

    // Record interesting player interactions
    if (entry.playerId) {
      this.memoryStore.recordEvent(
        'global',
        'player_interaction',
        `${entry.name} 在 ${entry.zone}: ${entry.action}`,
        entry.playerId,
        0.3
      );
    }
  }

  /**
   * Execute AI decision for an NPC (called by NpcBehavior via strategy).
   * @param {Object} npc - NPC player object
   * @param {Object} config - NPC configuration
   * @param {Array} nearbyPlayers - Nearby human players
   * @param {Object} engine - Engine interface
   * @returns {Promise<{action: string, detail: string}|null>}
   */
  async _executeAiDecision(npc, config, nearbyPlayers, engine) {
    if (!this.client || !this.client.isConfigured()) {
      console.warn(`[ai-npc] AI client not configured for ${config.name}, using fallback`);
      return null; // Return null to let NpcBehavior use its fallback
    }

    if (!worldEngine) {
      console.warn(`[ai-npc] World engine not set for ${config.name}`);
      return null;
    }

    try {
      // Build context for AI
      const { buildSystemPrompt, buildSituationMessage, ACTION_TOOLS } = require('../ai/prompts/prompt-templates');

      const relationships = this.memoryStore.getRelationshipsForNpc(config.id);
      const recentEvents = this.memoryStore.getImportantEvents(config.id, 5);
      const recentChats = nearbyPlayers.length > 0
        ? this.memoryStore.getRecentConversations(config.id, nearbyPlayers[0].id, 10)
        : [];

      const systemPrompt = buildSystemPrompt(config, {
        x: npc.x,
        y: npc.y,
        zoneName: npc.currentZoneName,
        knownPlayers: relationships,
        recentEvents,
        currentGoal: null, // Could be extended to track goals
      });

      const situationMessage = buildSituationMessage({
        npc,
        nearbyPlayers,
        recentChats,
      });

      console.log(`[ai-npc] 🤖 ${config.name} 正在调用 AI...`);

      // Call AI
      const response = await this.client.generate({
        system: systemPrompt,
        messages: [{ role: 'user', content: situationMessage }],
        tools: ACTION_TOOLS,
        temperature: 0.8,
      });

      // Log AI response for debugging
      console.log(`[ai-npc] 🤖 ${config.name} AI 响应:`, {
        hasContent: !!response.content,
        hasToolCalls: !!(response.toolCalls && response.toolCalls.length > 0),
        toolCallName: response.toolCalls?.[0]?.name,
        toolCallArgs: response.toolCalls?.[0]?.arguments,
      });

      // Execute the AI's decision
      return await this._executeToolCall(response, config.id, engine);

    } catch (err) {
      console.error(`[ai-npc] AI decision error for ${config.name}:`, err.message);
      return null; // Let NpcBehavior use its fallback
    }
  }

  /**
   * Execute a tool call from AI response.
   * @param {Object} response - AI response
   * @param {string} npcId - NPC ID
   * @param {Object} engine - Engine interface
   * @returns {Promise<{action: string, detail: string}|null>}
   */
  async _executeToolCall(response, npcId, engine) {
    const { content, toolCalls } = response;

    // No tool call - check if content looks like dialogue
    if (!toolCalls || toolCalls.length === 0) {
      if (content && content.trim()) {
        const text = content.trim();
        const looksLikeDialogue = !text.includes('我想') &&
          !text.includes('应该') &&
          !text.includes('或许') &&
          text.length < 100;

        if (looksLikeDialogue) {
          engine.chat(npcId, text);
          return { action: 'chat', detail: `说: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"` };
        }
      }
      return { action: 'observe', detail: '思考中...' };
    }

    // Execute the tool call
    const call = toolCalls[0];
    const args = typeof call.arguments === 'string'
      ? JSON.parse(call.arguments)
      : call.arguments;

    switch (call.name) {
      case 'chat':
        if (args.text) {
          engine.chat(npcId, args.text);
          // Record as activity
          if (worldEngine) {
            worldEngine.recordPluginActivity(npcId, `说: ${args.text.substring(0, 50)}${args.text.length > 50 ? '...' : ''}`, 'say');
          }
          return { action: 'chat', detail: `说: "${args.text.substring(0, 50)}${args.text.length > 50 ? '...' : ''}"` };
        }
        break;

      case 'move':
        if (args.forward !== undefined || args.right !== undefined) {
          const target = {};
          if (args.forward !== undefined) target.forward = Math.max(-10, Math.min(10, parseInt(args.forward) || 0));
          if (args.right !== undefined) target.right = Math.max(-10, Math.min(10, parseInt(args.right) || 0));
          const result = await engine.move(npcId, target);
          if (result && !result.error) {
            // Record as activity
            if (worldEngine) {
              worldEngine.recordPluginActivity(npcId, `移动到 (${result.player.x}, ${result.player.y})`, 'move');
            }
            return { action: 'move', detail: `移动到 (${result.player.x}, ${result.player.y})` };
          }
          return { action: 'move', detail: `移动失败` };
        }
        break;

      case 'interact':
        const result = engine.interact(npcId, args.item);
        if (result) {
          // Record as activity
          if (worldEngine) {
            worldEngine.recordPluginActivity(npcId, `${result.action}: ${result.result}`, 'interact');
          }
          return { action: 'interact', detail: `${result.action}: ${result.result}` };
        }
        return { action: 'interact', detail: '此处没有可互动的对象' };

      case 'observe':
        // Record observe as an activity so it shows up in frontend
        if (worldEngine && args.thought) {
          const allPlayers = worldEngine.getAllPlayers();
          const npc = allPlayers[npcId];
          if (npc) {
            worldEngine.recordPluginActivity(npcId, `观察${npc.currentZoneName ? ' ' + npc.currentZoneName : ''}: ${args.thought}`, 'ai-npc');
          }
        }
        return { action: 'observe', detail: args.thought || '静静观察' };

      case 'setGoal':
        return { action: 'setGoal', detail: `设定目标: ${args.goal}` };
    }

    return null;
  }
}

// Export a factory function to create plugin instance
function createAiNpcPlugin() {
  return new AiNpcPlugin();
}

module.exports = createAiNpcPlugin;
module.exports.AiNpcPlugin = AiNpcPlugin;
module.exports.PLUGIN_ID = PLUGIN_ID;
module.exports.setWorldEngine = setWorldEngine;
module.exports.getWorldEngine = getWorldEngine;
