const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BRIDGE_BIN = path.join(__dirname, '..', 'bin', 'bridge.js');

function createPublicKeyFromX(x) {
  return crypto.createPublicKey({ format: 'jwk', key: { kty: 'OKP', crv: 'Ed25519', x } });
}

function createMockServer(port) {
  const profiles = new Map();
  const tokens = new Map();
  const activeTokens = new Map();
  let sequence = 3000n;

  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        const payload = body ? JSON.parse(body) : {};
        const auth = req.headers.authorization?.replace(/^Bearer\s+/i, '') || null;
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
          if (previous) tokens.delete(previous);

          const token = `token-${profile.id}-${Date.now()}`;
          tokens.set(token, { id: profile.id });
          activeTokens.set(profile.id, token);
          res.end(JSON.stringify({
            status: previous ? 'took_over_session' : 'authenticated',
            handle: profile.handle,
            name: profile.name,
            sprite: profile.sprite,
            token,
            expires_at: new Date(Date.now() + 3600000).toISOString(),
            lease_expires_at: new Date(Date.now() + 180000).toISOString(),
            message: previous ? `已接管角色 ${profile.name} 的在线会话。` : `已登录角色 ${profile.name}。`,
          }));
          return;
        }

        if (req.url === '/api/session/heartbeat' && req.method === 'POST') {
          if (!auth || !tokens.has(auth)) {
            res.statusCode = 401;
            res.end(JSON.stringify({ error: 'unauthorized' }));
            return;
          }
          res.end(JSON.stringify({
            ok: true,
            lease_expires_at: new Date(Date.now() + 180000).toISOString(),
            expires_at: new Date(Date.now() + 3600000).toISOString(),
          }));
          return;
        }

        if (req.url === '/api/map' && req.method === 'GET') {
          if (!auth || !tokens.has(auth)) {
            res.statusCode = 401;
            res.end(JSON.stringify({ error: 'unauthorized' }));
            return;
          }
          res.end(JSON.stringify({ directory: [] }));
          return;
        }

        if (req.url === '/api/look' && req.method === 'GET') {
          if (!auth || !tokens.has(auth)) {
            res.statusCode = 401;
            res.end(JSON.stringify({ error: 'unauthorized' }));
            return;
          }
          res.end(JSON.stringify({ player: { x: 5, y: 5, zone: '小镇街道', zoneDesc: '空旷的街道' }, nearby: [] }));
          return;
        }

        if (req.url === '/api/status' && req.method === 'PUT') {
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        if (req.url === '/api/logout' && req.method === 'POST') {
          if (auth) tokens.delete(auth);
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        res.end(JSON.stringify({ ok: true }));
      });
    });

    server.listen(port, () => resolve(server));
  });
}

function waitForBridge(proc) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const timeout = setTimeout(() => reject(new Error(`Bridge startup timeout. stderr: ${stderr}`)), 8000);
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.includes('MCP Bridge')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    proc.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Bridge exited early (code ${code}). stderr: ${stderr}`));
    });
  });
}

function sendMCPRequest(proc, request) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`MCP response timeout for ${request.method}`)), 10000);
    let buffer = '';
    const onData = (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.id === request.id) {
            clearTimeout(timeout);
            proc.stdout.removeListener('data', onData);
            resolve(parsed);
            return;
          }
        } catch {}
      }
    };
    proc.stdout.on('data', onData);
    proc.stdin.write(JSON.stringify(request) + '\n');
  });
}

async function initializeBridge(proc) {
  await sendMCPRequest(proc, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'compat-test', version: '1.0.0' },
    },
  });
  proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
}

async function callTool(proc, id, name, args = {}) {
  const response = await sendMCPRequest(proc, {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: args },
  });
  return response.result.content[0].text;
}

describe('Bridge contract (canonical)', () => {
  it('returns empty list-profile before create, then supports takeover login', async () => {
    const port = 59991;
    const server = await createMockServer(port);
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'alicization-town-bridge-compat-'));
    const bridge = spawn('node', [BRIDGE_BIN], {
      env: { ...process.env, SERVER_URL: `http://127.0.0.1:${port}`, ALICIZATION_TOWN_HOME: tempHome },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    try {
      await waitForBridge(bridge);
      await initializeBridge(bridge);

      const emptyProfiles = JSON.parse(await callTool(bridge, 2, 'list-profile'));
      assert.equal(emptyProfiles.status, 'empty');

      const created = JSON.parse(await callTool(bridge, 3, 'login', { create: true, name: 'Canon', sprite: 'Princess' }));
      assert.equal(created.status, 'created_and_authenticated');

      const relogged = JSON.parse(await callTool(bridge, 4, 'login', { profile: created.profile }));
      assert.equal(relogged.profile, created.profile);
      assert.equal(relogged.handle, created.handle);
      assert.ok(['authenticated', 'took_over_session'].includes(relogged.status));
    } finally {
      bridge.kill('SIGTERM');
      server.close();
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });
});
