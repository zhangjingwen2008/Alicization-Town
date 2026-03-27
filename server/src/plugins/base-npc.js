/**
 * BaseNpcPlugin — 将内置 NPC 行为策略注册为插件。
 *
 * 注册 'base/weighted-random' 策略，这是现有 NpcBehavior 中的默认行为逻辑。
 * NPC 配置中可通过 strategy: 'base/weighted-random' 引用（或省略使用默认）。
 * 闭源插件可注册 'advanced/llm-driven' 等高级策略。
 */

const { IPlugin } = require('@alicization/core-interfaces');

class BaseNpcPlugin extends IPlugin {
  get id() { return 'base/npc'; }
  get version() { return '1.0.0'; }

  async onRegister(ctx) {
    ctx.registerNpcStrategy('base/weighted-random', baseWeightedRandomStrategy);
  }
}

/**
 * 基础加权随机策略 — 从现有 NpcBehavior 提取的决策逻辑。
 *
 * @param {Object} context
 * @param {Object} context.npc          - NPC 玩家对象
 * @param {Object} context.config       - NPC 配置
 * @param {Array}  context.nearbyPlayers - 附近的真人玩家
 * @param {Object} context.engine       - 引擎受限操作接口
 * @param {Map}    context.greetHistory  - 问候历史 (playerId → timestamp)
 * @returns {Promise<{ action: string, detail: string }|null>}
 */
async function baseWeightedRandomStrategy(context) {
  const { npc, config, nearbyPlayers, engine, greetHistory } = context;
  const greetCooldownMs = 60_000;
  const now = Date.now();

  // ── 优先：附近有真人玩家时打招呼 ────────────────────────────────────────
  for (const other of nearbyPlayers) {
    const distance = Math.abs(other.x - npc.x) + Math.abs(other.y - npc.y);
    if (distance > 8) continue;

    const lastGreeted = greetHistory.get(other.id);
    if (lastGreeted && now - lastGreeted < greetCooldownMs) continue;

    greetHistory.set(other.id, now);
    const greetings = config.greetings || [];
    if (greetings.length === 0) continue;
    const text = greetings[Math.floor(Math.random() * greetings.length)];
    engine.chat(npc.id, text);
    return { action: 'greet', detail: `向 ${other.name} 打招呼: "${text}"` };
  }

  // ── 按权重选择行为 ─────────────────────────────────────────────────────
  const action = pickWeightedAction(config.behaviorWeights);

  switch (action) {
    case 'wander':
      return doWander(npc, config, engine);
    case 'chat':
      return doChat(npc, config, engine);
    case 'interact':
      return doInteract(npc, engine);
    case 'idle':
    default:
      return { action: 'idle', detail: '静静站着' };
  }
}

function pickWeightedAction(weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [action, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return action;
  }
  return entries[entries.length - 1][0];
}

async function doWander(npc, config, engine) {
  const { wanderStepsMin, wanderStepsMax } = config;
  const rawSteps = wanderStepsMin + Math.floor(Math.random() * (wanderStepsMax - wanderStepsMin + 1));
  const steps = Math.random() < 0.5 ? rawSteps : -rawSteps;
  const target = Math.random() < 0.5 ? { forward: steps } : { right: steps };
  const result = await engine.move(npc.id, target);
  if (!result || result.error) return null;
  return {
    action: 'wander',
    detail: `走了 ${result.pathLength} 步到 (${result.player.x}, ${result.player.y})${result.wasBlocked ? '（被挡住了）' : ''}`,
  };
}

function doChat(npc, config, engine) {
  const chats = config.idleChats || [];
  if (chats.length === 0) return { action: 'idle', detail: '静静站着' };
  const text = chats[Math.floor(Math.random() * chats.length)];
  engine.chat(npc.id, text);
  return { action: 'chat', detail: `说: "${text}"` };
}

function doInteract(npc, engine) {
  const result = engine.interact(npc.id);
  if (!result) return null;
  return { action: 'interact', detail: `在${result.zone}: ${result.action}` };
}

module.exports = BaseNpcPlugin;
