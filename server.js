// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static('public'));

// ==========================================
// 🗺️ Tiled 地图引擎 (.tmj) & 物理碰撞
// ==========================================
const mapPath = path.join(__dirname, 'public', 'assets', 'map.tmj');
let worldMap = null;
let collisionMap =[];

if (fs.existsSync(mapPath)) {
  worldMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  
  // 初始化一个全为 0 的碰撞地图
  collisionMap = new Array(worldMap.width * worldMap.height).fill(0);

  // 💥 核心：定义哪些层是“墙壁/障碍物”（不可行走）
  // ⚠️ 警告：如果你发现小人出生后完全动不了，说明你的 BaseFloor 铺满了全屏。
  // 正常的逻辑应该是把障碍物层设为碰撞，例如: ["Building", "Nature"]
  const collisionLayerNames =["Building", "Nature", "BuildingTop", "BaseNature"]; 

  worldMap.layers.forEach(layer => {
    if (layer.type === 'tilelayer' && collisionLayerNames.includes(layer.name)) {
      layer.data.forEach((tileId, index) => {
        // 如果这个格子的 ID 不是 0（代表有东西），则标记为不可行走 (1)
        if (tileId !== 0) {
          collisionMap[index] = 1; 
        }
      });
    }
  });
  console.log(`✅ 地图加载成功，已生成碰撞网格。`);
} else {
  console.error("❌ 找不到 map.tmj，请确保你已经将 Tiled 导出的文件放在 public/assets/ 下！");
}

// ==========================================
// 🧍 玩家状态管理
// ==========================================
const gameState = { players: {} };

io.on('connection', (socket) => {
  console.log('🔗 玩家连接:', socket.id);

  socket.on('join', (name) => {
    // 默认出生点 (如果出生点刚好在碰撞层上，你需要手动改一下这个坐标)
    let spawnX = 5, spawnY = 5; 
    
    gameState.players[socket.id] = {
      id: socket.id,
      name: name,
      x: spawnX,
      y: spawnY,
      lastDirection: 'S',
      message: ''
    };
    
    // 发送地图给前端
    socket.emit('initMap', worldMap);
    io.emit('stateUpdate', gameState.players);
  });

  socket.on('initMap', () => {
    socket.emit('initMap', worldMap);
  });

  socket.on('move', (data) => {
    const player = gameState.players[socket.id];
    if (!player || !worldMap) return;

    player.lastDirection = data.direction;

    let newX = player.x;
    let newY = player.y;
    if (data.direction === 'N') newY -= data.steps;
    if (data.direction === 'S') newY += data.steps;
    if (data.direction === 'W') newX -= data.steps;
    if (data.direction === 'E') newX += data.steps;

    // 1. 边界限制
    newX = Math.max(0, Math.min(worldMap.width - 1, newX));
    newY = Math.max(0, Math.min(worldMap.height - 1, newY));

    // 2. 多层物理碰撞检测 💥
    const tileIndex = newY * worldMap.width + newX;
    if (collisionMap[tileIndex] === 1) {
      // 撞墙了，拒绝更新坐标
      console.log(`🚧 ${player.name} 撞到了碰撞层！`);
    } else {
      player.x = newX;
      player.y = newY;
    }

    io.emit('stateUpdate', gameState.players);
  });

  socket.on('say', (msg) => {
    if (gameState.players[socket.id]) {
      gameState.players[socket.id].message = msg;
      io.emit('stateUpdate', gameState.players);
      setTimeout(() => {
        if (gameState.players[socket.id]) {
          gameState.players[socket.id].message = '';
          io.emit('stateUpdate', gameState.players);
        }
      }, 5000);
    }
  });

  socket.on('disconnect', () => {
    delete gameState.players[socket.id];
    io.emit('stateUpdate', gameState.players);
  });
});

server.listen(5660, () => {
  console.log(`🌍 Underworld 启动成功！访问 http://localhost:5660`);
});