/**
 * PluginContext — IPluginContext 的引擎端实现。
 *
 * 每个插件实例对应一个 PluginContext。
 * 插件只能通过 ctx 注册扩展，不能直接操作引擎内部状态。
 */

const { IPluginContext } = require('@alicization/core-interfaces');

class PluginContext extends IPluginContext {
  /**
   * @param {string} pluginId - 所属插件 ID
   * @param {Object} hooks    - PluginManager 的共享 hooks 注册表
   */
  constructor(pluginId, hooks) {
    super();
    this._pluginId = pluginId;
    this._hooks = hooks;
    this._eventCleanups = [];
  }

  registerInteractions(zoneCategory, interactions) {
    if (!zoneCategory || typeof zoneCategory !== 'string') {
      throw new Error(`[${this._pluginId}] registerInteractions: zoneCategory must be a non-empty string`);
    }
    if (!Array.isArray(interactions) || interactions.length === 0) {
      throw new Error(`[${this._pluginId}] registerInteractions: interactions must be a non-empty array`);
    }
    for (const entry of interactions) {
      if (!entry.action || !entry.result) {
        throw new Error(`[${this._pluginId}] registerInteractions: each entry must have action and result`);
      }
    }

    if (!this._hooks.interactions.has(zoneCategory)) {
      this._hooks.interactions.set(zoneCategory, []);
    }
    this._hooks.interactions.get(zoneCategory).push({
      pluginId: this._pluginId,
      items: interactions,
    });
  }

  registerInteractionType(zoneCategory, interactionType) {
    if (!zoneCategory || !interactionType) {
      throw new Error(`[${this._pluginId}] registerInteractionType: both params required`);
    }
    this._hooks.interactionTypes.set(zoneCategory, {
      pluginId: this._pluginId,
      type: interactionType,
    });
  }

  registerNpcStrategy(strategyName, strategyFn) {
    if (!strategyName || typeof strategyFn !== 'function') {
      throw new Error(`[${this._pluginId}] registerNpcStrategy: name (string) and fn (function) required`);
    }
    this._hooks.npcStrategies.set(strategyName, {
      pluginId: this._pluginId,
      fn: strategyFn,
    });
  }

  registerRoute(method, path, handler, options = {}) {
    const validMethods = ['get', 'post', 'put', 'delete'];
    if (!validMethods.includes(method)) {
      throw new Error(`[${this._pluginId}] registerRoute: method must be one of ${validMethods.join(', ')}`);
    }
    if (!path || typeof handler !== 'function') {
      throw new Error(`[${this._pluginId}] registerRoute: path and handler required`);
    }
    this._hooks.routes.push({
      pluginId: this._pluginId,
      method,
      path,
      handler,
      requireSession: options.requireSession !== false,
    });
  }

  onEvent(eventType, handler) {
    if (!eventType || typeof handler !== 'function') {
      throw new Error(`[${this._pluginId}] onEvent: eventType and handler required`);
    }
    if (!this._hooks.eventHandlers.has(eventType)) {
      this._hooks.eventHandlers.set(eventType, []);
    }
    const entry = { pluginId: this._pluginId, handler };
    this._hooks.eventHandlers.get(eventType).push(entry);

    const cleanup = () => {
      const handlers = this._hooks.eventHandlers.get(eventType);
      if (handlers) {
        const idx = handlers.indexOf(entry);
        if (idx !== -1) handlers.splice(idx, 1);
      }
    };
    this._eventCleanups.push(cleanup);
    return cleanup;
  }

  registerMiddleware(middleware) {
    if (typeof middleware !== 'function') {
      throw new Error(`[${this._pluginId}] registerMiddleware: middleware must be a function`);
    }
    this._hooks.middleware.push({
      pluginId: this._pluginId,
      fn: middleware,
    });
  }

  registerZoneMatcher(matcher, category) {
    if (!(matcher instanceof RegExp) || !category) {
      throw new Error(`[${this._pluginId}] registerZoneMatcher: matcher (RegExp) and category (string) required`);
    }
    this._hooks.zoneMatchers.push({
      pluginId: this._pluginId,
      matcher,
      category,
    });
  }

  emitActivity(data) {
    if (!data || !data.id || !data.text) {
      throw new Error(`[${this._pluginId}] emitActivity: data.id and data.text required`);
    }
    if (typeof this._hooks.activityEmitter === 'function') {
      this._hooks.activityEmitter({
        ...data,
        type: data.type || 'plugin',
        pluginId: this._pluginId,
      });
    }
  }

  /**
   * 内部方法：清理此插件注册的所有事件监听。
   * @private
   */
  _cleanupEvents() {
    for (const fn of this._eventCleanups) {
      fn();
    }
    this._eventCleanups = [];
  }
}

module.exports = { PluginContext };
