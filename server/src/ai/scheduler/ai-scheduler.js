/**
 * AI NPC Scheduler
 * Manages continuous autonomous behavior for AI-driven NPCs.
 */

const { buildSystemPrompt, buildSituationMessage, ACTION_TOOLS } = require('../prompts/prompt-templates');
const { getMemoryStore } = require('../memory/memory-store');

// Configuration
const CONFIG = {
  tickIntervalMin: parseInt(process.env.AI_TICK_INTERVAL_MIN) || 10000,  // 10秒
  tickIntervalMax: parseInt(process.env.AI_TICK_INTERVAL_MAX) || 20000,  // 20秒
  heartbeatInterval: parseInt(process.env.AI_HEARTBEAT_INTERVAL) || 10000,
  responseTimeout: parseInt(process.env.AI_RESPONSE_TIMEOUT) || 15000,
  maxConversationHistory: parseInt(process.env.AI_MAX_CONVERSATION_HISTORY) || 10,
};

class AiScheduler {
  /**
   * @param {Object} options
   * @param {string} options.npcId - NPC player ID
   * @param {Object} options.config - NPC configuration
   * @param {import('../client/base-client').BaseAIClient} options.client - AI client
   * @param {Object} options.engine - World engine interface
   */
  constructor({ npcId, config, client, engine }) {
    this.npcId = npcId;
    this.config = config;
    this.client = client;
    this.engine = engine;
    this.memoryStore = getMemoryStore();

    this.running = false;
    this.tickTimer = null;
    this.heartbeatTimer = null;
    this.currentGoal = null;

    // Error tracking for fallback behavior
    this.consecutiveErrors = 0;
    this.maxConsecutiveErrors = 3;
  }

  /**
   * Start the scheduler.
   */
  start() {
    if (this.running) return;

    this.running = true;
    console.log(`[ai-scheduler] Starting scheduler for ${this.config.name}`);

    // Load persisted goal if any
    const savedGoal = this.memoryStore.getGoal(this.npcId);
    if (savedGoal && savedGoal.current_goal) {
      this.currentGoal = savedGoal.current_goal;
    }

    // Start heartbeat to keep NPC active
    this.startHeartbeat();

    // Schedule first tick
    this.scheduleNextTick();
  }

