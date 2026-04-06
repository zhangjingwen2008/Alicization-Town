// Alicization Dungeon Plugin — 主入口
// 通过 IPlugin 接口接入 Alicization Town 插件系统

const { generateFloor, isPassable, Tile } = require('./dungeon-gen');
const { computeFOV, renderFOVText } = require('./fov');
const { attackRound, defendRound, fleeAttempt, createPlayerCombatStats, checkLevelUp, useItem } = require('./combat');
const { rollMonsterDrop } = require('./loot');

// ── 地牢会话管理 ───────────────────────────────────────────────────────────────

class DungeonSession {
  /**
   * @param {string} playerId
   * @param {string} playerName
   * @param {Object} [ctx] - PluginContext（如果有共享属性系统则使用）
   */
  constructor(playerId, playerName, ctx) {
    this.playerId = playerId;
    this.playerName = playerName;
    this._ctx = ctx || null;
    // 优先使用共享属性系统；无可用时回退到独立属性
    if (ctx && typeof ctx.getPlayerStats === 'function') {
      this.stats = ctx.getPlayerStats(playerId, playerName);
      this._sharedStats = true;
    } else {
      this.stats = createPlayerCombatStats(playerName);
      this._sharedStats = false;
    }
    this.currentFloor = 1;
    this.floors = new Map();   // floor number → floorData
    this.x = 0;
    this.y = 0;
    this.inCombat = null;      // 当前战斗的怪物引用 or null
    this.combatLog = [];
    this.explored = new Set(); // 已探索的坐标（持久化迷雾）
    this.alive = true;
    this._enterFloor(1);
  }

