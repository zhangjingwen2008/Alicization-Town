#!/usr/bin/env node
/**
 * Alicization Town — Web Observer Smoke Test
 *
 * Spawns a server, creates N agents via SDK, walks them to scattered positions,
 * generates chat messages. Then exits — the server stays alive for manual browser verification.
 *
 * Usage:
 *   node eval/town/smoke-web.js [--port 5670] [--agents 8]
 */
'use strict';

const path = require('path');
const { spawn } = require('child_process');

// --- Config ---
const args = process.argv.slice(2);
function flag(name, fallback) {
  const idx = args.indexOf('--' + name);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}
const PORT = Number(flag('port', 5670));
const AGENT_COUNT = Number(flag('agents', 8));
const SERVER = `http://127.0.0.1:${PORT}`;
const SERVER_HOME = `/tmp/at-smoke-srv-${PORT}`;
const CLIENT_HOME = `/tmp/at-smoke-cli-${PORT}`;

// Force isolated storage
process.env.ALICIZATION_TOWN_HOME = CLIENT_HOME;

// --- SDK (lazy require after env setup) ---
let sdk;
function loadSdk() {
  // Clear require cache to pick up fresh env
  delete require.cache[require.resolve('../../shared/town-client')];
  sdk = require('../../shared/town-client');
}

// --- Agent roster ---
const ROSTER = [
  { name: 'Samurai',   sprite: 'Samurai'  },
  { name: 'Knight',    sprite: 'Boy'      },
  { name: 'Priestess', sprite: 'Princess' },
  { name: 'MonkZen',   sprite: 'Monk'     },
  { name: 'FarmerLee', sprite: 'Villager' },
  { name: 'Bones',     sprite: 'Skeleton' },
  { name: 'DarkLord',  sprite: 'Vampire'  },
  { name: 'EldSage',   sprite: 'OldMan'   },
].slice(0, AGENT_COUNT);

const DIRECTIONS = ['E', 'S', 'E', 'S', 'W', 'N', 'E', 'S'];
const STEPS =      [12,   8,  20,  5,   3,  15,  10,  25 ];

const MESSAGES = [
  '诸位，小镇今天格外热闹啊！',
  '这把剑是新买的，谁要来切磋？',
  '是啊，好久没有这么多人聚在一起了。',
  '阿弥陀佛，老衲正在修行中。',
  '有人知道面馆今天开门了吗？',
  '咔咔咔...我只是路过的骷髅...',
  '天还没黑呢，我先躲一会儿。',
  '年轻人们啊，要好好珍惜小镇时光。',
];

// --- Helpers ---
const delay = ms => new Promise(r => setTimeout(r, ms));

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['server/src/main.js'], {
      cwd: path.resolve(__dirname, '../..'),
      env: { ...process.env, PORT: String(PORT), ALICIZATION_TOWN_SERVER_HOME: SERVER_HOME },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let started = false;
    child.stdout.on('data', chunk => {
      const line = chunk.toString();
      process.stdout.write('  [srv] ' + line);
      if (!started && line.includes('已启动')) {
        started = true;
        resolve(child);
      }
    });
    child.stderr.on('data', chunk => process.stderr.write('  [srv!] ' + chunk.toString()));
    child.on('error', reject);
    child.on('exit', code => { if (!started) reject(new Error('Server exited: ' + code)); });
    setTimeout(() => { if (!started) reject(new Error('Server start timeout')); }, 10000);
  });
}

// --- Main ---
(async () => {
  console.log(`\n🔥 Smoke Test — ${AGENT_COUNT} agents on port ${PORT}\n`);

  // 1. Start server
  console.log('1️⃣  Starting server...');
  const server = await startServer();
  console.log('   Server PID:', server.pid);
  await delay(500);

  // 2. Load SDK
  loadSdk();

  // 3. Create & login all agents
  console.log('\n2️⃣  Creating agents...');
  const profiles = [];
  for (const agent of ROSTER) {
    const result = await sdk.login({
      create: true,
      profile: agent.name,
      name: agent.name,
      sprite: agent.sprite,
      server: SERVER,
    });
    profiles.push(agent.name);
    console.log(`   ✅ ${agent.name} → ${result.status} (handle: ${result.handle})`);
  }

  // 4. Walk each agent to different positions
  console.log('\n3️⃣  Walking agents...');
  for (let i = 0; i < profiles.length; i++) {
    const name = profiles[i];
    const dir1 = DIRECTIONS[i % DIRECTIONS.length];
    const steps1 = STEPS[i % STEPS.length];
    const dir2 = DIRECTIONS[(i + 1) % DIRECTIONS.length];
    const steps2 = STEPS[(i + 1) % STEPS.length];

    await sdk.runAuthenticated('POST', '/api/walk', { direction: dir1, steps: steps1 }, name);
    await sdk.runAuthenticated('POST', '/api/walk', { direction: dir2, steps: steps2 }, name);
    console.log(`   🚶 ${name} → ${dir1}${steps1} then ${dir2}${steps2}`);
  }

  // 5. Chat
  console.log('\n4️⃣  Chat...');
  for (let i = 0; i < profiles.length; i++) {
    const name = profiles[i];
    const msg = MESSAGES[i % MESSAGES.length];
    await sdk.runAuthenticated('POST', '/api/chat', { text: msg }, name);
    console.log(`   💬 ${name}: ${msg}`);
    await delay(150);
  }

  // 6. Done
  console.log(`\n✅ Smoke test complete. Server running at ${SERVER}`);
  console.log(`   Open ${SERVER} in browser to verify UI.`);
  console.log('   Press Ctrl+C to stop.\n');

  // Keep alive
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    server.kill('SIGTERM');
    process.exit(0);
  });
})().catch(err => {
  console.error('❌ Smoke test failed:', err.message);
  process.exit(1);
});
