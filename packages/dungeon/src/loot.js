// 战利品表 —— 地牢宝箱和怪物掉落

const LOOT_TABLE = {
  // ── 消耗品 ──
  potion_small:   { name: '小型药水',     emoji: '🧪', type: 'consumable', effect: 'heal', value: 15, weight: 10, tier: 1 },
  potion_medium:  { name: '中型药水',     emoji: '🧪', type: 'consumable', effect: 'heal', value: 30, weight: 5,  tier: 2 },
  potion_large:   { name: '大型药水',     emoji: '🧪', type: 'consumable', effect: 'heal', value: 60, weight: 2,  tier: 3 },
  smoke_bomb:     { name: '烟雾弹',       emoji: '💨', type: 'consumable', effect: 'flee', value: 0,  weight: 4,  tier: 1 },

  // ── 装备 ──
  rusty_sword:    { name: '生锈短剑',     emoji: '🗡️', type: 'weapon', atk: 2,  weight: 8, tier: 1 },
  iron_sword:     { name: '铁剑',         emoji: '⚔️', type: 'weapon', atk: 5,  weight: 4, tier: 2 },
  flame_blade:    { name: '烈焰之刃',     emoji: '🔥', type: 'weapon', atk: 10, weight: 1, tier: 3 },
  wooden_shield:  { name: '木盾',         emoji: '🛡️', type: 'armor',  def: 2,  weight: 6, tier: 1 },
  iron_armor:     { name: '铁甲',         emoji: '🛡️', type: 'armor',  def: 5,  weight: 3, tier: 2 },
  dragon_scale:   { name: '龙鳞甲',       emoji: '🐲', type: 'armor',  def: 9,  weight: 1, tier: 3 },

  // ── 素材/货币 ──
  gold_pouch:     { name: '金币袋',       emoji: '💰', type: 'gold', value: 20,  weight: 12, tier: 1 },
  gem:            { name: '未鉴定宝石',   emoji: '💎', type: 'gold', value: 50,  weight: 3,  tier: 2 },
  ancient_relic:  { name: '古代遗物',     emoji: '🏺', type: 'gold', value: 120, weight: 1,  tier: 3 },
};

/**
 * 加权随机抽取一件战利品
 * @param {number} tier - 最高 tier
 * @param {Function} rng - 随机数生成器
 * @returns {Object|null}
 */
function rollLoot(tier, rng) {
  const candidates = Object.entries(LOOT_TABLE)
    .filter(([, item]) => item.tier <= tier);
  if (candidates.length === 0) return null;

  const totalWeight = candidates.reduce((s, [, i]) => s + i.weight, 0);
  let roll = rng() * totalWeight;
  for (const [key, item] of candidates) {
    roll -= item.weight;
    if (roll <= 0) return { key, ...item };
  }
  // fallback
  const [key, item] = candidates[candidates.length - 1];
  return { key, ...item };
}

/** 怪物掉落 */
function rollMonsterDrop(monster, rng) {
  if (rng() > monster.lootChance) return null;
  return rollLoot(monster.tier, rng);
}

/** 宝箱掉落 (1-3 件) */
function rollChestLoot(floor, rng) {
  const tier = floor <= 3 ? 1 : floor <= 6 ? 2 : 3;
  const count = 1 + Math.floor(rng() * 2); // 1-2 items
  const items = [];
  for (let i = 0; i < count; i++) {
    const item = rollLoot(tier, rng);
    if (item) items.push(item);
  }
  return items;
}

module.exports = { LOOT_TABLE, rollLoot, rollMonsterDrop, rollChestLoot };