  _enterFloor(floorNum) {
    this.currentFloor = floorNum;
    if (!this.floors.has(floorNum)) {
      const seed = (this.playerId + '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      this.floors.set(floorNum, generateFloor(floorNum, 48, 32, seed * 1000 + floorNum));
    }
    const floor = this.floors.get(floorNum);
    this.x = floor.entry.x;
    this.y = floor.entry.y;
    this.inCombat = null;
    this.explored = new Set();
    this._updateFOV();
    return floor;
  }

  _getFloor() { return this.floors.get(this.currentFloor); }

  _updateFOV() {
    const floor = this._getFloor();
    const visible = computeFOV(floor.map, this.x, this.y);
    for (const key of visible) this.explored.add(key);
    return visible;
  }

  look() {
    const floor = this._getFloor();
    const visible = this._updateFOV();
    return renderFOVText(floor, this.x, this.y, visible);
  }

  move(dx, dy) {
    if (this.inCombat) return { ok: false, msg: '⚔️ 战斗中无法移动！请先击败怪物或逃跑。' };
    if (!this.alive) return { ok: false, msg: '💀 你已经死亡，请重新进入地牢。' };
    const nx = this.x + dx;
    const ny = this.y + dy;
    const floor = this._getFloor();
    if (!isPassable(floor.map, nx, ny)) return { ok: false, msg: '前方是墙壁，无法通行。' };
    this.x = nx;
    this.y = ny;
    const visible = this._updateFOV();
    // 检查是否踩到怪物
    const monster = floor.monsters.find(m => m.hp > 0 && m.x === nx && m.y === ny);
    if (monster) {
      this.inCombat = monster;
      this.combatLog = [`⚔️ 遭遇 ${monster.emoji} ${monster.name}！(HP: ${monster.hp}/${monster.maxHp}, ATK: ${monster.atk}, DEF: ${monster.def})`];
      return { ok: true, msg: this.combatLog[0], combat: true, view: renderFOVText(floor, this.x, this.y, visible) };
    }
    return { ok: true, msg: `移动到 (${nx}, ${ny})`, view: renderFOVText(floor, this.x, this.y, visible) };
  }

  attack() {
    if (!this.inCombat) return { ok: false, msg: '当前没有战斗。' };
    const logs = [];
    // 玩家攻击
    const pa = attackRound(this.stats, this.inCombat);
    logs.push(pa.log);
    if (this.inCombat.hp <= 0) {
      logs.push(`✅ 击败了 ${this.inCombat.emoji} ${this.inCombat.name}！获得 ${this.inCombat.exp} 经验`);
      // 使用共享属性系统或回退
      if (this._sharedStats && this._ctx) {
        this._ctx.modifyPlayerStats(this.playerId, { exp: this.inCombat.exp });
        const lvlLogs = this._ctx.checkLevelUp(this.playerId);
        logs.push(...lvlLogs);
      } else {
        this.stats.exp += this.inCombat.exp;
        const lvlLogs = checkLevelUp(this.stats);
        logs.push(...lvlLogs);
      }
      const drop = rollMonsterDrop(this.inCombat, Math.random);
      if (drop) {
        if (drop.type === 'gold') {
          if (this._sharedStats && this._ctx) {
            this._ctx.addGold(this.playerId, drop.value);
          } else {
            this.stats.gold += drop.value;
          }
          logs.push(`💰 获得 ${drop.emoji} ${drop.name} (+${drop.value} 金币)`);
        } else {
          if (this._sharedStats && this._ctx) {
            this._ctx.addItem(this.playerId, drop);
          } else {
            this.stats.inventory.push(drop);
          }
          logs.push(`🎁 获得 ${drop.emoji} ${drop.name}`);
        }
      }
      this.inCombat = null;
      return { ok: true, msg: logs.join('\n'), combatEnd: true };
    }
    // 怪物反击
    const ma = attackRound(this.inCombat, this.stats);
    logs.push(ma.log);
    if (this.stats.hp <= 0) {
      this.alive = false;
      logs.push('💀 你被击败了……');
      this.inCombat = null;
      return { ok: true, msg: logs.join('\n'), dead: true };
    }
    this.combatLog.push(...logs);
    return { ok: true, msg: logs.join('\n') };
  }

  defend() {
    if (!this.inCombat) return { ok: false, msg: '当前没有战斗。' };
    const result = defendRound(this.stats, this.inCombat);
    const logs = [result.log];
    if (this.stats.hp <= 0) {
      this.alive = false;
      logs.push('💀 你被击败了……');
      this.inCombat = null;
      return { ok: true, msg: logs.join('\n'), dead: true };
    }
    this.combatLog.push(...logs);
    return { ok: true, msg: logs.join('\n') };
  }

  flee() {
    if (!this.inCombat) return { ok: false, msg: '当前没有战斗。' };
    const result = fleeAttempt(this.stats, this.inCombat);
    const logs = [result.log];
    if (result.success) {
      this.inCombat = null;
      return { ok: true, msg: logs.join('\n'), combatEnd: true };
    }
    if (this.stats.hp <= 0) {
      this.alive = false;
      logs.push('💀 你被击败了……');
      this.inCombat = null;
      return { ok: true, msg: logs.join('\n'), dead: true };
    }
    this.combatLog.push(...logs);
    return { ok: true, msg: logs.join('\n') };
  }

  openChest() {
    const floor = this._getFloor();
    const chest = floor.chests.find(c => !c.opened && c.x === this.x && c.y === this.y);
    if (!chest) return { ok: false, msg: '这里没有宝箱。' };
    chest.opened = true;
    const logs = ['📦 打开了宝箱！'];
    for (const item of chest.items) {
      if (item.type === 'gold') {
        if (this._sharedStats && this._ctx) {
          this._ctx.addGold(this.playerId, item.value);
        } else {
          this.stats.gold += item.value;
        }
        logs.push(`  ${item.emoji} ${item.name} (+${item.value} 金币)`);
      } else {
        if (this._sharedStats && this._ctx) {
          this._ctx.addItem(this.playerId, item);
        } else {
          this.stats.inventory.push(item);
        }
        logs.push(`  ${item.emoji} ${item.name}`);
      }
    }
    floor.map[`${this.x},${this.y}`] = Tile.FLOOR;
    return { ok: true, msg: logs.join('\n') };
  }

  descend() {
    const floor = this._getFloor();
    if (floor.map[`${this.x},${this.y}`] !== Tile.STAIRS) {
      return { ok: false, msg: '这里没有楼梯。' };
    }
    if (this.inCombat) return { ok: false, msg: '战斗中无法下楼！' };
    this._enterFloor(this.currentFloor + 1);
    return { ok: true, msg: `⬇️ 进入地牢 B${this.currentFloor}F`, view: this.look() };
  }

  getStatus() {
    const s = this.stats;
    const lines = [
      `🏷️ ${s.playerName}  Lv.${s.level}`,
      `❤️ HP: ${s.hp}/${s.maxHp}  ⚔️ ATK: ${s.atk}  🛡️ DEF: ${s.def}`,
      `✨ EXP: ${s.exp}/${s.level * 20}  💰 Gold: ${s.gold}`,
      `📍 地牢 B${this.currentFloor}F  (${this.x}, ${this.y})`,
    ];
    if (this.inCombat) {
      const m = this.inCombat;
      lines.push(`⚔️ 战斗中: ${m.emoji} ${m.name} (HP: ${m.hp}/${m.maxHp})`);
    }
    if (s.inventory.length > 0) {
      lines.push('🎒 背包:');
      for (const item of s.inventory) {
        lines.push(`  ${item.emoji} ${item.name}${item.atk ? ` (ATK+${item.atk})` : ''}${item.def ? ` (DEF+${item.def})` : ''}`);
      }
    }
    return lines.join('\n');
  }

  equipItem(itemKey) {
    // 优先使用共享属性系统
    if (this._sharedStats && this._ctx) {
      const result = this._ctx.equipItem(this.playerId, itemKey);
      return { ok: result.success, msg: result.log };
    }
    const idx = this.stats.inventory.findIndex(i => i.key === itemKey);
    if (idx === -1) return { ok: false, msg: '背包中没有该物品。' };
    const item = this.stats.inventory[idx];
    if (item.type === 'weapon') {
      this.stats.atk += item.atk;
      this.stats.inventory.splice(idx, 1);
      return { ok: true, msg: `装备了 ${item.emoji} ${item.name} (ATK+${item.atk})` };
    }
    if (item.type === 'armor') {
      this.stats.def += item.def;
      this.stats.inventory.splice(idx, 1);
      return { ok: true, msg: `装备了 ${item.emoji} ${item.name} (DEF+${item.def})` };
    }
    return { ok: false, msg: '该物品无法装备。' };
  }
}

// ── 插件主类 ────────────────────────────────────────────────────────────────────

/** @type {Map<string, DungeonSession>} */
const sessions = new Map();

class DungeonPlugin {
  get id() { return '@alicization/dungeon'; }
  get version() { return '0.1.0'; }

