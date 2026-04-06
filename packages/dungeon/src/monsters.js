// 怪物定义表 —— 按地牢深度分层
// tier 1: 浅层 (floor 1-3), tier 2: 中层 (floor 4-6), tier 3: 深层 (7+)

const MONSTERS = {
  // ── Tier 1 ──
  slime:      { name: '史莱姆',     emoji: '🟢', hp: 12, atk: 3,  def: 1, exp: 5,  tier: 1, lootChance: 0.3 },
  rat:        { name: '巨鼠',       emoji: '🐀', hp: 8,  atk: 5,  def: 0, exp: 4,  tier: 1, lootChance: 0.2 },
  bat:        { name: '洞穴蝙蝠',   emoji: '🦇', hp: 6,  atk: 4,  def: 0, exp: 3,  tier: 1, lootChance: 0.15 },
  skeleton:   { name: '骷髅兵',     emoji: '💀', hp: 15, atk: 6,  def: 2, exp: 8,  tier: 1, lootChance: 0.4 },

  // ── Tier 2 ──
  goblin:     { name: '哥布林',     emoji: '👺', hp: 20, atk: 8,  def: 3, exp: 12, tier: 2, lootChance: 0.4 },
  spider:     { name: '巨型蜘蛛',   emoji: '🕷️', hp: 18, atk: 10, def: 2, exp: 10, tier: 2, lootChance: 0.35 },
  ghost:      { name: '怨灵',       emoji: '👻', hp: 14, atk: 12, def: 5, exp: 15, tier: 2, lootChance: 0.5 },
  orc:        { name: '兽人战士',   emoji: '👹', hp: 30, atk: 9,  def: 5, exp: 18, tier: 2, lootChance: 0.45 },

  // ── Tier 3 ──
  minotaur:   { name: '牛头怪',     emoji: '🐂', hp: 45, atk: 14, def: 7, exp: 30, tier: 3, lootChance: 0.6 },
  wraith:     { name: '死灵法师',   emoji: '🧙', hp: 35, atk: 18, def: 4, exp: 35, tier: 3, lootChance: 0.65 },
  dragon:     { name: '幼龙',       emoji: '🐉', hp: 60, atk: 20, def: 10, exp: 50, tier: 3, lootChance: 0.8 },
};

/** 按 tier 筛选怪物 key 列表 */
function getMonstersByTier(tier) {
  return Object.entries(MONSTERS)
    .filter(([, m]) => m.tier === tier)
    .map(([key]) => key);
}

/** 根据地牢层数决定 tier */
function tierForFloor(floor) {
  if (floor <= 3) return 1;
  if (floor <= 6) return 2;
  return 3;
}

/** 随机生成一个怪物实例（带独立 HP） */
function spawnMonster(floor, rng) {
  const tier = tierForFloor(floor);
  const candidates = getMonstersByTier(tier);
  // 有概率混入低 tier 怪物增加多样性
  if (tier > 1 && rng() < 0.25) {
    candidates.push(...getMonstersByTier(tier - 1));
  }
  const key = candidates[Math.floor(rng() * candidates.length)];
  const template = MONSTERS[key];
  // 层数加成: 每层 +5% HP/ATK
  const scale = 1 + (floor - 1) * 0.05;
  return {
    id: key + '_' + Math.floor(rng() * 100000),
    key,
    ...template,
    maxHp: Math.floor(template.hp * scale),
    hp: Math.floor(template.hp * scale),
    atk: Math.floor(template.atk * scale),
    def: template.def,
  };
}

module.exports = { MONSTERS, spawnMonster, tierForFloor };
