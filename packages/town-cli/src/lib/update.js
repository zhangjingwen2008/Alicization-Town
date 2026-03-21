const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');

const REPO = 'ceresOPA/Alicization-Town';
const BRANCH = 'main';
const REMOTE_DIR = 'skills/alicization-town';
const API_BASE = `https://api.github.com/repos/${REPO}/contents/${REMOTE_DIR}?ref=${BRANCH}`;

function fetchJson(url) {
  const raw = execSync(`curl -sL -H "Accept: application/vnd.github.v3+json" "${url}"`, { encoding: 'utf8' });
  return JSON.parse(raw);
}

function downloadFile(url, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  execSync(`curl -sL "${url}" -o "${dest}"`);
}

function syncDir(apiUrl, localDir) {
  const entries = fetchJson(apiUrl);
  if (!Array.isArray(entries)) {
    throw new Error(`Failed to list upstream directory: ${JSON.stringify(entries).slice(0, 200)}`);
  }
  for (const entry of entries) {
    const dest = path.join(localDir, entry.name);
    if (entry.type === 'file') {
      downloadFile(entry.download_url, dest);
    } else if (entry.type === 'dir') {
      fs.mkdirSync(dest, { recursive: true });
      syncDir(entry.url, dest);
    }
  }
}

function update() {
  const root = path.resolve(__dirname, '..', '..', '..', '..');
  const localSkillDir = path.join(root, REMOTE_DIR);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'at-update-'));

  try {
    console.log('📥 Fetching latest skill from upstream...');
    const tmpSkill = path.join(tmpDir, 'skill');
    fs.mkdirSync(tmpSkill, { recursive: true });
    syncDir(API_BASE, tmpSkill);

    const newFiles = fs.readdirSync(tmpSkill);
    if (newFiles.length === 0) {
      throw new Error('Upstream skill directory is empty — aborting');
    }

    console.log('🔄 Replacing local skill...');
    const oldEntries = fs.readdirSync(localSkillDir);
    for (const entry of oldEntries) {
      fs.rmSync(path.join(localSkillDir, entry), { recursive: true, force: true });
    }
    for (const entry of newFiles) {
      execSync(`cp -R "${path.join(tmpSkill, entry)}" "${path.join(localSkillDir, entry)}"`);
    }

    console.log('✅ Update complete. Skill is now up to date.');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

module.exports = { update };
