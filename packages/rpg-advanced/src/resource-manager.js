/**
 * Zone 资源库存管理器
 *
 * 管理各区域（面馆、集市等）的资源库存：
 *   - 每日自动刷新至默认数量
 *   - AI 交互时消耗资源
 *   - 用户可通过接口补充资源
 *
 * 这是闭源模块——库存规则和平衡参数是付费功能的一部分。
 */

// ── 区域资源定义 ─────────────────────────────────────────────────────────────

const ZONE_RESOURCE_DEFS = {
  restaurant: {
    resources: {
      hunan_rice_noodle:   { dailyMax: 5, label: '湖南米粉', unit: '碗', icon: 'Noodle' },
      chongqing_noodle:    { dailyMax: 4, label: '重庆小面', unit: '碗', icon: 'Noodle' },
      shaanxi_youpo_noodle:{ dailyMax: 3, label: '陕西油泼面', unit: '碗', icon: 'Noodle' },
    },
    consumeMessage: (label) => `消耗了一碗${label}`,
    emptyMessage: '这里的面食已经全部卖完了',
    supplyMessage: (label) => `补充了新的${label}！`,
  },
  marketplace: {
    resources: {
      apple:        { dailyMax: 6, label: '苹果', unit: '个', icon: 'Honey' },
      banana:       { dailyMax: 5, label: '香蕉', unit: '根', icon: 'Honey' },
      golden_apple: { dailyMax: 2, label: '金苹果', unit: '个', icon: 'GoldCoin' },
    },
    consumeMessage: (label) => `消耗了一个${label}`,
    emptyMessage: '集市的水果已经卖完了',
    supplyMessage: (label) => `补充了新鲜的${label}！`,
  },
  potion: {
    resources: {
      beauty_potion: { dailyMax: 4, label: '美颜药水', unit: '瓶', icon: 'WaterPot' },
      energy_potion: { dailyMax: 5, label: '精力药水', unit: '瓶', icon: 'LifePot' },
      detox_potion:  { dailyMax: 3, label: '解毒药水', unit: '瓶', icon: 'MilkPot' },
    },
    consumeMessage: (label) => `消耗了一瓶${label}`,
    emptyMessage: '魔药店的药水已经售罄了',
    supplyMessage: (label) => `补充了新的${label}！`,
  },
};

// ── 资源对应的交互文案（插件钩子返回给引擎的交互结果） ─────────────────────────

const RESOURCE_INTERACTIONS = {
  restaurant: {
    hunan_rice_noodle:    { action: '点了一碗湖南米粉', result: '热气腾腾的米粉端上来，汤头鲜美，米粉爽滑弹牙。', icon: 'Noodle', sound: 'interact' },
    chongqing_noodle:     { action: '点了一碗重庆小面', result: '辣得过瘾！麻辣鲜香在口中爆炸，额头冒出细汗。', icon: 'Noodle', sound: 'interact' },
    shaanxi_youpo_noodle: { action: '点了一碗陕西油泼面', result: '滚烫的热油浇在辣椒面上滋滋作响，面条筋道十足。', icon: 'Noodle', sound: 'interact' },
  },
  potion: {
    beauty_potion: { action: '购买了一瓶美颜药水', result: '淡紫色的液体散发着花香，据说能让皮肤焕发光彩。', icon: 'WaterPot', sound: 'magic' },
    energy_potion: { action: '购买了一瓶精力药水', result: '金黄色的药水闪烁着微光，喝下后精力充沛。', icon: 'LifePot', sound: 'magic' },
    detox_potion:  { action: '购买了一瓶解毒药水', result: '翠绿色的药水清凉入喉，体内的毒素被净化了。', icon: 'MilkPot', sound: 'magic' },
  },
  marketplace: {
    apple:        { action: '买了一个苹果', result: '红彤彤的苹果，咬一口酸甜多汁。', icon: 'Honey', sound: 'interact' },
    banana:       { action: '买了一根香蕉', result: '金黄的香蕉，剥开果皮香甜软糯。', icon: 'Honey', sound: 'interact' },
    golden_apple: { action: '买了一个金苹果', result: '传说中的金苹果闪耀着金色光芒，蕴含神秘力量。', icon: 'GoldCoin', sound: 'interact' },
  },
};

