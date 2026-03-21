#!/usr/bin/env node
/**
 * Skill-mode standalone eval: tests whether an agent can use the
 * Alicization Town skill to connect to a NON-DEFAULT server address.
 *
 * 1. Starts a temp server on a custom port (5670)
 * 2. Ensures .claude/skills/ symlink exists
 * 3. Runs claude code with native skill, prompt only says
 *    "use the Alicization Town skill, server is at <custom-url>"
 * 4. Observes world state via socket.io
 */
'use strict';

const path = require('path');
const fs = require('fs');
const net = require('net');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const TEST_PORT = 5670;
const TEST_URL = `http://127.0.0.1:${TEST_PORT}`;
const TIMEOUT_MS = 300000;
const BOT_NAME = '烟雾测试员';
const BOT_SPRITE = 'Samurai';

function loadSocketClient() {
  try { return require('socket.io-client'); } catch (_) {
    try { return require(path.join(ROOT, 'node_modules', 'socket.io-client')); } catch (__) {
      return require(path.join(ROOT, 'server', 'node_modules', 'socket.io-client'));
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function isPortOpen(port) {
  return new Promise(resolve => {
    const s = new net.Socket();
    s.setTimeout(500);
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('timeout', () => { s.destroy(); resolve(false); });
    s.once('error', () => { s.destroy(); resolve(false); });
    s.connect(port, '127.0.0.1');
  });
}

async function waitForPort(port, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await isPortOpen(port)) return true;
    await sleep(250);
  }
  return false;
}

function ensureClaudeSkills() {
  const target = path.join(ROOT, '.claude', 'skills', 'alicization-town');
  const source = path.join(ROOT, 'skills', 'alicization-town');
  if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) return;
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.symlinkSync(source, target, 'dir');
}

function ensureCli() {
  const r = spawnSync('npm', ['run', 'build:cli'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`CLI build failed: ${r.stderr}`);
}

async function startServer() {
  const home = `/tmp/at-skill-eval-srv-${TEST_PORT}`;
  fs.rmSync(home, { recursive: true, force: true });
  fs.mkdirSync(home, { recursive: true });

  const child = spawn('node', ['server/src/main.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(TEST_PORT), ALICIZATION_TOWN_SERVER_HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', d => process.stdout.write(`  [srv] ${d}`));
  child.stderr.on('data', d => process.stderr.write(`  [srv!] ${d}`));

  if (!(await waitForPort(TEST_PORT, 10000))) {
    child.kill('SIGKILL');
    throw new Error('Server did not start');
  }
  return child;
}

function createObserver() {
  const io = loadSocketClient().io;
  const timeline = [];
  let finalPlayer = null;

  const socket = io(TEST_URL, { reconnection: false, timeout: 5000, transports: ['websocket', 'polling'] });

  socket.on('stateUpdate', players => {
    const p = Object.values(players).find(p => p && p.name && p.name !== 'Observer');
    if (!p) return;
    const snap = { ts: new Date().toISOString(), name: p.name, x: p.x, y: p.y, zone: p.currentZoneName || '', message: p.message || '', interaction: p.interactionText || '' };
    const prev = timeline[timeline.length - 1];
    if (prev && JSON.stringify(prev) === JSON.stringify({ ...snap, ts: prev.ts })) return;
    timeline.push(snap);
    finalPlayer = snap;
  });

  return {
    timeline,
    getFinal: () => finalPlayer,
    stop: async () => { await sleep(2000); socket.disconnect(); },
  };
}

async function runClaude(prompt) {
  const skillHome = `/tmp/at-skill-eval-cli-${TEST_PORT}`;
  fs.rmSync(skillHome, { recursive: true, force: true });
  fs.mkdirSync(path.join(skillHome, 'alicization-town'), { recursive: true });

  const debugFile = `/tmp/at-skill-eval-debug-${Date.now()}.log`;
  const args = [
    '-p',
    '--permission-mode', 'bypassPermissions',
    '--no-session-persistence',
    '--input-format', 'text',
    '--output-format', 'json',
    '--debug-file', debugFile,
    '-',
  ];

  const env = {
    ...process.env,
    ALICIZATION_TOWN_HOME: path.join(skillHome, 'alicization-town'),
    PATH: `${path.join(ROOT, 'skills', 'alicization-town', 'scripts')}:${process.env.PATH || ''}`,
  };

  return new Promise(resolve => {
    const child = spawn('claude', args, { cwd: ROOT, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 1000); }, TIMEOUT_MS);

    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ exitCode: code, stdout, stderr, debugFile });
    });
    child.stdin.end(prompt);
  });
}

