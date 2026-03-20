// 服务器注册表：管理默认服务器地址、服务器切换、别名解析
const crypto = require('crypto');
const path = require('path');
const { STORAGE_ROOT, DEFAULT_SERVER_URL } = require('./config');

const REGISTRY_FILE = path.join(STORAGE_ROOT, 'servers.json');

let _readJson, _writeJson;

function inject(storage) {
  _readJson = storage.readJson;
  _writeJson = storage.writeJson;
}

function serverFingerprint(url) {
  if (!url) return 'local';
  const normalized = url.replace(/\/+$/, '').toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 12);
}

function loadRegistry() {
  if (!_readJson) throw new Error('server-registry not initialized; call inject(storage) first');
  const stored = _readJson(REGISTRY_FILE, {}) || {};
  return {
    defaultServer: stored.defaultServer || DEFAULT_SERVER_URL,
    servers: stored.servers && typeof stored.servers === 'object' ? stored.servers : {},
  };
}

function saveRegistry(registry) {
  if (!_writeJson) throw new Error('server-registry not initialized; call inject(storage) first');
  _writeJson(REGISTRY_FILE, registry);
}

function getDefaultServer() {
  const registry = loadRegistry();
  return registry.defaultServer || DEFAULT_SERVER_URL;
}

function setDefaultServer(url, name) {
  const registry = loadRegistry();
  registry.defaultServer = url;
  const fp = serverFingerprint(url);
  const existing = registry.servers[fp] || {};
  registry.servers[fp] = {
    url,
    name: name || existing.name || null,
    addedAt: existing.addedAt || new Date().toISOString(),
  };
  saveRegistry(registry);
  return { url, fingerprint: fp, name: registry.servers[fp].name };
}

function listServers() {
  const registry = loadRegistry();
  return {
    defaultServer: registry.defaultServer || DEFAULT_SERVER_URL,
    servers: registry.servers || {},
  };
}

function addServer(url, name) {
  const registry = loadRegistry();
  const fp = serverFingerprint(url);
  const existing = registry.servers[fp];
  const isNew = !existing;
  registry.servers[fp] = {
    url,
    name: name || (existing ? existing.name : null),
    addedAt: existing ? existing.addedAt : new Date().toISOString(),
  };
  saveRegistry(registry);
  return { url, fingerprint: fp, isNew, name: registry.servers[fp].name };
}

function renameServer(nameOrUrl, newName) {
  const registry = loadRegistry();
  const entry = findEntry(registry, nameOrUrl);
  if (!entry) return null;
  entry.value.name = newName;
  saveRegistry(registry);
  return { url: entry.value.url, fingerprint: entry.fp, name: newName };
}

// Why: name-based lookup — agent says "测试服" instead of a URL
function resolveServer(nameOrUrl) {
  if (!nameOrUrl) return null;
  if (nameOrUrl.includes('://')) return nameOrUrl;
  const registry = loadRegistry();
  for (const [, entry] of Object.entries(registry.servers)) {
    if (entry.name && entry.name === nameOrUrl) return entry.url;
  }
  return null;
}

function findEntry(registry, nameOrUrl) {
  if (nameOrUrl.includes('://')) {
    const fp = serverFingerprint(nameOrUrl);
    if (registry.servers[fp]) return { fp, value: registry.servers[fp] };
    return null;
  }
  for (const [fp, entry] of Object.entries(registry.servers)) {
    if (entry.name && entry.name === nameOrUrl) return { fp, value: entry };
  }
  return null;
}

module.exports = {
  inject,
  serverFingerprint,
  getDefaultServer,
  setDefaultServer,
  listServers,
  addServer,
  renameServer,
  resolveServer,
  REGISTRY_FILE,
};