// 资源耗尽时的交互文案
const EMPTY_INTERACTIONS = {
  restaurant: { action: '想点碗面', result: '老板抱歉地说："今天的面食已经全部卖完了，明天再来吧。"', icon: 'Noodle', sound: 'interact' },
  potion:     { action: '想买瓶药水', result: '女巫摇了摇头："药水都售罄了，明天会补充新的。"', icon: 'WaterPot', sound: 'magic' },
  marketplace:{ action: '逛了逛水果摊', result: '摊位上的水果已经卖光了，商人说明天会进新货。', icon: 'Honey', sound: 'interact' },
};

// ── 区域名称 → 资源类别的匹配规则 ──────────────────────────────────────────

const CATEGORY_PATTERNS = [
  [/面馆|noodle|restaurant/i, 'restaurant'],
  [/集市|market/i, 'marketplace'],
  [/药水|potion|magic|魔药/i, 'potion'],
];

// ── 库存状态 ─────────────────────────────────────────────────────────────────

/** @type {Map<string, { category: string, zoneName: string, resources: Object, lastResetDate: string }>} */
const zoneInventories = new Map();

/** zone name → zone id 的映射（从 mapDirectory 发现） */
const nameToIdMap = new Map();

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 根据区域名称推断资源类别
 */
function inferCategory(zoneName) {
  if (!zoneName) return null;
  for (const [pattern, cat] of CATEGORY_PATTERNS) {
    if (pattern.test(zoneName)) return cat;
  }
  return null;
}

/**
 * 根据 zone name 查找对应的 zone ID
 */
function findZoneIdByName(zoneName) {
  // 优先全名匹配
  let id = nameToIdMap.get(zoneName);
  if (id) return id;
  // 去掉括号及后面的英文再试
  const normalized = zoneName.replace(/\(.*\)/, '').trim();
  return nameToIdMap.get(normalized) || null;
}

/**
 * 获取或初始化某个 zone 的库存。自动处理每日刷新。
 */
function getOrInitZone(zoneId, category, zoneName) {
  let inv = zoneInventories.get(zoneId);

  if (!inv) {
    const def = ZONE_RESOURCE_DEFS[category];
    if (!def) return null;

    inv = { category, zoneName: zoneName || zoneId, resources: {}, lastResetDate: getTodayStr() };
    for (const [key, res] of Object.entries(def.resources)) {
      inv.resources[key] = {
        current: res.dailyMax,
        dailyMax: res.dailyMax,
        label: res.label,
        unit: res.unit,
        icon: res.icon || null,
      };
    }
    zoneInventories.set(zoneId, inv);
  }

  // 每日懒刷新
  const today = getTodayStr();
  if (inv.lastResetDate !== today) {
    const def = ZONE_RESOURCE_DEFS[inv.category];
    if (def) {
      for (const [key, res] of Object.entries(def.resources)) {
        inv.resources[key].current = res.dailyMax;
      }
    }
    inv.lastResetDate = today;
  }

  return inv;
}

/**
 * 消耗指定区域的资源
 * @returns {{ success: boolean, remaining?: number, reason?: string, message?: string }}
 */
function consume(zoneId, category, resourceType) {
  const inv = getOrInitZone(zoneId, category);
  if (!inv) return { success: false, reason: 'unknown_category' };

  const res = inv.resources[resourceType];
  if (!res) return { success: false, reason: 'unknown_resource' };
  if (res.current <= 0) {
    const def = ZONE_RESOURCE_DEFS[category];
    return { success: false, reason: 'empty', message: def ? def.emptyMessage : 'no resources' };
  }

  res.current--;
  const def = ZONE_RESOURCE_DEFS[category];
  const msg = def
    ? (typeof def.consumeMessage === 'function' ? def.consumeMessage(res.label) : def.consumeMessage)
    : 'consumed';
  return {
    success: true,
    remaining: res.current,
    message: msg,
    consumedLabel: res.label,
  };
}

/**
 * 从区域可用资源中随机选一种消耗（优先有库存的）
 */
function pickRandomAvailableResource(zoneId, category) {
  const inv = getOrInitZone(zoneId, category);
  if (!inv) return null;

  const available = Object.entries(inv.resources).filter(([, r]) => r.current > 0);
  if (available.length === 0) return null;

  const [key] = available[Math.floor(Math.random() * available.length)];
  return key;
}

/**
 * 通过 zone name 消耗资源（事件处理用）
 * @param {string} zoneName - 区域名称
 * @param {string} [preferredItem] - 指定消耗的物品标签（如 '湖南米粉'），不传则随机
 */
