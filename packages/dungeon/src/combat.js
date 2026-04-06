// 回合制战斗系统

/**
 * 计算伤害（含随机浮动）
 * @param {number} atk - 攻击方攻击力
 * @param {number} def - 防御方防御力
 * @returns {number} 最终伤害（至少 1）
 */
function calcDamage(atk, def) {
  const base = Math.max(1, atk - def);
  const variance = Math.floor(base * 0.3);  // ±30%
  const roll = base + Math.floor(Math.random() * (variance * 2 + 1)) - variance;
  return Math.max(1, roll);
}

/**
 * 执行一次攻击回合
 * @param {Object} attacker - { name, atk, def, hp, maxHp, ... }
 * @param {Object} defender - { name, atk, def, hp, maxHp, ... }
 * @returns {{ damage: number, log: string }}
 */
function attackRound(attacker, defender) {
  const damage = calcDamage(attacker.atk, defender.def);
  defender.hp = Math.max(0, defender.hp - damage);
  const log = `${attacker.name || attacker.playerName} 对 ${defender.name} 造成了 ${damage} 点伤害 (${defender.name} HP: ${defender.hp}/${defender.maxHp})`;
  return { damage, log };
}

/**
 * 防御回合（减少受到的伤害）
 * @param {Object} player - 玩家战斗状态
 * @param {Object} monster - 怪物
 * @returns {{ blocked: number, damage: number, log: string }}
 */
function defendRound(player, monster) {
  // 防御时 def 临时 ×2
  const boostedDef = player.def * 2;
  const damage = calcDamage(monster.atk, boostedDef);
  player.hp = Math.max(0, player.hp - damage);
  const log = `${player.playerName} 防御！${monster.name} 的攻击被削弱，仅造成 ${damage} 点伤害 (HP: ${player.hp}/${player.maxHp})`;
  return { blocked: boostedDef, damage, log };
}

/**
 * 逃跑判定
 * @param {Object} player
 * @param {Object} monster
 * @returns {{ success: boolean, damage: number, log: string }}
 */
function fleeAttempt(player, monster) {
  // 逃跑成功率: 50% 基础 + (玩家速度优势)
  const success = Math.random() < 0.5;
  if (success) {
    return { success: true, damage: 0, log: `${player.playerName} 成功逃离了 ${monster.name}！` };
  }
  // 逃跑失败，怪物追击
  const damage = calcDamage(monster.atk, Math.floor(player.def * 0.5));
  player.hp = Math.max(0, player.hp - damage);
  return {
    success: false,
    damage,
    log: `${player.playerName} 逃跑失败！${monster.name} 趁机攻击，造成 ${damage} 点伤害 (HP: ${player.hp}/${player.maxHp})`,
  };
}

/**
 * 创建玩家战斗属性（基础值）
 */
function createPlayerCombatStats(playerName) {
  return {
    playerName,
    maxHp: 50,
    hp: 50,
    atk: 8,
    def: 3,
    inventory: [],
    gold: 0,
    exp: 0,
    level: 1,
  };
}

/**
 * 经验值升级检查
 */
function checkLevelUp(stats) {
  const expNeeded = stats.level * 20;
  const logs = [];
  while (stats.exp >= expNeeded) {
    stats.exp -= expNeeded;
    stats.level += 1;
    stats.maxHp += 5;
    stats.hp = Math.min(stats.hp + 10, stats.maxHp);
    stats.atk += 2;
    stats.def += 1;
    logs.push(`🎉 升级！等级 ${stats.level} (HP+5, ATK+2, DEF+1)`);
  }
  return logs;
}

/**
 * 使用消耗品
 */
function useItem(stats, itemKey) {
  const idx = stats.inventory.findIndex(i => i.key === itemKey);
  if (idx === -1) return { success: false, log: '背包中没有该物品' };
  const item = stats.inventory[idx];
  if (item.type !== 'consumable') return { success: false, log: '该物品不可使用' };
  stats.inventory.splice(idx, 1);
  if (item.effect === 'heal') {
    const healed = Math.min(item.value, stats.maxHp - stats.hp);
    stats.hp += healed;
    return { success: true, log: `使用 ${item.name}，恢复 ${healed} HP (HP: ${stats.hp}/${stats.maxHp})` };
  }
  if (item.effect === 'flee') {
    return { success: true, log: `使用 ${item.name}，可以安全逃离！`, effect: 'flee' };
  }
  return { success: false, log: '未知效果' };
}

module.exports = { calcDamage, attackRound, defendRound, fleeAttempt, createPlayerCombatStats, checkLevelUp, useItem };
