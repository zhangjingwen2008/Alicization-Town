/**
 * 插件上下文 (PluginContext)
 *
 * 为 IPlugin 插件提供与引擎交互的标准接口：
 *   - onEvent(name, handler)          监听世界事件
 *   - registerRoute(method, path, handler, options)  注册 Express 路由
 *   - registerMiddleware(handler)     注册 Express 中间件
 *   - emitActivity(data)             发送活动到前端
 *   - registerInteractionHook(fn)    注册交互钩子（覆盖特定区域交互结果）
 */

class PluginContext {
  /**
   * @param {object} options
   * @param {import('./engine/world-engine')} options.worldEngine
   * @param {import('express').Application} options.app
   * @param {import('express').Router} options.apiRouter
   */
  constructor({ worldEngine, app, apiRouter }) {
    this._worldEngine = worldEngine;
    this._app = app;
    this._apiRouter = apiRouter;
    this._cleanups = [];
  }

  /**
   * 监听世界事件
   * @param {'activity'|'interaction'|'chat'|'stateChange'} eventName
   * @param {Function} handler
   */
  onEvent(eventName, handler) {
    this._worldEngine.events.on(eventName, handler);
    this._cleanups.push(() => this._worldEngine.events.off(eventName, handler));
  }

  /**
   * 注册 API 路由
   * @param {'get'|'post'|'put'|'delete'} method
   * @param {string} routePath
   * @param {Function} handler
   * @param {{ requireSession?: boolean }} [options]
   */
  registerRoute(method, routePath, handler, options = {}) {
    const { RequestContext } = require('./request-context');
    const worldEngine = this._worldEngine;

    const wrappedHandler = (req, res, next) => {
      // 插入 worldEngine 引用，供插件通过 req.app.locals 访问
      req.app.locals.worldEngine = worldEngine;

      if (options.requireSession === false) {
        // 尝试解析 session 但不强制要求
        const { handle } = RequestContext.fromRequest(req, { required: false, touchLease: true });
        req.requestHandle = handle;
        return handler(req, res, next);
      }

      // 默认需要 session
      const { handle, error } = RequestContext.fromRequest(req, { required: true, touchLease: true });
      if (!handle) return res.status(401).json({ error });
      req.requestHandle = handle;
      return handler(req, res, next);
    };

    this._apiRouter[method](routePath, wrappedHandler);
  }

  /**
   * 注册全局中间件
   * @param {Function} handler - (req, res, next) => void
   */
  registerMiddleware(handler) {
    this._app.use((req, res, next) => {
      req.app.locals.worldEngine = this._worldEngine;
      handler(req, res, next);
    });
  }

  /**
   * 发送插件活动到前端（通过 world-engine 的 activity 事件链路）
   * @param {{ id: string, name: string, text: string, type: string }} data
   */
  emitActivity(data) {
    this._worldEngine.events.emit('activity', data);
  }

  /**
   * 注册交互钩子：在 AI 调用 interact 时，插件可覆盖交互结果
   * hookFn({ playerId, playerName, isNPC, zone, category }) =>
   *   { action, result, icon, sound, item? } | null
   * 返回 null 则回退到默认随机交互
   */
  registerInteractionHook(hookFn) {
    this._worldEngine.registerInteractionHook(hookFn);
  }

  /**
   * 清理插件注册的所有事件监听器
   */
  cleanup() {
    for (const fn of this._cleanups) {
      try { fn(); } catch (_) { /* ignore */ }
    }
    this._cleanups.length = 0;
  }
}

module.exports = { PluginContext };
