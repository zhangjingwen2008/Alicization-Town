#!/usr/bin/env node
// 将命令行源码打成单文件可执行入口
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const ENTRY = path.join(ROOT, 'packages', 'town-cli', 'src', 'town.js');
const OUTPUT = path.join(ROOT, 'skills', 'alicization-town', 'scripts', 'town');

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });

execSync([
  'npx esbuild',
  JSON.stringify(ENTRY),
  '--bundle',
  '--platform=node',
  '--format=cjs',
  `--outfile=${JSON.stringify(OUTPUT)}`,
].join(' '), { cwd: ROOT, stdio: 'inherit' });

fs.chmodSync(OUTPUT, 0o755);
console.log(`✅ CLI bundled: ${OUTPUT}`);
