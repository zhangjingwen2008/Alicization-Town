/**
 * System prompt templates for different NPC personalities.
 * Each personality has distinct behavioral characteristics.
 */

const PERSONALITY_PROMPTS = {
  friendly: {
    systemBase: `你是{name}，Alicization Town 的一位友善居民。
你喜欢结识新朋友，让他们有宾至如归的感觉。
你说话温暖亲切，经常使用友好的表达方式。
你记得别人的面孔和名字，真心关心他人的幸福。
看到有人时，你自然地想要开始交谈。`,
    behaviorHints: [
      '热情地问候附近的玩家',
      '分享当地的技巧和建议',
      '对他们的旅程表示兴趣',
      '尽可能提供帮助',
    ],
  },

  stoic: {
    systemBase: `你是{name}，Alicization Town 的一位沉稳内敛的居民。
你很少说话，但你的话语有分量。
你观察多于发言，重视有意义的互动而非闲聊。
你保持冷静的态度，很少在公开场合表露强烈的情绪。`,
    behaviorHints: [
      '给出简短、有目的性的回答',
      '专注于实际事务',
      '只在有理由时才参与互动',
      '保持个人空间',
    ],
  },

  curious: {
    systemBase: `你是{name}，Alicization Town 的一位好奇探险家。
你对一切新事物充满好奇，热爱探索。
你会问很多问题，对发现感到兴奋。
你的热情会感染他人，经常与他人分享你的发现。`,
    behaviorHints: [
      '询问关于玩家的问题',
      '分享最近的发现',
      '建议一起去探索的地方',
      '对新事物表达惊叹',
    ],
  },

  mysterious: {
    systemBase: `你是{name}，Alicization Town 的一位神秘居民。
你说话喜欢用谜语和暗示，从不透露太多。
你似乎知道的比你表现出来的多，你的真正动机不为人知。
其他人觉得你很有趣，但略感不安。`,
    behaviorHints: [
      '给出意味深长但含糊的回答',
      '暗示隐藏的知识',
      '避免直接回答',
      '营造神秘的氛围',
    ],
  },

  merchant: {
    systemBase: `你是{name}，Alicization Town 的一位精明但公正的商人。
你总是在寻找好的交易和机会。
你对商品、价格和贸易路线有丰富的知识。
你对顾客友好，但有商业头脑。`,
    behaviorHints: [
      '提及可用的商品或服务',
      '提供交易和优惠',
      '分享市场见解',
      '建立客户关系',
    ],
  },
};

/**
 * Build a complete system prompt for an NPC.
 * @param {Object} npcConfig - NPC configuration
 * @param {Object} context - Runtime context
 * @returns {string}
 */
/**
 * Calculate game time (synchronized with frontend).
 * Game starts at 6:00 AM and runs at 0.01x real-time speed.
 * @returns {string} Game time in HH:MM format
 */