function consumeByName(zoneName, preferredItem) {
  const category = inferCategory(zoneName);
  if (!category) return null; // 该区域不消耗资源

  const zoneId = findZoneIdByName(zoneName);
  if (!zoneId) return null;

  // 如果指定了物品，按标签查找对应的 resource key
  let resType = null;
  if (preferredItem) {
    const inv = getOrInitZone(zoneId, category);
    if (inv) {
      const match = Object.entries(inv.resources).find(
        ([, r]) => r.label === preferredItem && r.current > 0
      );
      if (match) resType = match[0];
      // 指定物品不存在或已售罄时回退随机
    }
  }

  if (!resType) {
    resType = pickRandomAvailableResource(zoneId, category);
  }

  if (!resType) {
    // 所有资源都耗尽了
    const def = ZONE_RESOURCE_DEFS[category];
    return { success: false, reason: 'empty', message: def ? def.emptyMessage : 'no resources', category, zoneId };
  }

  return { ...consume(zoneId, category, resType), category, resourceType: resType, zoneId };
}

/**
 * 通过 zone name 检查资源可用性
 */
function checkByName(zoneName) {
  const category = inferCategory(zoneName);
  if (!category) return null;

  const zoneId = findZoneIdByName(zoneName);
  if (!zoneId) return null;

  const inv = getOrInitZone(zoneId, category);
  if (!inv) return null;

  // Check if any resource has stock
  const hasAny = Object.values(inv.resources).some(r => r.current > 0);

  return {
    category,
    zoneId,
    hasResource: hasAny,
    inventory: { ...inv.resources },
    resources: Object.entries(inv.resources).map(([key, r]) => ({
      type: key, label: r.label, current: r.current, dailyMax: r.dailyMax, unit: r.unit,
    })),
  };
}

/**
 * 用户补充资源
 * @param {number} amount - 补充数量（默认 1）
 * @returns {{ success: boolean, current?: number, reason?: string }}
 */
function supply(zoneId, category, resourceType, amount = 1) {
  if (amount < 1 || !Number.isInteger(amount)) {
    return { success: false, reason: 'invalid_amount' };
  }

  const inv = getOrInitZone(zoneId, category);
  if (!inv) return { success: false, reason: 'unknown_category' };

  const res = inv.resources[resourceType];
  if (!res) return { success: false, reason: 'unknown_resource' };

  res.current += amount;
  return { success: true, current: res.current, label: res.label, icon: res.icon };
}

/**
 * 查询某个区域的库存
 */
function getInventory(zoneId, category) {
  const inv = getOrInitZone(zoneId, category);
  if (!inv) return null;

  const result = {};
  for (const [key, res] of Object.entries(inv.resources)) {
    result[key] = { ...res };
  }
  return result;
}

/**
 * 检查某区域某资源是否有库存
 */
function hasResource(zoneId, category, resourceType) {
  const inv = getOrInitZone(zoneId, category);
  if (!inv) return false;
  const res = inv.resources[resourceType];
  return res ? res.current > 0 : false;
}

/**
 * 获取所有已知区域的库存概览
 */
function getAllInventories() {
  // 触发所有已知 zone 的懒刷新
  for (const [id, inv] of zoneInventories) {
    getOrInitZone(id, inv.category);
  }

  const result = {};
  for (const [id, inv] of zoneInventories) {
    result[id] = {
      category: inv.category,
      zoneName: inv.zoneName,
      resources: {},
    };
    for (const [key, res] of Object.entries(inv.resources)) {
      result[id].resources[key] = { ...res };
    }
  }
  return result;
}

/**
 * 根据 zone 列表初始化已知区域（供插件启动时调用）
 */
function discoverZones(mapZones) {
  for (const zone of mapZones) {
    const cat = inferCategory(zone.name);
    if (cat) {
      nameToIdMap.set(zone.name, zone.id);
      getOrInitZone(zone.id, cat, zone.name);
    }
  }
}

/**
 * 获取某个类别的资源定义
 */
function getResourceDef(category) {
  return ZONE_RESOURCE_DEFS[category] || null;
}

/**
 * 获取第一个资源类型名（简化用）
 */
function getPrimaryResourceType(category) {
  const def = ZONE_RESOURCE_DEFS[category];
  if (!def) return null;
  return Object.keys(def.resources)[0];
}

/**
 * 消耗资源并返回对应的交互描述（供交互钩子使用）
 *
 * 与 consumeByName 不同，此方法同时返回与消耗资源精确匹配的交互文案，
 * 解决交互文本与实际消耗不一致的问题。
 *
 * @param {string} zoneName - 区域名称
 * @returns {{ interaction: object, consumeResult: object } | null}
 *   interaction: { action, result, icon, sound, item }
 *   consumeResult: { success, remaining, message, consumedLabel, category, resourceType, zoneId }
 */