async function main() {
  console.log(`\n🧪 Skill Eval — Non-default server test`);
  console.log(`   Server: ${TEST_URL}`);
  console.log(`   Bot: ${BOT_NAME}\n`);

  // Prepare
  console.log('1️⃣  Building CLI + ensuring .claude/skills/...');
  ensureCli();
  ensureClaudeSkills();

  // Start server on custom port
  console.log(`2️⃣  Starting server on port ${TEST_PORT}...`);
  const server = await startServer();
  console.log(`   Server PID: ${server.pid}`);

  // Start observer
  const observer = createObserver();
  await sleep(500);

  // Build prompt — deliberately does NOT mention http://localhost:5660
  const prompt = [
    `你好！请使用 Alicization Town 技能来完成下面的任务。`,
    ``,
    `服务器地址是 ${TEST_URL}（注意：不是默认端口）。`,
    `你的名字是${BOT_NAME}，角色形象选 ${BOT_SPRITE}。`,
    ``,
    `请进入小镇，四处逛逛，和这个世界互动一下。`,
    `查看地图，走走看看，找个有趣的地方体验一下。`,
    `最后用中文聊聊你的感受。`,
  ].join('\n');

  console.log(`\n3️⃣  Running Claude Code (native-skill mode, timeout=${TIMEOUT_MS / 1000}s)...`);
  console.log(`   Prompt:\n${prompt.split('\n').map(l => '   │ ' + l).join('\n')}\n`);

  const result = await runClaude(prompt);
  await observer.stop();

  // Results
  console.log(`\n4️⃣  Results:`);
  console.log(`   Exit code: ${result.exitCode}`);
  console.log(`   Stdout length: ${result.stdout.length}`);
  console.log(`   Stderr length: ${result.stderr.length}`);
  console.log(`   Timeline events: ${observer.timeline.length}`);

  const final = observer.getFinal();
  if (final) {
    console.log(`   Final player: ${final.name} at (${final.x}, ${final.y}) zone="${final.zone}"`);
    if (final.message) console.log(`   Last message: "${final.message}"`);
    if (final.interaction) console.log(`   Last interaction: "${final.interaction}"`);
  } else {
    console.log(`   ⚠️  No player observed in world`);
  }

  // Verdict
  console.log(`\n${'═'.repeat(55)}`);
  const checks = [];
  checks.push({ name: 'Agent entered world', pass: observer.timeline.length > 0 });
  checks.push({ name: 'Agent moved from spawn', pass: final && (final.x !== 5 || final.y !== 5) });
  checks.push({ name: 'Agent spoke in world', pass: final && final.message.length > 0 });
  checks.push({ name: 'Connected to custom port', pass: observer.timeline.length > 0 }); // if timeline has data, it connected to our port

  let allPass = true;
  for (const c of checks) {
    console.log(`  ${c.pass ? '✅' : '❌'} ${c.name}`);
    if (!c.pass) allPass = false;
  }
  console.log(`${'═'.repeat(55)}`);
  console.log(allPass ? '\n🎉 ALL CHECKS PASSED\n' : '\n⚠️  SOME CHECKS FAILED\n');

  // Print timeline summary
  if (observer.timeline.length > 0) {
    console.log('📜 Timeline (last 10 events):');
    for (const ev of observer.timeline.slice(-10)) {
      const parts = [`  [${ev.ts.slice(11, 19)}] (${ev.x},${ev.y}) ${ev.zone}`];
      if (ev.message) parts.push(`💬 "${ev.message}"`);
      if (ev.interaction) parts.push(`🎭 "${ev.interaction}"`);
      console.log(parts.join(' '));
    }
  }

  // Cleanup
  server.kill('SIGTERM');
  await sleep(500);
  if (server.exitCode === null) server.kill('SIGKILL');
}

main().catch(err => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
