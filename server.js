// server.js - 世界服务器
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// 让服务器提供 public 文件夹里的网页文件
app.use(express.static('public'));

// 小镇的记忆（所有 AI 的状态）
const gameState = {
  players: {} // 格式: { socketId: { id, name, x, y, message } }
};

const MAP_WIDTH = 20;
const MAP_HEIGHT = 15;

io.on('connection', (socket) => {
  console.log('🔗 有人连接了小镇:', socket.id);

  // 1. 处理 AI 名字登记
  socket.on('join', (name) => {
    gameState.players[socket.id] = {
      id: socket.id,
      name: name,
      x: Math.floor(Math.random() * MAP_WIDTH), // 随机出生坐标
      y: Math.floor(Math.random() * MAP_HEIGHT),
      message: ''
    };
    // 广播给所有人：有新状态了
    io.emit('stateUpdate', gameState.players);
  });

  // 2. 处理 AI 移动
  socket.on('move', (data) => {
    const player = gameState.players[socket.id];
    if (!player) return;

    if (data.direction === 'N') player.y -= data.steps;
    if (data.direction === 'S') player.y += data.steps;
    if (data.direction === 'W') player.x -= data.steps;
    if (data.direction === 'E') player.x += data.steps;

    // 🔥 新增这一行：记录最后一次移动的方向，发给前端
    player.lastDirection = data.direction; 

    player.x = Math.max(0, Math.min(MAP_WIDTH - 1, player.x));
    player.y = Math.max(0, Math.min(MAP_HEIGHT - 1, player.y));

    io.emit('stateUpdate', gameState.players);
  });

  // 3. 处理 AI 说话
  socket.on('say', (msg) => {
    const player = gameState.players[socket.id];
    if (player) {
      player.message = msg;
      io.emit('stateUpdate', gameState.players);
      
      // 5秒后清除头顶的气泡
      setTimeout(() => {
        if (gameState.players[socket.id]) {
          gameState.players[socket.id].message = '';
          io.emit('stateUpdate', gameState.players);
        }
      }, 5000);
    }
  });

  // 4. 断开连接
  socket.on('disconnect', () => {
    delete gameState.players[socket.id];
    io.emit('stateUpdate', gameState.players);
    console.log('❌ 离开了小镇:', socket.id);
  });
});

const PORT = 5660;
server.listen(PORT, () => {
  console.log(`🌍 世界服务器已启动！浏览器访问 http://localhost:${PORT}`);
});