function consumeAndDescribe(zoneName, item) {
  const category = inferCategory(zoneName);
  if (!category) return null; // 该区域不消耗资源

  const zoneId = findZoneIdByName(zoneName);
  if (!zoneId) return null;

  // 根据 item 查找对应资源，没有 item 时返回可选项不消耗，找不到指定资源时返回可选项
  let resType = null;
  if (item) {
    // 优先按 key 匹配，再按 label 匹配
    const def = ZONE_RESOURCE_DEFS[category];
    for (const [key, res] of Object.entries(def?.resources || {})) {
      if (key === item || res.label === item) {
        resType = key;
        break;
      }
    }
    if (!resType) {
      // 指定了 item 但找不到：返回可选项
      const inv = getOrInitZone(zoneId, category);
      const available = Object.entries(inv?.resources || {})
        .filter(([, r]) => r.current > 0)
        .map(([key, r]) => ({ key, label: r.label, remaining: r.current }));
      return {
        interaction: null,
        consumeResult: {
          success: false,
          reason: 'not_found',
          message: `没有找到「${item}」，请选择：${available.map(r => r.label).join('、') || '已售罄'}`,
          available,
          category,
          zoneId,
        },
      };
    }
  } else {
    // 没有指定 item：返回可选项，不消耗
    const inv = getOrInitZone(zoneId, category);
    const available = Object.entries(inv?.resources || {})
      .filter(([, r]) => r.current > 0)
      .map(([key, r]) => ({ key, label: r.label, remaining: r.current }));
    return {
      interaction: null,
      consumeResult: {
        success: false,
        reason: 'choose',
        message: `请选择：${available.map(r => `${r.label}(剩${r.remaining})`).join('、') || '已售罄'}`,
        available,
        category,
        zoneId,
      },
    };
  }

  if (!resType) {
    // 所有资源耗尽：返回售罄交互文案
    const emptyInteraction = EMPTY_INTERACTIONS[category];
    const def = ZONE_RESOURCE_DEFS[category];
    return {
      interaction: emptyInteraction
        ? { ...emptyInteraction, item: null }
        : null,
      consumeResult: {
        success: false,
        reason: 'empty',
        message: def ? def.emptyMessage : 'no resources',
        category,
        zoneId,
      },
    };
  }

  // 消耗资源
  const consumeResult = { ...consume(zoneId, category, resType), category, resourceType: resType, zoneId };

  // 获取精确匹配的交互文案
  const interaction = RESOURCE_INTERACTIONS[category]?.[resType];
  if (interaction) {
    return {
      interaction: { ...interaction, item: consumeResult.consumedLabel },
      consumeResult,
    };
  }

  // 兜底：有消耗但无预定义文案（理论上不会发生）
  return {
    interaction: null,
    consumeResult,
  };
}

/**
 * 获取某个 zone 的当前库存（不消耗）
 */
/**
 * 根据区域名称获取区域库存信息
 * @param {string} zoneName - 区域名称
 * @returns {Object|null} 返回包含区域库存信息的对象，如果获取失败则返回null
 */
function getZoneInventory(zoneName) {
  // 根据区域名称推断类别
  const category = inferCategory(zoneName);
  // 如果无法推断类别，返回null
  if (!category) return null;
  // 根据区域名称查找区域ID
  const zoneId = findZoneIdByName(zoneName);
  // 如果找不到区域ID，返回null
  if (!zoneId) return null;
  // 获取或初始化区域库存
  const inv = getOrInitZone(zoneId, category);
  // 如果无法获取区域库存，返回null
  if (!inv) return null;
  // 返回处理后的库存信息
  return {
    category,
    zoneId,
    items: Object.entries(inv.resources)
      .filter(([, r]) => r.current > 0)
      .map(([key, r]) => ({ key, label: r.label, remaining: r.current })),
  };
}

module.exports = {
  inferCategory,
  consume,
  consumeByName,
  consumeAndDescribe,
  checkByName,
  supply,
  getInventory,
  getZoneInventory,
  hasResource,
  getAllInventories,
  discoverZones,
  getResourceDef,
  getPrimaryResourceType,
  pickRandomAvailableResource,
  findZoneIdByName,
  ZONE_RESOURCE_DEFS,
  CATEGORY_PATTERNS,
  RESOURCE_INTERACTIONS,
  EMPTY_INTERACTIONS,
};