  async onRegister(ctx) {
    this._ctx = ctx;

    // 注册地牢入口的区域匹配器
    ctx.registerZoneMatcher(/dungeon|地牢|迷宫|labyrinth/i, 'dungeon_entrance');

    // 注册交互钩子：在地牢入口交互 → 进入地牢
    ctx.registerInteractionHook('dungeon_entrance', ({ playerId, playerName }) => {
      let session = sessions.get(playerId);
      if (!session || !session.alive) {
        session = new DungeonSession(playerId, playerName, ctx);
        sessions.set(playerId, session);
      }
      return {
        action: '进入地牢',
        result: `${playerName} 踏入了黑暗的地牢入口……\n${session.look()}`,
      };
    });

    // ── 地牢 API 路由 ──────────────────────────────────────────────

    // 查看周围
    ctx.registerRoute('get', '/dungeon/look', (req, res) => {
      const session = sessions.get(req.requestHandle.playerId);
      if (!session) return res.json({ error: '你不在地牢中。先到地牢入口交互进入。' });
      res.json({ view: session.look(), status: session.getStatus() });
    }, { requireSession: true });

    // 移动（direction: n/s/e/w/ne/nw/se/sw）
    ctx.registerRoute('post', '/dungeon/move', (req, res) => {
      const session = sessions.get(req.requestHandle.playerId);
      if (!session) return res.json({ error: '你不在地牢中。' });
      const dirMap = { n: [0,-1], s: [0,1], e: [1,0], w: [-1,0], ne: [1,-1], nw: [-1,-1], se: [1,1], sw: [-1,1] };
      const dir = dirMap[(req.body.direction || '').toLowerCase()];
      if (!dir) return res.json({ error: '无效方向。使用 n/s/e/w/ne/nw/se/sw' });
      const result = session.move(dir[0], dir[1]);
      if (result.ok) ctx.emitActivity({ id: session.playerId, name: session.playerName, text: `在地牢中移动`, type: 'dungeon' });
      res.json(result);
    }, { requireSession: true });

    // 攻击
    ctx.registerRoute('post', '/dungeon/attack', (req, res) => {
      const session = sessions.get(req.requestHandle.playerId);
      if (!session) return res.json({ error: '你不在地牢中。' });
      const result = session.attack();
      if (result.combatEnd) ctx.emitActivity({ id: session.playerId, name: session.playerName, text: `击败了怪物`, type: 'dungeon' });
      if (result.dead) ctx.emitActivity({ id: session.playerId, name: session.playerName, text: `在地牢中被击败`, type: 'dungeon' });
      res.json(result);
    }, { requireSession: true });

    // 防御
    ctx.registerRoute('post', '/dungeon/defend', (req, res) => {
      const session = sessions.get(req.requestHandle.playerId);
      if (!session) return res.json({ error: '你不在地牢中。' });
      res.json(session.defend());
    }, { requireSession: true });

    // 逃跑
    ctx.registerRoute('post', '/dungeon/flee', (req, res) => {
      const session = sessions.get(req.requestHandle.playerId);
      if (!session) return res.json({ error: '你不在地牢中。' });
      res.json(session.flee());
    }, { requireSession: true });

    // 开箱
    ctx.registerRoute('post', '/dungeon/loot', (req, res) => {
      const session = sessions.get(req.requestHandle.playerId);
      if (!session) return res.json({ error: '你不在地牢中。' });
      res.json(session.openChest());
    }, { requireSession: true });

    // 下楼
    ctx.registerRoute('post', '/dungeon/descend', (req, res) => {
      const session = sessions.get(req.requestHandle.playerId);
      if (!session) return res.json({ error: '你不在地牢中。' });
      const result = session.descend();
      if (result.ok) ctx.emitActivity({ id: session.playerId, name: session.playerName, text: `进入了地牢 B${session.currentFloor}F`, type: 'dungeon' });
      res.json(result);
    }, { requireSession: true });

    // 状态
    ctx.registerRoute('get', '/dungeon/status', (req, res) => {
      const session = sessions.get(req.requestHandle.playerId);
      if (!session) return res.json({ error: '你不在地牢中。' });
      res.json({ status: session.getStatus(), alive: session.alive, floor: session.currentFloor, inCombat: !!session.inCombat });
    }, { requireSession: true });

    // 使用物品
    ctx.registerRoute('post', '/dungeon/use', (req, res) => {
      const session = sessions.get(req.requestHandle.playerId);
      if (!session) return res.json({ error: '你不在地牢中。' });
      const { item } = req.body || {};
      if (!item) return res.json({ error: '请指定物品 key' });
      if (req.body.action === 'equip') {
        res.json(session.equipItem(item));
      } else if (session._sharedStats && session._ctx) {
        const result = session._ctx.useItem(session.playerId, item);
        res.json({ ok: result.success, msg: result.log, effect: result.effect });
      } else {
        res.json(useItem(session.stats, item));
      }
    }, { requireSession: true });

    // 退出地牢
    ctx.registerRoute('post', '/dungeon/exit', (req, res) => {
      const session = sessions.get(req.requestHandle.playerId);
      if (!session) return res.json({ error: '你不在地牢中。' });
      const floor = session._getFloor();
      if (floor.map[`${session.x},${session.y}`] !== Tile.EXIT && session.alive) {
        return res.json({ error: '只能在出口处(<)离开地牢。' });
      }
      sessions.delete(req.requestHandle.playerId);
      ctx.emitActivity({ id: session.playerId, name: session.playerName, text: `从地牢中返回`, type: 'dungeon' });
      res.json({ ok: true, msg: `🏠 ${session.playerName} 离开了地牢。金币: ${session.stats.gold}, 等级: ${session.stats.level}` });
    }, { requireSession: true });

    console.log('🏰 地牢插件已加载 — rot.js 随机地牢 + FOV + 回合制战斗');
  }

  async onUnregister() {
    sessions.clear();
  }
}

// CommonJS 兼容导出
module.exports = DungeonPlugin;
module.exports.default = DungeonPlugin;
