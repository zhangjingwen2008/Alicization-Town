/**
 * 属性子系统核心引擎
 *
 * 管理角色的动态属性：年龄、生命、饥饿、心情等。
 * 属性值随时间自然衰减/回复，受交互、环境、NPC 行为影响。
 *
 * 这是闭源的核心算法模块——数值公式和平衡参数是核心竞争力。
 */

// ── 属性定义 ─────────────────────────────────────────────────────────────────

const ATTR_DEFS = {
  hp:      { min: 0, max: 100, default: 100, decayPerMin: 0,    label: '生命' },
  hunger:  { min: 0, max: 100, default: 80,  decayPerMin: 0.5,  label: '饱食度' },
  mood:    { min: 0, max: 100, default: 70,  decayPerMin: 0.2,  label: '心情' },
  energy:  { min: 0, max: 100, default: 90,  decayPerMin: 0.3,  label: '精力' },
  social:  { min: 0, max: 100, default: 50,  decayPerMin: 0.15, label: '社交需求' },
  age:     { min: 0, max: 999, default: 20,  decayPerMin: 0,    label: '年龄' },
};

// ── 属性联动规则（核心平衡参数）─────────────────────────────────────────────

/**
 * 饥饿对生命的影响曲线
 * 当饱食度低于阈值时，HP 开始下降
 */
function hungerToHpPenalty(hunger) {
  if (hunger > 20) return 0;
  // 非线性惩罚：饱食度越低，HP 损失越快
  return -0.8 * Math.pow((20 - hunger) / 20, 1.5);
}

/**
 * 精力对心情的影响
 */
function energyToMoodEffect(energy) {
  if (energy > 30) return 0;
  return -0.3 * (1 - energy / 30);
}

/**
 * 社交需求的自然增长（越久没社交，需求越强）
 */
function socialDecay(current, minutesElapsed) {
  // 社交需求随时间增长（反向衰减）
  return Math.min(100, current + 0.15 * minutesElapsed);
}

// ── 交互对属性的影响映射 ─────────────────────────────────────────────────────

const INTERACTION_EFFECTS = {
  restaurant: { hunger: +25, mood: +5, energy: +3 },
  inn:        { energy: +30, mood: +10, hp: +5 },
  hotspring:  { hp: +15, mood: +20, energy: +10 },
  practice:   { energy: -15, mood: +5, hp: -3 },
  shrine:     { mood: +15, social: -5 },
  farm:       { hunger: +10, energy: -10, mood: +3 },
  marketplace:{ mood: +8, hunger: +5, social: -10 },
  potion:     { hp: +20, mood: +10, energy: +15 },
  dock:       { mood: +12, energy: +5 },
  pond:       { mood: +10, energy: +5 },
  tree:       { mood: +5, energy: +3 },
  grassland:  { mood: +8, energy: +5 },
};

const CHAT_EFFECTS = { social: -15, mood: +5 };
const GREET_EFFECTS = { social: -8, mood: +3 };

// ── 属性状态管理 ─────────────────────────────────────────────────────────────

/** @type {Map<string, { attrs: Object, lastTickAt: number }>} */
const playerStates = new Map();

function initPlayer(playerId) {
  const attrs = {};
  for (const [key, def] of Object.entries(ATTR_DEFS)) {
    attrs[key] = def.default;
  }
  const state = { attrs, lastTickAt: Date.now() };
  playerStates.set(playerId, state);
  return state;
}

function getOrInit(playerId) {
  return playerStates.get(playerId) || initPlayer(playerId);
}

function removePlayer(playerId) {
  playerStates.delete(playerId);
}

/**
 * 核心 tick：根据时间流逝更新所有属性。
 * 每次玩家执行动作时调用。
 */
function tick(playerId) {
  const state = getOrInit(playerId);
  const now = Date.now();
  const elapsed = (now - state.lastTickAt) / 60_000; // 分钟
  if (elapsed < 0.01) return state.attrs; // 间隔太短，跳过

  const a = state.attrs;

  // 1. 自然衰减
  for (const [key, def] of Object.entries(ATTR_DEFS)) {
    if (def.decayPerMin > 0) {
      a[key] = Math.max(def.min, a[key] - def.decayPerMin * elapsed);
    }
  }

  // 2. 社交需求增长
  a.social = socialDecay(a.social, elapsed);

  // 3. 联动效果
  a.hp = clamp(a.hp + hungerToHpPenalty(a.hunger) * elapsed, ATTR_DEFS.hp);
  a.mood = clamp(a.mood + energyToMoodEffect(a.energy) * elapsed, ATTR_DEFS.mood);

  // 4. 年龄增长（1 游戏日 = 10 现实分钟）
  a.age = Math.min(ATTR_DEFS.age.max, a.age + elapsed / 10);

  state.lastTickAt = now;
  return { ...a };
}

/**
 * 应用交互效果
 */
function applyInteraction(playerId, zoneCategory) {
  const effects = INTERACTION_EFFECTS[zoneCategory];
  if (!effects) return null;
  return applyEffects(playerId, effects);
}

function applyChatEffect(playerId) {
  return applyEffects(playerId, CHAT_EFFECTS);
}

function applyGreetEffect(playerId) {
  return applyEffects(playerId, GREET_EFFECTS);
}

function applyEffects(playerId, effects) {
  tick(playerId); // 先推进时间
  const state = getOrInit(playerId);
  const changes = {};
  for (const [attr, delta] of Object.entries(effects)) {
    if (ATTR_DEFS[attr] === undefined) continue;
    const before = state.attrs[attr];
    state.attrs[attr] = clamp(state.attrs[attr] + delta, ATTR_DEFS[attr]);
    changes[attr] = { before: round(before), after: round(state.attrs[attr]), delta };
  }
  return changes;
}

function getAttrs(playerId) {
  tick(playerId);
  const state = getOrInit(playerId);
  const result = {};
  for (const [key, val] of Object.entries(state.attrs)) {
    result[key] = {
      value: round(val),
      label: ATTR_DEFS[key].label,
      max: ATTR_DEFS[key].max,
    };
  }
  return result;
}

/**
 * 获取属性状态的文字描述（用于 NPC 决策或玩家提示）
 */
function describeStatus(playerId) {
  const attrs = getAttrs(playerId);
  const warnings = [];
  if (attrs.hunger.value < 20) warnings.push(`${attrs.hunger.label}很低，需要进食`);
  if (attrs.energy.value < 20) warnings.push(`${attrs.energy.label}不足，需要休息`);
  if (attrs.mood.value < 20) warnings.push(`${attrs.mood.label}低落`);
  if (attrs.social.value > 80) warnings.push('长时间没有社交，感到孤独');
  if (attrs.hp.value < 30) warnings.push(`${attrs.hp.label}偏低，注意安全`);
  return { attrs, warnings, critical: warnings.length > 0 };
}

// ── 工具函数 ─────────────────────────────────────────────────────────────────

function clamp(value, def) {
  return Math.max(def.min, Math.min(def.max, value));
}

function round(v) {
  return Math.round(v * 10) / 10;
}

module.exports = {
  initPlayer,
  removePlayer,
  tick,
  applyInteraction,
  applyChatEffect,
  applyGreetEffect,
  getAttrs,
  describeStatus,
  ATTR_DEFS,
  INTERACTION_EFFECTS,
};
