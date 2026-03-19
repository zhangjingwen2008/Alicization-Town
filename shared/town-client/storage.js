const fs = require('fs');
const path = require('path');
const {
  PROFILES_DIR,
  KEYSTORE_DIR,
  DEFAULT_PROFILE_FILE,
} = require('./config');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data, mode = 0o600) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  try {
    fs.chmodSync(filePath, mode);
  } catch {}
}

function profilePath(profileName) {
  return path.join(PROFILES_DIR, `${profileName}.json`);
}

function keystorePath(handle) {
  return path.join(KEYSTORE_DIR, `${handle}.json`);
}

function getDefaultProfileName() {
  return readJson(DEFAULT_PROFILE_FILE, {}).profile || null;
}

function setDefaultProfileName(profile) {
  writeJson(DEFAULT_PROFILE_FILE, { profile });
}

function loadProfile(profileName) {
  return readJson(profilePath(profileName), null);
}

function saveProfile(profile) {
  writeJson(profilePath(profile.profile), profile);
}

function loadKeystore(handle) {
  return readJson(keystorePath(handle), null);
}

function saveKeystore(handle, keystore) {
  writeJson(keystorePath(handle), keystore);
}

function listProfileNames() {
  ensureDir(PROFILES_DIR);
  return fs.readdirSync(PROFILES_DIR)
    .filter((entry) => entry.endsWith('.json') && entry !== 'default.json')
    .map((entry) => path.basename(entry, '.json'));
}

function listProfiles() {
  ensureDir(PROFILES_DIR);
  const defaultProfile = getDefaultProfileName();
  const items = fs.readdirSync(PROFILES_DIR)
    .filter((entry) => entry.endsWith('.json') && entry !== 'default.json')
    .map((entry) => readJson(path.join(PROFILES_DIR, entry), null))
    .filter(Boolean)
    .map((profile) => ({
      profile: profile.profile,
      handle: profile.handle,
      name: profile.name,
      sprite: profile.sprite,
      is_default: profile.profile === defaultProfile,
      is_ready: Boolean(profile.server && profile.handle && loadKeystore(profile.handle)),
      last_used_at: profile.lastUsedAt || null,
    }))
    .sort((left, right) => {
      const leftTime = left.last_used_at ? Date.parse(left.last_used_at) : 0;
      const rightTime = right.last_used_at ? Date.parse(right.last_used_at) : 0;
      if (rightTime !== leftTime) return rightTime - leftTime;
      return left.profile.localeCompare(right.profile);
    });

  if (items.length === 0) {
    return {
      status: 'empty',
      items: [],
      default_profile: null,
      message: '本地还没有 profile，请使用 login 的创建模式创建角色。',
    };
  }

  return {
    status: 'ok',
    items,
    default_profile: defaultProfile,
    message: `已找到 ${items.length} 个本地 profile。`,
  };
}

module.exports = {
  ensureDir,
  readJson,
  writeJson,
  profilePath,
  keystorePath,
  getDefaultProfileName,
  setDefaultProfileName,
  loadProfile,
  saveProfile,
  loadKeystore,
  saveKeystore,
  listProfileNames,
  listProfiles,
};