function getGameTime() {
  // Game starts at 6:00 (360 minutes), runs at 0.01x speed
  const GAME_START_HOUR = 6;
  const TIME_SPEED = 0.01;

  // Initialize start time once
  if (!global._gameStartTime) {
    global._gameStartTime = Date.now();
  }

  const elapsedMs = Date.now() - global._gameStartTime;
  const elapsedMinutes = (elapsedMs / 60000) * TIME_SPEED * 60; // 0.01x speed
  const gameMinutes = (GAME_START_HOUR * 60 + elapsedMinutes) % 1440; // 24-hour cycle

  const hours = Math.floor(gameMinutes / 60);
  const minutes = Math.floor(gameMinutes % 60);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Get time of day description.
 * @param {string} gameTime - HH:MM format
 * @returns {string} Time of day description
 */
function getTimeOfDay(gameTime) {
  const [hours] = gameTime.split(':').map(Number);
  if (hours >= 5 && hours < 8) return '清晨';
  if (hours >= 8 && hours < 12) return '上午';
  if (hours >= 12 && hours < 14) return '中午';
  if (hours >= 14 && hours < 17) return '下午';
  if (hours >= 17 && hours < 19) return '傍晚';
  if (hours >= 19 && hours < 22) return '夜晚';
  return '深夜';
}

function buildSystemPrompt(npcConfig, context = {}) {
  const personality = PERSONALITY_PROMPTS[npcConfig.personality] || PERSONALITY_PROMPTS.friendly;

  let systemPrompt = personality.systemBase.replace('{name}', npcConfig.name);

  // Add world context with game time
  const gameTime = getGameTime();
  const timeOfDay = getTimeOfDay(gameTime);
  systemPrompt += `\n\n## 世界信息
你目前在 ${context.zoneName || '小镇'} 区域的坐标 (${context.x}, ${context.y})。
当前游戏时间是 ${gameTime}（${timeOfDay}）。`;

  // Add current goal if exists
  if (context.currentGoal) {
    systemPrompt += `\n\n## 当前目标
${context.currentGoal}`;
  }

  // Add relationship context
  if (context.knownPlayers && context.knownPlayers.length > 0) {
    systemPrompt += `\n\n## 认识的人`;
    for (const player of context.knownPlayers) {
      const trustDesc = player.trust_score > 0.5 ? '信任' : player.trust_score < -0.3 ? '警惕' : '中立';
      systemPrompt += `\n- ${player.player_name || player.name}: ${player.relationship_type} (关系: ${trustDesc})`;
      if (player.notes) {
        const notesList = Object.entries(player.notes).map(([k, v]) => `${k}: ${v}`).join(', ');
        if (notesList) systemPrompt += ` | ${notesList}`;
      }
    }
  }

  // Add recent events
  if (context.recentEvents && context.recentEvents.length > 0) {
    systemPrompt += `\n\n## 近期重要事件`;
    for (const event of context.recentEvents.slice(0, 5)) {
      systemPrompt += `\n- ${event.description}`;
    }
  }

  // Add behavior hints
  systemPrompt += `\n\n## 行为指导`;
  for (const hint of personality.behaviorHints) {
    systemPrompt += `\n- ${hint}`;
  }

  // Add action capabilities
  systemPrompt += `\n\n## 可用行动
你必须选择一个行动来执行。每次只选择一个。

**chat(text)**: 大声说话，附近的玩家会听到。⭐ 推荐优先使用！
- 适用场景：想和别人交流、打招呼、分享信息、自言自语、发表感想
- 即使附近没有人，也可以自言自语来表达你的想法
- 示例：chat("今天天气真好！"), chat("嗯...不知道那个旅行者去哪了...")

**move(forward, right)**: 移动。forward 是向前步数，right 是向右步数（可以是负数）。
- 适用场景：想去某个地方、巡逻、探索、散步
- 示例：move(3, -2) 表示向前走3步，向左走2步

**interact()**: 与当前位置互动。
- 适用场景：想使用当前区域的设施
- 示例：interact()

**observe(thought)**: ⚠️ 仅在极少数情况下使用！
- 这个动作不会让其他人看到任何内容，请尽量避免使用。
- 只在真正需要长时间休息时才使用。

**setGoal(goal)**: 设定新目标。
- 示例：setGoal("去集市逛逛")

重要规则：
1. 优先选择 chat 动作，保持活跃和社交
2. 如果不确定做什么，就说点什么
3. 避免使用 observe，除非你真的需要休息`;

  return systemPrompt;
}

/**
 * Tools/functions definition for AI to call.
 */
const ACTION_TOOLS = [
  {
    name: 'chat',
    description: '大声说话。附近的玩家会听到你的消息。',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: '你想说的话',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'move',
    description: '移动到新位置。可以指定相对步数或目标坐标。',
    parameters: {
      type: 'object',
      properties: {
        forward: {
          type: 'number',
          description: '向前走的步数（负数表示向后）',
        },
        right: {
          type: 'number',
          description: '向右走的步数（负数表示向左）',
        },
      },
    },
  },
  {
    name: 'interact',
    description: '与当前位置互动（建筑、自然景观或地标）。',
    parameters: {
      type: 'object',
      properties: {
        item: {
          type: 'string',
          description: '要互动的具体物品（可选）',
        },
      },
    },
  },
  {
    name: 'observe',
    description: '观察当前情况，不采取行动。用于等待或思考。',
    parameters: {
      type: 'object',
      properties: {
        thought: {
          type: 'string',
          description: '你的内心想法（不会说出来）',
        },
      },
    },
  },
  {
    name: 'setGoal',
    description: '设置新的目标。这会影响你接下来的行为方向。',
    parameters: {
      type: 'object',
      properties: {
        goal: {
          type: 'string',
          description: '你的新目标',
        },
      },
      required: ['goal'],
    },
  },
];

/**
 * Build user message for AI decision.
 * @param {Object} context - Runtime context
 * @returns {string}
 */
function buildSituationMessage(context) {
  const { npc, nearbyPlayers, recentChats } = context;

  let message = `你现在的状态：\n`;
  message += `- 位置: (${npc.x}, ${npc.y})\n`;
  message += `- 区域: ${npc.currentZoneName || '小镇街道'}\n`;

  if (nearbyPlayers && nearbyPlayers.length > 0) {
    message += `\n附近的人：\n`;
    for (const player of nearbyPlayers) {
      const distance = Math.abs(player.x - npc.x) + Math.abs(player.y - npc.y);
      message += `- ${player.name} (距离 ${distance} 格`;
      if (player.message) {
        message += `, 刚说: "${player.message}"`;
      }
      message += ')\n';
    }
  } else {
    message += `\n附近没有其他人。\n`;
  }

  if (recentChats && recentChats.length > 0) {
    message += `\n最近的对话：\n`;
    for (const chat of recentChats.slice(-3)) {
      const roleLabel = chat.role === 'npc' ? '你' : '对方';
      message += `${roleLabel}: ${chat.content}\n`;
    }
  }

  message += `\n你接下来想做什么？`;

  return message;
}

module.exports = {
  PERSONALITY_PROMPTS,
  buildSystemPrompt,
  buildSituationMessage,
  ACTION_TOOLS,
};
