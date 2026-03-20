const os = require('os');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const PROJECT_NAME = path.basename(PROJECT_ROOT);

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const LEASE_TTL_MS = Number(process.env.ALICIZATION_TOWN_LEASE_TTL_MS || 180_000);
const HEARTBEAT_INTERVAL_MS = Number(process.env.ALICIZATION_TOWN_HEARTBEAT_INTERVAL_MS || 60_000);
const LOGIN_PROOF_TTL_MS = 60_000;
const LOCAL_CANDIDATES = ['http://127.0.0.1:5660', 'http://localhost:5660'];

function resolveStorageRoot(options = {}) {
  const env = options.env || process.env;
  const home = options.homedir || os.homedir();
  const projectName = options.projectName || PROJECT_NAME;

  if (env.ALICIZATION_TOWN_HOME) {
    return path.resolve(env.ALICIZATION_TOWN_HOME);
  }

  return path.join(home, '.agents', projectName);
}

const STORAGE_ROOT = resolveStorageRoot();
const PROFILES_DIR = path.join(STORAGE_ROOT, 'profiles');
const KEYSTORE_DIR = path.join(STORAGE_ROOT, 'keystore');
const DEFAULT_PROFILE_FILE = path.join(PROFILES_DIR, 'default.json');

module.exports = {
  resolveStorageRoot,
  PROJECT_ROOT,
  PROJECT_NAME,
  TOKEN_TTL_MS,
  LEASE_TTL_MS,
  HEARTBEAT_INTERVAL_MS,
  LOGIN_PROOF_TTL_MS,
  LOCAL_CANDIDATES,
  STORAGE_ROOT,
  PROFILES_DIR,
  KEYSTORE_DIR,
  DEFAULT_PROFILE_FILE,
};
