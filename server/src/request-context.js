const worldEngine = require('./engine/world-engine');

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

class RequestContext {
  constructor({ token = null, session = null }) {
    this.token = token;
    this.session = session;
  }

  get playerId() {
    return this.session ? this.session.playerId : null;
  }

  get isAuthenticated() {
    return Boolean(this.session);
  }

  logout() {
    if (!this.session) return false;
    return this.token ? worldEngine.logout(this.token) : false;
  }

  static fromRequest(req, { required = false, touchLease = true } = {}) {
    const token = getBearerToken(req);
    if (token) {
      const session = worldEngine.getTokenSession(token, { touchLease });
      if (!session) {
        if (required) return { handle: null, error: '登录已失效，请重新 login。' };
        return { handle: null, error: null };
      }
      return { handle: new RequestContext({ token, session }), error: null };
    }
    if (required) return { handle: null, error: '登录已失效，请重新 login。' };
    return { handle: null, error: null };
  }
}

module.exports = { RequestContext };
