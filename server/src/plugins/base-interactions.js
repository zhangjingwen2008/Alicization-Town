/**
 * BaseInteractionsPlugin — 将内置的区域交互数据注册为插件。
 *
 * 这是一个开源的基础插件，包含小镇所有默认区域的交互内容。
 * 闭源的高级插件可以通过相同接口注册额外的交互，或覆盖现有分类。
 */

const { IPlugin } = require('@alicization/core-interfaces');

// 直接复用现有数据模块
const { ZONE_INTERACTIONS, ZONE_CATEGORY_MAP } = require('../data/interactions');

class BaseInteractionsPlugin extends IPlugin {
  get id() { return 'base/interactions'; }
  get version() { return '1.0.0'; }

  async onRegister(ctx) {
    // ── 注册所有 zone 名称匹配器 ──────────────────────────────────────────
    for (const [matcher, category] of ZONE_CATEGORY_MAP) {
      ctx.registerZoneMatcher(matcher, category);
    }

    // ── 注册所有交互类型映射 ──────────────────────────────────────────────
    // ZONE_INTERACTIONS 结构: { building: { restaurant: [...], inn: [...] }, nature: { tree: [...] }, ... }
    for (const [interactionType, categories] of Object.entries(ZONE_INTERACTIONS)) {
      for (const [category, interactions] of Object.entries(categories)) {
        ctx.registerInteractionType(category, interactionType);
        ctx.registerInteractions(category, interactions);
      }
    }
  }
}

module.exports = BaseInteractionsPlugin;
