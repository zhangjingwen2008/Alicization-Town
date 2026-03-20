const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createPublicKeyFromX(x) {
  return crypto.createPublicKey({ format: 'jwk', key: { kty: 'OKP', crv: 'Ed25519', x } });
}

function createMockServer(port) {
  const profiles = new Map();
  const activeTokens = new Map();
  let sequence = 4000n;

  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        const payload = body ? JSON.parse(body) : {};
        res.setHeader('Content-Type', 'application/json');

        if (req.url === '/api/characters' && req.method === 'GET') {
          res.end(JSON.stringify({ characters: ['Boy', 'Princess', 'Samurai'] }));
          return;
        }

        if (req.url === '/api/profiles/create' && req.method === 'POST') {
          const id = String(sequence++);
          const handle = `at_${id}`;
          profiles.set(handle, { id, handle, name: payload.name, sprite: payload.sprite, publicKey: payload.publicKey });
          res.end(JSON.stringify({ handle, name: payload.name, sprite: payload.sprite }));
          return;
        }

        if (req.url === '/api/login' && req.method === 'POST') {
          const profile = profiles.get(payload.handle);
          if (!profile) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'profile missing' }));
            return;
          }

          const verified = crypto.verify(
            null,
            Buffer.from(`alicization-town:login:${payload.handle}:${payload.timestamp}`, 'utf8'),
            createPublicKeyFromX(profile.publicKey),
            Buffer.from(payload.signature, 'base64url'),
          );
          if (!verified) {
            res.statusCode = 401;
            res.end(JSON.stringify({ error: 'bad signature' }));
            return;
          }

          const previous = activeTokens.get(profile.id);
          const token = `token-${profile.id}-${Date.now()}`;
          activeTokens.set(profile.id, token);
          res.end(JSON.stringify({
            status: previous ? 'took_over_session' : 'authenticated',
            handle: profile.handle,
            name: profile.name,
            sprite: profile.sprite,
            token,
            expires_at: new Date(Date.now() + 3_600_000).toISOString(),
            lease_expires_at: new Date(Date.now() + 180_000).toISOString(),
          }));
          return;
        }

        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'not found' }));
      });
    });

    server.listen(port, () => resolve(server));
  });
}

function loadTownClient(homeDir) {
  process.env.ALICIZATION_TOWN_HOME = homeDir;
  process.env.HOME = homeDir;
  process.env.USERPROFILE = homeDir;
  for (const key of Object.keys(require.cache)) {
    if (key.includes(`${path.sep}shared${path.sep}town-client${path.sep}`)) {
      delete require.cache[key];
    }
  }
  return require('../../../shared/town-client');
}

describe('Town client server registry', () => {
  const servers = [];

  after(() => {
    for (const server of servers) server.close();
  });

  it('switches profile scope with the default server and supports explicit server override', async () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alicization-town-registry-'));
    const serverA = await createMockServer(59996);
    const serverB = await createMockServer(59997);
    servers.push(serverA, serverB);

    try {
      const town = loadTownClient(homeDir);
      const serverUrlA = 'http://127.0.0.1:59996';
      const serverUrlB = 'http://127.0.0.1:59997';

      const created = await town.login({ create: true, name: 'ScopedBot', sprite: 'Boy', server: serverUrlA });
      assert.equal(created.status, 'created_and_authenticated');
      assert.equal(town.listProfiles().items.length, 1);

      const switched = town.serverRegistry.setDefaultServer(serverUrlB);
      assert.equal(switched.url, serverUrlB);
      assert.equal(town.listProfiles().status, 'empty');

      const needsCreation = await town.login({});
      assert.equal(needsCreation.status, 'needs_creation');

      const relogged = await town.login({ profile: created.profile, server: serverUrlA });
      assert.equal(relogged.profile, created.profile);

      town.serverRegistry.setDefaultServer(serverUrlA);
      assert.equal(town.listProfiles().items.length, 1);
    } finally {
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it('handles legacy registry files and legacy flat profiles compatibly', () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alicization-town-legacy-'));

    try {
      const serverUrl = 'http://127.0.0.1:59996';
      const profilesDir = path.join(homeDir, 'profiles');
      fs.mkdirSync(profilesDir, { recursive: true });
      fs.writeFileSync(path.join(homeDir, 'servers.json'), JSON.stringify({ defaultServer: serverUrl }));
      fs.writeFileSync(path.join(profilesDir, 'legacy-bot.json'), JSON.stringify({
        profile: 'legacy-bot',
        handle: 'at_legacy',
        name: 'LegacyBot',
        sprite: 'Samurai',
        server: serverUrl,
      }));

      const town = loadTownClient(homeDir);
      const setDefault = town.serverRegistry.setDefaultServer(serverUrl);
      assert.equal(setDefault.url, serverUrl);

      assert.equal(Boolean(town.loadProfile('legacy-bot')), true);
      const listed = town.listProfiles();
      assert.equal(listed.status, 'ok');
      assert.equal(listed.items[0].profile, 'legacy-bot');
    } finally {
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });
});
