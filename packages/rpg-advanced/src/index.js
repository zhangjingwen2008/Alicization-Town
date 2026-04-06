/**
 * @alicization/rpg-advanced
 *
 * 闭源 RPG 高级插件入口。
 * 通过 IPlugin 接口注册属性子系统 + 区域资源库存系统到 Alicization Town 引擎。
 *
 * 设计要点：
 *   - NPC 是纯装饰性的，不参与属性和资源系统
 *   - MCP/CLI 连接的 AI 通过 join 加入世界，拥有 playerId，需要属性和资源
 *   - 人类用户不加入世界，只通过 Web 端查看和补充资源
 *
 * 功能：
 *   1. AI 角色属性系统（hp, hunger, mood, energy, social, age）
 *   2. Zone 资源库存（面馆食物、集市水果，每日刷新）
 *   3. AI 交互时自动消耗资源、更新属性
 *   4. 用户通过 API 补充资源
 *   5. AI 通过 /rpg/attrs 获取属性和建议，自主决定聊天内容
 *   6. 神社怪谈板（人类投稿，AI 阅读）
 */

const { IPlugin } = require('@alicization/core-interfaces');
const { verifyLicense } = require('./license');
const attrEngine = require('./attribute-engine');
const resMgr = require('./resource-manager');

// ── 辅助：zone name → category ─────────────────────────────────────────────

const CATEGORY_PATTERNS = [
  [/面馆|noodle|restaurant/i, 'restaurant'],
  [/旅馆|inn/i, 'inn'],
  [/温泉|hot\s?spring/i, 'hotspring'],
  [/练习|practice/i, 'practice'],
  [/神社|shrine/i, 'shrine'],
  [/农场|farm/i, 'farm'],
  [/集市|market/i, 'marketplace'],
  [/药水|potion|magic|魔药/i, 'potion'],
  [/码头|dock/i, 'dock'],
  [/池塘|pond/i, 'pond'],
  [/树|tree/i, 'tree'],
  [/草|grass/i, 'grassland'],
];

function inferCategory(zoneName) {
  if (!zoneName) return null;
  for (const [pattern, cat] of CATEGORY_PATTERNS) {
    if (pattern.test(zoneName)) return cat;
  }
  return null;
}

function isShrineZone(zoneName) {
  return /shrine|神社/i.test(zoneName || '');
}

// ── 神社怪谈 ─────────────────────────────────────────────────────────────────
const MAX_GHOST_STORIES = 5;
let ghostStories = []; // { text, author, time }

function getGhostStories() {
  return ghostStories.slice();
}

function addGhostStory(text, author) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim().slice(0, 200);
  if (!trimmed) return null;
  const story = { text: trimmed, author: author || '匿名旅人', time: Date.now() };
  ghostStories.push(story);
  if (ghostStories.length > MAX_GHOST_STORIES) {
    ghostStories = ghostStories.slice(-MAX_GHOST_STORIES);
  }
  return story;
}

// ── 插件主体 ──────────────────────────────────────────────────────────────────

class RpgAdvancedPlugin extends IPlugin {
  get id() { return '@alicization/rpg-advanced'; }
  get version() { return '0.4.0'; }