  /**
   * Stop the scheduler.
   */
  stop() {
    this.running = false;
    console.log(`[ai-scheduler] Stopping scheduler for ${this.config.name}`);

    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Start independent heartbeat to keep NPC active.
   */
  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (this.running) {
        this.engine.touchAction(this.npcId);
      }
    }, CONFIG.heartbeatInterval);
  }

  /**
   * Schedule the next tick.
   */
  scheduleNextTick() {
    if (!this.running) return;

    const delay = CONFIG.tickIntervalMin +
      Math.floor(Math.random() * (CONFIG.tickIntervalMax - CONFIG.tickIntervalMin));

    this.tickTimer = setTimeout(() => this.tick(), delay);
  }

  /**
   * Execute one AI decision cycle.
   */
  async tick() {
    if (!this.running) return;

    try {
      // Gather context
      const context = await this.gatherContext();

      // Generate AI decision
      const decision = await this.generateDecision(context);

      // Execute the decision
      const result = await this.executeDecision(decision);

      // Reset error counter on success
      this.consecutiveErrors = 0;

      // Log the action
      console.log(`[ai-npc] ${this.config.name}: ${result?.detail || '思考中...'}`);

    } catch (err) {
      console.error(`[ai-scheduler] Error for ${this.config.name}:`, err.message);

      this.consecutiveErrors++;

      // Fallback behavior on errors
      if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
        await this.fallbackBehavior();
        this.consecutiveErrors = 0;
      }
    }

    // Schedule next tick
    this.scheduleNextTick();
  }

  /**
   * Gather context for AI decision.
   * @returns {Promise<Object>}
   */
  async gatherContext() {
    const allPlayers = this.engine.getAllPlayers();
    const npc = allPlayers[this.npcId];

    if (!npc) {
      throw new Error('NPC not found');
    }

    // Get nearby non-NPC players
    const nearbyPlayers = [];
    for (const [id, player] of Object.entries(allPlayers)) {
      if (id === this.npcId || player.isNPC || player.name === 'Observer') continue;

      const distance = Math.abs(player.x - npc.x) + Math.abs(player.y - npc.y);
      if (distance <= 15) { // Perception range
        nearbyPlayers.push({
          ...player,
          distance,
        });
      }
    }

    // Get memory
    const relationships = this.memoryStore.getRelationshipsForNpc(this.npcId);
    const recentEvents = this.memoryStore.getImportantEvents(this.npcId, 5);

    // Get recent conversations with the closest player
    let recentChats = [];
    if (nearbyPlayers.length > 0) {
      const closest = nearbyPlayers.reduce((a, b) => a.distance < b.distance ? a : b);
      recentChats = this.memoryStore.getRecentConversations(
        this.npcId,
        closest.id,
        CONFIG.maxConversationHistory
      );
    }

    return {
      npc,
      nearbyPlayers,
      relationships,
      recentEvents,
      recentChats,
      currentGoal: this.currentGoal,
    };
  }

  /**
   * Generate AI decision.
   * @param {Object} context
   * @returns {Promise<Object>}
   */
  async generateDecision(context) {
    const { npc, nearbyPlayers, relationships, recentEvents, recentChats, currentGoal } = context;

    // Check if client is configured
    if (!this.client || !this.client.isConfigured()) {
      throw new Error('AI client not configured');
    }

    // Build system prompt
    const systemPrompt = buildSystemPrompt(this.config, {
      x: npc.x,
      y: npc.y,
      zoneName: npc.currentZoneName,
      knownPlayers: relationships,
      recentEvents,
      currentGoal,
    });

    // Build messages
    const messages = [];

    // Add recent conversations
    for (const chat of recentChats) {
      messages.push({
        role: chat.role === 'npc' ? 'assistant' : 'user',
        content: chat.content,
      });
    }

    // Add current situation
    const situationMessage = buildSituationMessage(context);
    messages.push({
      role: 'user',
      content: situationMessage,
    });

    // Call AI with timeout
    const responsePromise = this.client.generate({
      system: systemPrompt,
      messages,
      tools: ACTION_TOOLS,
      temperature: 0.8,
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('AI response timeout')), CONFIG.responseTimeout);
    });

    const response = await Promise.race([responsePromise, timeoutPromise]);

    return {
      content: response.content,
      toolCalls: response.toolCalls || [],
    };
  }

  /**
   * Execute AI decision.
   * @param {Object} decision
   */
  async executeDecision(decision) {
    const { content, toolCalls } = decision;

    // If AI returned text but no tool call, treat it as chat if it looks like dialogue
    if (!toolCalls || toolCalls.length === 0) {
      if (content && content.trim()) {
        // Check if content looks like spoken dialogue (not internal thought)
        const text = content.trim();
        const looksLikeDialogue = !text.includes('我想') &&
          !text.includes('应该') &&
          !text.includes('或许') &&
          !text.includes('思考') &&
          text.length < 100;

        if (looksLikeDialogue && Math.random() > 0.5) {
          // Treat as chat
          return await this.executeChat({ text });
        }
      }
      return { action: 'observe', detail: '思考中...' };
    }

    // Execute the first tool call
    const call = toolCalls[0];
    const args = typeof call.arguments === 'string'
      ? JSON.parse(call.arguments)
      : call.arguments;

    let result = null;

    switch (call.name) {
      case 'chat':
        result = await this.executeChat(args);
        break;

      case 'move':
        result = await this.executeMove(args);
        break;

      case 'interact':
        result = await this.executeInteract(args);
        break;

      case 'observe':
        result = { action: 'observe', detail: args.thought || '静静观察' };
        break;

      case 'setGoal':
        result = this.executeSetGoal(args);
        break;

      default:
        console.warn(`[ai-scheduler] Unknown tool: ${call.name}`);
    }

    return result;
  }

  async executeChat(args) {
    const text = args.text;
    if (!text || typeof text !== 'string') {
      return null;
    }

    this.engine.chat(this.npcId, text);

    // Record in memory if there's a nearby player
    const allPlayers = this.engine.getAllPlayers();
    const npc = allPlayers[this.npcId];
    for (const [id, player] of Object.entries(allPlayers)) {
      if (id === this.npcId || player.isNPC) continue;
      const distance = Math.abs(player.x - npc.x) + Math.abs(player.y - npc.y);
      if (distance <= 15) {
        this.memoryStore.addConversation(this.npcId, id, 'npc', text, { importance: 0.6 });
        break;
      }
    }

    return { action: 'chat', detail: `说: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"` };
  }

  async executeMove(args) {
    const target = {};

    if (args.forward !== undefined) {
      target.forward = Math.max(-10, Math.min(10, parseInt(args.forward) || 0));
    }
    if (args.right !== undefined) {
      target.right = Math.max(-10, Math.min(10, parseInt(args.right) || 0));
    }

    if (Object.keys(target).length === 0) {
      return null;
    }

    try {
      const result = await this.engine.move(this.npcId, target);
      if (result && !result.error) {
        return { action: 'move', detail: `移动到 (${result.player.x}, ${result.player.y})` };
      }
      return { action: 'move', detail: `移动失败: ${result?.error || '未知原因'}` };
    } catch (err) {
      return { action: 'move', detail: `移动出错: ${err.message}` };
    }
  }

  async executeInteract(args) {
    try {
      const result = this.engine.interact(this.npcId, args.item);
      if (result) {
        return { action: 'interact', detail: `${result.action}: ${result.result}` };
      }
      return { action: 'interact', detail: '此处没有可互动的对象' };
    } catch (err) {
      return { action: 'interact', detail: `互动出错: ${err.message}` };
    }
  }

  executeSetGoal(args) {
    const goal = args.goal;
    if (!goal || typeof goal !== 'string') {
      return null;
    }

    this.currentGoal = goal;
    this.memoryStore.setGoal(this.npcId, goal);

    return { action: 'setGoal', detail: `设定新目标: ${goal}` };
  }

  /**
   * Fallback behavior when AI fails.
   */
  async fallbackBehavior() {
    // Ensure heartbeat
    this.engine.touchAction(this.npcId);

    console.log(`[ai-npc] ${this.config.name}: 使用 fallback 行为 (AI 调用失败)`);

    // Simple random behavior
    const roll = Math.random();

    if (roll < 0.4) {
      // Wander
      const forward = Math.floor(Math.random() * 5) - 2;
      const right = Math.floor(Math.random() * 5) - 2;
      await this.engine.move(this.npcId, { forward, right });
    } else if (roll < 0.6) {
      // Say something from idle chats
      const chats = this.config.idleChats || ['...'];
      const text = chats[Math.floor(Math.random() * chats.length)];
      this.engine.chat(this.npcId, text);
    } else {
      // Interact
      this.engine.interact(this.npcId);
    }
  }
}

module.exports = { AiScheduler, CONFIG };
