const fs = require('fs');
const path = require('path');
const { serverFingerprint: deriveServerFingerprint } = require('./server-registry');
const {
  PROFILES_DIR,
  KEYSTORE_DIR,
  DEFAULT_PROFILE_FILE,
} = require('./config');

let _serverFingerprint = null;

function setServerFingerprint(fp) {
  _serverFingerprint = fp;
}

function getServerFingerprint() {
  return _serverFingerprint;
}

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

function scopedProfilesDir(serverFp) {
  const fp = serverFp || _serverFingerprint;
  if (fp) return path.join(PROFILES_DIR, fp);
  return PROFILES_DIR;
}

function profilePath(profileName, serverFp) {
  return path.join(scopedProfilesDir(serverFp), `${profileName}.json`);
}

function keystorePath(handle) {
  return path.join(KEYSTORE_DIR, `${handle}.json`);
}

function resolveServerFingerprint(serverFp = null) {
  return serverFp || _serverFingerprint || null;
}

function readDefaultProfileState() {
  const state = readJson(DEFAULT_PROFILE_FILE, {}) || {};
  return {
    profile: state.profile || null,
    profiles: state.profiles && typeof state.profiles === 'object' ? state.profiles : {},
  };
}

function profileMatchesServer(profile, serverFp) {
  if (!profile || !serverFp) return Boolean(profile);
  if (!profile.server) return false;
  return deriveServerFingerprint(profile.server) === serverFp;
}

function readLegacyProfile(profileName) {
  return readJson(path.join(PROFILES_DIR, `${profileName}.json`), null);
}

function getDefaultProfileName(serverFp) {
  const resolvedServerFp = resolveServerFingerprint(serverFp);
  const state = readDefaultProfileState();
  if (!resolvedServerFp) return state.profile || null;
  if (state.profiles[resolvedServerFp]) return state.profiles[resolvedServerFp];

  if (state.profile) {
    const legacyProfile = readLegacyProfile(state.profile);
    if (profileMatchesServer(legacyProfile, resolvedServerFp)) {
      return state.profile;
    }
  }

  return null;
}

function setDefaultProfileName(profile, serverFp) {
  const resolvedServerFp = resolveServerFingerprint(serverFp);
  const state = readDefaultProfileState();
  state.profile = profile;
  if (resolvedServerFp) {
    state.profiles[resolvedServerFp] = profile;
  }
  writeJson(DEFAULT_PROFILE_FILE, state);
}

function loadProfile(profileName, serverFp) {
  const resolvedServerFp = resolveServerFingerprint(serverFp);
  const scoped = readJson(profilePath(profileName, resolvedServerFp), null);
  if (scoped) return scoped;
  const legacy = readLegacyProfile(profileName);
  if (!legacy) return null;
  if (!resolvedServerFp || profileMatchesServer(legacy, resolvedServerFp)) {
    return legacy;
  }
  return null;
}

function saveProfile(profile, serverFp) {
  const resolvedServerFp = resolveServerFingerprint(serverFp) || (profile?.server ? deriveServerFingerprint(profile.server) : null);
  const targetPath = profilePath(profile.profile, resolvedServerFp);
  writeJson(targetPath, profile);
  if (resolvedServerFp) {
    const legacyPath = path.join(PROFILES_DIR, `${profile.profile}.json`);
    if (legacyPath !== targetPath) {
      try {
        fs.rmSync(legacyPath, { force: true });
      } catch {}
    }
  }
}

function loadKeystore(handle) {
  return readJson(keystorePath(handle), null);
}

function saveKeystore(handle, keystore) {
  writeJson(keystorePath(handle), keystore);
}

function scanProfilesInDir(dirPath) {
  ensureDir(dirPath);
  return fs.readdirSync(dirPath)
    .filter((entry) => entry.endsWith('.json') && entry !== 'default.json')
    .map((entry) => readJson(path.join(dirPath, entry), null))
    .filter(Boolean);
}

function collectProfiles(serverFp) {
  const resolvedServerFp = resolveServerFingerprint(serverFp);
  const merged = new Map();
  if (resolvedServerFp) {
    for (const profile of scanProfilesInDir(PROFILES_DIR)) {
      if (profileMatchesServer(profile, resolvedServerFp)) {
        merged.set(profile.profile, profile);
      }
    }
  }
  for (const profile of scanProfilesInDir(scopedProfilesDir(resolvedServerFp))) {
    merged.set(profile.profile, profile);
  }
  return [...merged.values()];
}

function listProfileNames(serverFp) {
  return collectProfiles(serverFp).map((profile) => profile.profile);
}

function listProfiles(serverFp) {
  const resolvedServerFp = resolveServerFingerprint(serverFp);
  const defaultProfile = getDefaultProfileName(resolvedServerFp);

  const items = collectProfiles(resolvedServerFp)
    .map((profile) => ({
      profile: profile.profile,
      handle: profile.handle,
      name: profile.name,
      sprite: profile.sprite,
      server: profile.server || null,
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
  setServerFingerprint,
  getServerFingerprint,
  scopedProfilesDir,
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