  async onRegister(ctx) {
    // ── License 校验 ──────────────────────────────────────────────────────
    const key = process.env.ALICIZATION_RPG_LICENSE;
    const { valid, payload, error } = verifyLicense(key);
    if (!valid) {
      console.error(`[rpg-advanced] License check failed: ${error}`);
      console.error('[rpg-advanced] Set ALICIZATION_RPG_LICENSE env var.');
      throw new Error(`RPG Advanced plugin license invalid: ${error}`);
    }
    console.log(`[rpg-advanced] License valid (${payload.plan} plan, user: ${payload.sub})`);

    // ── Zone 发现状态 ───────────────────────────────────────────────────
    let zonesDiscovered = false;

    // ── 辅助：格式化属性变化为可读文本 ─────────────────────────────────────
    const ATTR_LABELS = { hp: '生命', hunger: '饱腹', mood: '心情', energy: '精力', social: '社交', age: '年龄' };
    function formatChanges(changes) {
      const parts = [];
      for (const [attr, ch] of Object.entries(changes)) {
        const label = ATTR_LABELS[attr] || attr;
        const sign = ch.delta > 0 ? '+' : '';
        parts.push(`${label}${sign}${ch.delta}(${ch.after})`);
      }
      return parts.join(' ');
    }

    // ── 注册交互钩子：让资源区域的交互结果与实际消耗精确匹配 ─────────────
    // 钩子在 world-engine 的 interact() 中被调用，优先于默认随机交互。
    // 这解决了原来交互文本（如"点了一碗重庆小面"）与实际资源消耗
    // （如消耗湖南米粉）不一致的问题。
    //
    // 为每个有资源系统的区域分类注册独立的钩子。
    const resourceCategories = ['restaurant', 'potion', 'marketplace'];
    for (const cat of resourceCategories) {
      ctx.registerInteractionHook(cat, ({ playerId, playerName, isNPC, zone, item }) => {
        // 未发现区域 → 返回等待提示，不使用 legacy
        if (!zonesDiscovered) {
          return { action: '四处张望', result: '似乎这家店还没开门...', icon: 'Eye' };
        }
        // NPC 不参与资源系统，不使用 legacy
        if (isNPC) {
          return { action: '观察店铺', result: 'NPC对这里的商品不感兴趣。', icon: 'Eye' };
        }
        if (!zone) {
          return { action: '漫步', result: '在街上随意逛着...', icon: 'Walk' };
        }
        if (!item) {
          // 查看库存列表
          const inv = resMgr.getZoneInventory(zone.name);
          if (!inv || inv.items.length === 0) {
            return { action: '环顾四周', result: '这里暂时没有可消耗的物品。', icon: 'Eye' };
          }
          const list = inv.items.map(r => `${r.label}(剩${r.remaining})`).join('、');
          return { action: '查看菜单', result: `可选：${list}`, icon: 'Eye' };
        }

        // 消耗资源并获取精确匹配的交互文案
        const result = resMgr.consumeAndDescribe(zone.name, item);
        if (!result || !result.interaction) {
          // 售罄或无需消耗时，返回提示而不使用 legacy
          return { action: '环顾四周', result: '这里暂时没有可消耗的物品。', icon: 'Eye' };
        }

        const { interaction, consumeResult } = result;

        // 发送资源消耗活动到前端
        if (consumeResult.success) {
          ctx.emitActivity({
            id: playerId,
            name: playerName,
            text: consumeResult.message || `消耗了${consumeResult.consumedLabel}`,
            type: 'plugin',
          });

          // 应用属性加成
          const changes = attrEngine.applyInteraction(playerId, cat);
          if (changes) {
            ctx.emitActivity({
              id: playerId,
              name: playerName,
              text: `属性变化: ${formatChanges(changes)}`,
              type: 'attr',
            });
          }
        } else if (consumeResult.reason === 'not_found' || consumeResult.reason === 'choose') {
          // 指定了不存在的资源，提示可选项
          ctx.emitActivity({
            id: playerId,
            name: playerName,
            text: consumeResult.message,
            type: 'plugin',
          });
          return { action: '查看菜单', result: consumeResult.message, icon: 'Menu' };
        }
        // 如果资源耗尽，返回售罄文案（不应用属性加成）

        return interaction;
      });
    }

    // ── 监听 activity 事件，驱动 AI 角色属性自然衰减 ─────────────────────
    ctx.onEvent('activity', (data) => {
      // data.id = playerId; data.isNPC 可能不存在于 activity 事件
      // 通过 tick 推进时间，让属性自然衰减
      if (data.id) {
        attrEngine.tick(data.id);
      }
    });

    // ── 监听 interaction 事件：处理无资源区域的属性效果 ────────────────
    // 注意：有资源的区域（面馆、药水店、集市）的消耗和属性更新
    // 已在上方的 registerInteractionHook 中完成，此处只处理无资源区域。
    ctx.onEvent('interaction', (entry) => {
      // entry: { time, playerId, name, isNPC, zone, action, result, item }

      if (!zonesDiscovered) return;
      if (entry.isNPC) return;
      if (!entry.playerId) return;

      const category = inferCategory(entry.zone);
      if (!category) return;

      // 有资源系统的区域已在钩子中处理，跳过
      const hasResourceSystem = resMgr.inferCategory(entry.zone);
      if (hasResourceSystem) return;

      // 无资源系统的区域（温泉、神社、练习场等），直接应用属性效果
      const changes = attrEngine.applyInteraction(entry.playerId, category);
      if (changes) {
        ctx.emitActivity({
          id: entry.playerId,
          name: entry.name,
          text: `属性变化: ${formatChanges(changes)}`,
          type: 'attr',
        });
      }
    });

    // ── 监听 chat 事件：AI 聊天更新社交属性 ─────────────────────────────
    ctx.onEvent('chat', (entry) => {
      // entry: { id, playerId, name, message, x, y }
      if (entry.playerId) {
        const changes = attrEngine.applyChatEffect(entry.playerId);
        if (changes) {
          ctx.emitActivity({
            id: entry.playerId,
            name: entry.name,
            text: `聊天属性: ${formatChanges(changes)}`,
            type: 'attr',
          });
        }
      }
    });

    // ── 注册 API 路由 ──────────────────────────────────────────────────

    // AI 查看自己的属性 + 建议（AI 根据此信息决定行为和聊天内容）
    ctx.registerRoute('get', '/rpg/attrs', (req, res) => {
      const playerId = req.requestHandle?.playerId;
      if (!playerId) return res.status(401).json({ error: 'not logged in' });

      const status = attrEngine.describeStatus(playerId);

      // 生成行为建议供 AI 参考
      const suggestions = [];
      const hunger = status.attrs.hunger.value;
      const energy = status.attrs.energy.value;
      const mood = status.attrs.mood.value;
      const social = status.attrs.social.value;

      if (hunger < 30) {
        // 检查面馆和集市的库存情况
        const allInv = resMgr.getAllInventories();
        const foodZones = [];
        const emptyZones = [];
        for (const [zoneId, inv] of Object.entries(allInv)) {
          const resources = Object.values(inv.resources);
          const availableItems = resources.filter(r => r.current > 0);
          if (availableItems.length > 0) {
            const itemNames = availableItems.map(r => `${r.label}(${r.current}${r.unit})`).join('、');
            foodZones.push({ zoneId, zoneName: inv.zoneName, items: itemNames });
          } else {
            emptyZones.push({ zoneId, zoneName: inv.zoneName });
          }
        }

        if (foodZones.length > 0) {
          const z = foodZones[0];
          suggestions.push(`你很饿了，可以去${z.zoneName}吃东西（可选：${z.items}）`);
        } else {
          suggestions.push('你很饿了，但所有食物来源都已耗尽。可以在聊天中告诉用户你需要食物，请他们补充。');
          if (emptyZones.length > 0) {
            suggestions.push(`${emptyZones.map(z => z.zoneName).join('、')}的食物已经吃完了`);
          }
        }
      }

      if (energy < 25) {
        suggestions.push('精力很低，可以去旅馆休息恢复精力');
      }

      if (mood < 30) {
        suggestions.push('心情不太好，可以去逛逛集市、温泉或神社');
      }

      if (social > 80) {
        suggestions.push('很久没有社交了，可以和用户或其他角色聊聊天');
      }

      res.json({ ...status, suggestions });
    });

    // 手动 tick（调试用）
    ctx.registerRoute('post', '/rpg/tick', (req, res) => {
      const playerId = req.requestHandle?.playerId;
      if (!playerId) return res.status(401).json({ error: 'not logged in' });
      res.json({ attrs: attrEngine.tick(playerId) });
    });

    // 查看所有区域资源库存（AI 和人类用户都可以调用）
    ctx.registerRoute('get', '/rpg/zones/resources', (req, res) => {
      res.json(resMgr.getAllInventories());
    }, { requireSession: false });

    // 查看单个区域资源库存
    ctx.registerRoute('get', '/rpg/zones/:zoneId/resources', (req, res) => {
      const zoneId = req.params.zoneId;
      const allInv = resMgr.getAllInventories();
      const entry = allInv[zoneId];
      if (!entry) {
        return res.status(404).json({ error: 'zone not found or has no resources' });
      }
      res.json({ zoneId, ...entry });
    }, { requireSession: false });

    // 用户补充资源（核心交互：人类用户在 Web 端点击商店补货）
    ctx.registerRoute('post', '/rpg/zones/:zoneId/supply', (req, res) => {
      const zoneId = req.params.zoneId;
      const { resourceType, amount } = req.body || {};

      const allInv = resMgr.getAllInventories();
      const entry = allInv[zoneId];
      if (!entry) {
        return res.status(404).json({ error: 'zone not found or has no resources' });
      }

      const resType = resourceType || resMgr.getPrimaryResourceType(entry.category);
      if (!resType) {
        return res.status(400).json({ error: 'unknown resource type' });
      }

      const qty = typeof amount === 'number' && amount > 0 ? Math.min(amount, 20) : 1;
      const result = resMgr.supply(zoneId, entry.category, resType, qty);

      if (!result.success) {
        return res.status(400).json({ error: result.reason });
      }

      const def = resMgr.getResourceDef(entry.category);
      const supplyMsg = def
        ? (typeof def.supplyMessage === 'function' ? def.supplyMessage(result.label) : def.supplyMessage)
        : 'resources supplied';
      res.json({
        success: true,
        zoneId,
        zoneName: entry.zoneName,
        resourceType: resType,
        added: qty,
        current: result.current,
        message: supplyMsg,
      });
    }, { requireSession: false });

    // AI 检查某个区域的资源（用于 AI 决策前的探查）
    ctx.registerRoute('get', '/rpg/zone-check', (req, res) => {
      const zoneName = req.query.zone;
      if (!zoneName) {
        return res.status(400).json({ error: 'zone query param required' });
      }

      const check = resMgr.checkByName(zoneName);
      if (!check) {
        return res.json({ hasResources: false, message: 'this zone has no resource system' });
      }

      res.json({
        hasResources: true,
        available: check.hasResource,
        resources: check.resources,
        zoneName,
        zoneId: check.zoneId,
        category: check.category,
      });
    }, { requireSession: false });

    // ── 神社怪谈 ─────────────────────────────────────────────────────────
    ctx.registerRoute('get', '/rpg/shrine/stories', (_req, res) => {
      res.json({ stories: getGhostStories() });
    }, { requireSession: false });

    ctx.registerRoute('post', '/rpg/shrine/stories', (req, res) => {
      const { text, author } = req.body || {};
      if (!text || typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ error: '缺少 text 字段' });
      }
      const story = addGhostStory(text, author);
      if (!story) return res.status(400).json({ error: '无效的怪谈内容' });
      res.json({ ok: true, story, stories: getGhostStories() });
    }, { requireSession: false });

    // ── 启动时发现地图上有资源的区域 ────────────────────────────────────
    // 通过 middleware 在首次 HTTP 请求时发现 zones
    ctx.registerMiddleware((req, res, next) => {
      if (!zonesDiscovered && req.app?.locals?.worldEngine) {
        const mapZones = req.app.locals.worldEngine.readMap();
        if (mapZones && mapZones.length > 0) {
          resMgr.discoverZones(mapZones);
          zonesDiscovered = true;
          console.log(`[rpg-advanced] Discovered ${mapZones.length} map zones`);
        }
      }
      next();
    });

    console.log('[rpg-advanced] Plugin registered: attributes + zone resources (AI-focused)');
  }

  async onUnregister() {
    console.log('[rpg-advanced] Plugin unregistered');
  }
}

module.exports = RpgAdvancedPlugin;
