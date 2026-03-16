// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = process.env.PORT || 5660;
app.use(express.static('public'));

// ==========================================
// 🗺️ Tiled 地图与物理引擎
// ==========================================
const mapPath = path.join(__dirname, 'public', 'assets', 'map.tmj');
let worldMap = null;
let collisionMap = [];
let semanticZones =[];

if (fs.existsSync(mapPath)) {
  worldMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  collisionMap = new Array(worldMap.width * worldMap.height).fill(0);

  // 1. 物理碰撞层设定 (填入你 Tiled 里不可行走的图层名)
  const collisionLayerNames = ["BaseNature", "Nature", "Building", "BuildingTop"]; 

  worldMap.layers.forEach(layer => {
    if (layer.type === 'tilelayer' && collisionLayerNames.includes(layer.name)) {
      layer.data.forEach((tileId, index) => {
        if (tileId !== 0) collisionMap[index] = 1; // 1 表示有障碍物
      });
    }
  });

  // 2. 提取语义区域 (Semantic Zones)
  const zoneLayer = worldMap.layers.find(l => l.name === 'SemanticZones' || l.type === 'objectgroup');
  if (zoneLayer && zoneLayer.objects) {
    semanticZones = zoneLayer.objects;
    console.log(`🗺️ 成功加载 ${semanticZones.length} 个语义区域！`);
  }
} else {
  console.error("❌ 找不到 map.tmj！");
}

// 🧠 精准区域判定算法 (支持“临近感知 / 边缘距离计算”)
function getZoneAt(gridX, gridY) {
  if (semanticZones.length === 0) return null;
  
  // 玩家所在格子的正中心像素坐标
  const pixelX = (gridX * worldMap.tilewidth) + (worldMap.tilewidth / 2);
  const pixelY = (gridY * worldMap.tileheight) + (worldMap.tileheight / 2);

  // 💥 魔法变量：感知边缘 (Margin)。允许玩家站在建筑物外围 1.5 个格子的距离内被判定为“身处该区域”
  const INTERACT_MARGIN = worldMap.tilewidth * 1.5; 

  let closestZone = null;
  let minDistance = Infinity;

  for (let zone of semanticZones) {
    // 算法：计算一个“点”到一个“矩形(AABB)”的最短几何距离
    // 如果点在矩形内部，dx 和 dy 都会是 0
    const dx = Math.max(zone.x - pixelX, 0, pixelX - (zone.x + zone.width));
    const dy = Math.max(zone.y - pixelY, 0, pixelY - (zone.y + zone.height));
    const distance = Math.sqrt(dx * dx + dy * dy);

    // 如果玩家在感知范围内 (内部，或贴着墙壁)，并且是离得最近的一个区域
    if (distance <= INTERACT_MARGIN && distance < minDistance) {
      minDistance = distance;
      closestZone = zone;
    }
  }
  
  return closestZone;
}

// ==========================================
// 📺 新增：为网页端打造的 SSE 广播站
// ==========================================
let sseClients = []; // 存储所有连接的网页客户端

app.get('/events', (req, res) => {
  // 设置 SSE 头部
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // 立刻发送头部

  // 将这个客户端加入广播列表
  const clientId = Date.now();
  sseClients.push({ id: clientId, res: res });
  console.log(`📺 新的网页观察者已连接 (ID: ${clientId})`);

  // Send initial state immediately so new viewers see current players
  const initData = `data: ${JSON.stringify(gameState.players)}\n\n`;
  res.write(initData);

  // Send chat history
  const historyData = `event: chatHistory\ndata: ${JSON.stringify(chatHistory)}\n\n`;
  res.write(historyData);

  // 网页关闭时，从列表中移除
  req.on('close', () => {
    sseClients = sseClients.filter(client => client.id !== clientId);
    console.log(`👋 网页观察者已断开 (ID: ${clientId})`);
  });
});

// 广播函数：将最新状态发送给所有连接的网页
function broadcastStateToWeb() {
  if (sseClients.length === 0) return;
  
  const dataString = `data: ${JSON.stringify(gameState.players)}\n\n`;
  sseClients.forEach(client => client.res.write(dataString));
}

// ==========================================
// 🎭 Zone Interaction System
// ==========================================
const ZONE_INTERACTIONS = {
  'building': {
    'restaurant': [
      { action: '点了一碗兰州牛肉拉面', result: '热腾腾的面条端上来了，牛肉鲜嫩，汤头浓郁。你感到精力充沛！(You ordered Lanzhou beef noodles. The steaming noodles arrived - tender beef, rich broth. You feel energized!)', icon: 'Noodle', sound: 'interact' },
      { action: '点了一碗重庆小面', result: '辣得过瘾！麻辣鲜香在口中爆炸，额头冒出细汗。(Chongqing noodles! The spicy flavor explodes in your mouth. Sweat beads on your forehead.)', icon: 'Noodle', sound: 'interact' },
      { action: '吃了份寿司拼盘', result: '新鲜的鱼生入口即化，米饭粒粒分明。小镇居然有这么好的手艺！(The fresh sashimi melts in your mouth. Amazing craftsmanship in this small town!)', icon: 'Sushi', sound: 'interact' },
      { action: '点了一份烤串', result: '滋滋冒油的烤肉串，撒上孜然和辣椒面，香气扑鼻。(Sizzling meat skewers seasoned with cumin and chili. The aroma is irresistible.)', icon: 'Meat', sound: 'interact' },
      { action: '和老板聊了几句', result: '老板说最近有冒险者从东边的森林回来，带回了奇怪的消息。(The owner mentions adventurers returned from the eastern forest with strange news.)', icon: 'FortuneCookie', sound: 'chat' },
    ],
    'inn': [
      { action: '在壁炉旁休息', result: '温暖的火焰让你放松下来，恢复了体力。你听到其他旅客在低声交谈。(The warm fireplace relaxes you. You overhear other travelers whispering.)', icon: 'Heart', sound: 'heal' },
      { action: '向旅馆老板打听消息', result: '老板说："最近小镇来了不少新面孔，练习场那边很热闹。"(The innkeeper says: "Many new faces in town lately. The practice ground has been busy.")', icon: 'FortuneCookie', sound: 'chat' },
      { action: '翻看留言簿', result: '留言簿上有很多冒险者的留言，其中一条写着："池塘深处似乎藏着什么秘密..."(The guestbook has adventurer notes. One reads: "Something seems hidden in the depths of the pond...")', icon: 'GoldKey', sound: 'interact' },
      { action: '喝了杯蜂蜜牛奶', result: '香甜的蜂蜜牛奶暖入心脾，旅途的疲惫一扫而空。(Sweet honey milk warms your heart. The weariness of travel melts away.)', icon: 'MilkPot', sound: 'heal' },
    ],
    'weapon': [
      { action: '浏览武器架', result: '你看到了精钢长剑、橡木法杖、短弓和投掷飞刀。店主推荐了一把新到的附魔匕首。(You see steel swords, oak staffs, shortbows and throwing knives. The shopkeeper recommends a newly arrived enchanted dagger.)', icon: 'Sword', sound: 'interact' },
      { action: '试挥一把武士刀', result: '刀锋划破空气发出嗡鸣，手感极佳。店主微笑着说："好眼光。"(The blade hums through the air. Perfect balance. The shopkeeper smiles: "Good eye.")', icon: 'Katana', sound: 'interact' },
      { action: '和店主聊天', result: '店主是个退役老兵，他说："好武器要配好技术，去练习场磨练一下吧。"(The retired veteran shopkeeper says: "Good weapons need good skills. Go train at the practice ground.")', icon: 'Sword', sound: 'chat' },
    ],
    'potion': [
      { action: '查看药水货架', result: '红色恢复药水、蓝色魔力药水、绿色解毒药水，还有一瓶闪着紫光的神秘药剂。(Red healing potions, blue mana potions, green antidotes, and a mysterious purple-glowing elixir.)', icon: 'LifePot', sound: 'magic' },
      { action: '请女巫占卜', result: '女巫凝视水晶球，说道："你的命运与这个小镇紧密相连，重要的相遇即将到来..."(The witch gazes into her crystal ball: "Your fate is tied to this town. An important encounter awaits...")', icon: 'WaterPot', sound: 'magic' },
      { action: '试喝一瓶恢复药水', result: '温热的液体流过喉咙，你感到伤口在愈合，精神焕发。(The warm liquid flows down your throat. Wounds heal, spirit refreshes.)', icon: 'LifePot', sound: 'heal' },
    ],
    'practice': [
      { action: '进行剑术训练', result: '你挥舞木剑练习了基本招式。一个路过的老剑士纠正了你的姿势，你感到技巧有所提升！(You practice basic sword forms with a wooden sword. A passing master corrects your stance - your technique improves!)', icon: 'Sword', sound: 'interact' },
      { action: '观摩他人比试', result: '两个冒险者正在切磋，剑光闪烁。你从旁观中学到了一些实战技巧。(Two adventurers spar, blades flashing. You pick up combat tips from watching.)', icon: 'Katana', sound: 'interact' },
      { action: '进行体能训练', result: '跑步、俯卧撑、深蹲...你大汗淋漓，但感觉更强壮了。(Running, push-ups, squats... You are drenched in sweat but feel stronger.)', icon: 'Heart', sound: 'interact' },
      { action: '练习射箭', result: '你拉满弓弦，箭矢呼啸着射向靶心——差了一点！再来一次。(You draw the bow fully. The arrow whistles toward the target - just barely missed! One more try.)', icon: 'Bow', sound: 'interact' },
    ],
    'warehouse': [
      { action: '查看库存', result: '仓库里堆满了各种物资：粮食、药草、矿石、木材。管理员正在清点货物。(The warehouse is stocked with supplies: grain, herbs, ore, timber. The manager is taking inventory.)', icon: 'GoldCoin', sound: 'interact' },
      { action: '发现一个旧箱子', result: '角落里有个落灰的旧箱子，打开一看，里面有几枚古老的金币和一张泛黄的地图。(A dusty old crate in the corner. Inside: ancient gold coins and a yellowed map.)', icon: 'GoldKey', sound: 'interact' },
    ],
  },
  'nature': {
    'tree': [
      { action: '在树荫下乘凉', result: '微风吹过树叶，发出沙沙声。你在阴凉处感到十分惬意，注意到树干上刻着一些古老的符文。(A breeze rustles the leaves. You relax in the shade and notice ancient runes carved into the trunk.)', icon: 'Honey', sound: 'heal' },
      { action: '爬上树瞭望', result: '从高处可以看到整个小镇的全貌。远处的练习场传来金属碰撞声，池塘在阳光下闪闪发光。(From above you see the whole town. Metallic clashes echo from the practice ground. The pond glitters in sunlight.)', icon: 'Honey', sound: 'interact' },
      { action: '采集树上的果实', result: '你摘到了几个成熟的野果，味道酸甜可口，汁水充沛。(You pick ripe wild fruits - sweet and tart, bursting with juice.)', icon: 'Honey', sound: 'interact' },
    ],
    'pond': [
      { action: '观赏池塘里的鱼', result: '几条锦鲤在水中悠然游弋，睡莲的花瓣微微颤动。水面下似乎有什么东西闪了一下光。(Koi swim lazily among trembling lotus petals. Something glints beneath the surface.)', icon: 'Fish', sound: 'interact' },
      { action: '在池塘边发呆', result: '你静静地坐在池塘边，听着水声和鸟鸣。这是难得的宁静时光。(You sit quietly by the pond, listening to water and birdsong. A rare moment of peace.)', icon: 'WaterPot', sound: 'heal' },
      { action: '尝试钓鱼', result: '你找了根树枝当鱼竿。等了一会儿，感到一阵拉扯——钓到了一条小鱼！(You fashion a fishing rod from a branch. After waiting, you feel a tug - you caught a small fish!)', icon: 'Fish', sound: 'interact' },
      { action: '掬一捧清水洗脸', result: '清凉的泉水让你精神一振。水面倒映着天空和你的面庞。(Cool spring water refreshes you. The surface reflects the sky and your face.)', icon: 'WaterPot', sound: 'heal' },
    ],
    'grassland': [
      { action: '在草地上躺下', result: '柔软的草地很舒服，你望着天空中飘过的云朵，心情变得轻松愉快。(The soft grass is comfortable. You watch clouds drift by and feel carefree.)', icon: 'Heart', sound: 'heal' },
      { action: '采集草药', result: '你在草丛中发现了一些有用的草药，也许药水铺会感兴趣。(You find useful herbs in the grass. The potion shop might be interested.)', icon: 'Honey', sound: 'interact' },
    ],
  },
  'floor': {
    'paved': [
      { action: '观察石板路', result: '石板路上留有各种脚印和车辙，可以看出这里是小镇的主要通道。(Footprints and cart tracks show this is a main thoroughfare.)', icon: 'GoldCoin', sound: 'interact' },
    ],
  },
};

function getInteractionForZone(zone) {
  if (!zone) return { action: '环顾四周', result: '这里是空旷的街道，没有什么特别的。(An open street with nothing remarkable.)' };

  const zoneType = zone.type || 'building';
  const zoneName = (zone.name || '').toLowerCase();

  // Match zone name to interaction category
  let category = null;
  if (zoneName.includes('noodle') || zoneName.includes('restaurant') || zoneName.includes('面馆')) category = 'restaurant';
  else if (zoneName.includes('inn') || zoneName.includes('旅馆')) category = 'inn';
  else if (zoneName.includes('weapon') || zoneName.includes('armor') || zoneName.includes('武器')) category = 'weapon';
  else if (zoneName.includes('potion') || zoneName.includes('magic') || zoneName.includes('药水')) category = 'potion';
  else if (zoneName.includes('practice') || zoneName.includes('练习')) category = 'practice';
  else if (zoneName.includes('warehouse') || zoneName.includes('仓库')) category = 'warehouse';
  else if (zoneName.includes('tree') || zoneName.includes('树')) category = 'tree';
  else if (zoneName.includes('pond') || zoneName.includes('池塘')) category = 'pond';
  else if (zoneName.includes('grass') || zoneName.includes('草')) category = 'grassland';
  else if (zoneName.includes('paved') || zoneName.includes('石板')) category = 'paved';

  const typeInteractions = ZONE_INTERACTIONS[zoneType];
  if (!typeInteractions || !category || !typeInteractions[category]) {
    return { action: '四处看看', result: `你仔细观察了${zone.name}，感受着这里的氛围。(You observe ${zone.name} and take in the atmosphere.)` };
  }

  const options = typeInteractions[category];
  return options[Math.floor(Math.random() * options.length)];
}

// Chat history for the log
const chatHistory = [];
const MAX_CHAT_HISTORY = 50;

function addChatHistory(playerName, message) {
  chatHistory.push({
    time: Date.now(),
    name: playerName,
    message: message
  });
  if (chatHistory.length > MAX_CHAT_HISTORY) chatHistory.shift();
}

// SSE broadcast chat history
function broadcastChatToWeb(entry) {
  if (sseClients.length === 0) return;
  const dataString = `event: chat\ndata: ${JSON.stringify(entry)}\n\n`;
  sseClients.forEach(client => client.res.write(dataString));
}

// SSE broadcast interaction events
function broadcastInteractionToWeb(entry) {
  if (sseClients.length === 0) return;
  const dataString = `event: interaction\ndata: ${JSON.stringify(entry)}\n\n`;
  sseClients.forEach(client => client.res.write(dataString));
}

// ==========================================
// 🧍 玩家状态管理
// ==========================================
const gameState = { players: {} };

// Character sprite pool for unique appearance per player
const CHARACTER_SPRITES = ['Custom1', 'Boy', 'Cavegirl', 'Eskimo', 'FighterRed', 'Monk', 'OldMan', 'Princess', 'Samurai', 'Skeleton', 'Vampire', 'Villager'];
let nextSpriteIndex = 0;

io.on('connection', (socket) => {
  console.log('🔗 玩家连接:', socket.id);

  // Send available character list immediately on connect
  socket.emit('characterList', CHARACTER_SPRITES);

  socket.on('join', (data) => {
    // Support both old format (string name) and new format ({name, sprite})
    let name, chosenSprite;
    if (typeof data === 'string') {
      name = data;
    } else {
      name = data.name;
      chosenSprite = data.sprite;
    }

    let spawnX = 5, spawnY = 5; // 默认坐标
    const zone = getZoneAt(spawnX, spawnY);

    // Use chosen sprite if valid, otherwise assign round-robin
    let sprite;
    if (chosenSprite && CHARACTER_SPRITES.includes(chosenSprite)) {
      sprite = chosenSprite;
    } else {
      sprite = CHARACTER_SPRITES[nextSpriteIndex % CHARACTER_SPRITES.length];
      nextSpriteIndex++;
    }

    gameState.players[socket.id] = {
      id: socket.id, name: name, x: spawnX, y: spawnY, lastDirection: 'S', message: '', interactionText: '', isThinking: false,
      sprite: sprite,
      currentZoneName: zone ? zone.name : "小镇街道",
      currentZoneDesc: zone ? (zone.properties?.find(p => p.name === 'description')?.value || '') : "空旷的街道"
    };
    
    // 整理一份“地图旅游指南”发给 MCP 网关
    const directory = semanticZones.map(z => ({
      name: z.name,
      // 把原始像素坐标换算成 AI 用的网格中心坐标
      x: Math.floor((z.x + z.width/2) / worldMap.tilewidth),
      y: Math.floor((z.y + z.height/2) / worldMap.tileheight),
      description: z.properties?.find(p => p.name === 'description')?.value || ''
    }));

    socket.emit('initMap', worldMap);
    socket.emit('mapDirectory', directory);
    io.emit('stateUpdate', gameState.players);
    broadcastStateToWeb();
  });

  // Allow character change after joining
  socket.on('chooseCharacter', (spriteName, callback) => {
    const player = gameState.players[socket.id];
    if (!player) {
      if (typeof callback === 'function') callback({ success: false, message: '你还没加入游戏。' });
      return;
    }
    if (!CHARACTER_SPRITES.includes(spriteName)) {
      if (typeof callback === 'function') callback({ success: false, message: `无效角色。可选: ${CHARACTER_SPRITES.join(', ')}` });
      return;
    }
    player.sprite = spriteName;
    io.emit('stateUpdate', gameState.players);
    broadcastStateToWeb();
    if (typeof callback === 'function') callback({ success: true, message: `你选择了角色: ${spriteName}` });
  });

  socket.on('move', (data) => {
    const player = gameState.players[socket.id];
    if (!player) return;

    player.lastDirection = data.direction;
    const steps = Math.max(1, Math.min(data.steps, 20)); // Clamp steps to prevent abuse

    // Step-by-step collision: walk each tile along the path, stop at first obstacle
    const dx = data.direction === 'E' ? 1 : data.direction === 'W' ? -1 : 0;
    const dy = data.direction === 'S' ? 1 : data.direction === 'N' ? -1 : 0;

    for (let i = 0; i < steps; i++) {
      const nextX = player.x + dx;
      const nextY = player.y + dy;

      // Bounds check
      if (nextX < 0 || nextX >= worldMap.width || nextY < 0 || nextY >= worldMap.height) break;

      // Collision check per tile
      if (collisionMap[nextY * worldMap.width + nextX] === 1) break;

      player.x = nextX;
      player.y = nextY;
    }

    // Update semantic zone
    const zone = getZoneAt(player.x, player.y);
    player.currentZoneName = zone ? zone.name : "小镇街道";
    player.currentZoneDesc = zone ? (zone.properties?.find(p => p.name === 'description')?.value || '') : "空旷的街道";

    io.emit('stateUpdate', gameState.players);
    broadcastStateToWeb(); // Bug fix: broadcast move events to SSE web viewers
  });

  socket.on('say', (msg) => {
    if (gameState.players[socket.id]) {
      gameState.players[socket.id].message = msg;

      // Add to chat history
      const chatEntry = { time: Date.now(), name: gameState.players[socket.id].name, message: msg };
      addChatHistory(chatEntry.name, chatEntry.message);
      broadcastChatToWeb(chatEntry);

      io.emit('stateUpdate', gameState.players);
      setTimeout(() => {
        if (gameState.players[socket.id]) {
          gameState.players[socket.id].message = '';
          io.emit('stateUpdate', gameState.players);
        }
      }, 5000);
    }
  broadcastStateToWeb();
  });

  // Zone interaction handler
  socket.on('interact', (callback) => {
    const player = gameState.players[socket.id];
    if (!player) {
      if (typeof callback === 'function') callback({ success: false, result: '你还没进入小镇。' });
      return;
    }
    const zone = getZoneAt(player.x, player.y);
    const interaction = getInteractionForZone(zone);

    // Set interaction bubble on player (visible to web viewers)
    player.interactionText = interaction.action;
    player.interactionIcon = interaction.icon || '';
    player.interactionSound = interaction.sound || 'interact';
    io.emit('stateUpdate', gameState.players);
    broadcastStateToWeb();

    // Clear interaction bubble after 4 seconds
    setTimeout(() => {
      if (gameState.players[socket.id]) {
        gameState.players[socket.id].interactionText = '';
        gameState.players[socket.id].interactionIcon = '';
        gameState.players[socket.id].interactionSound = '';
        io.emit('stateUpdate', gameState.players);
        broadcastStateToWeb();
      }
    }, 4000);

    // Broadcast interaction event to chat log
    const entry = {
      time: Date.now(),
      name: player.name,
      zone: zone ? zone.name : '小镇街道',
      action: interaction.action,
      result: interaction.result
    };
    broadcastInteractionToWeb(entry);

    if (typeof callback === 'function') {
      callback({ success: true, zone: zone ? zone.name : '小镇街道', ...interaction });
    }
  });

  socket.on('playerStateUpdate', (data) => {
    const player = gameState.players[socket.id];
    if (player) {
      // 把状态更新到玩家对象上
      player.isThinking = data.isThinking;
      
      // 广播给所有观察者
      io.emit('stateUpdate', gameState.players);
    }
    broadcastStateToWeb();
  });

  socket.on('disconnect', () => {
    delete gameState.players[socket.id];
    io.emit('stateUpdate', gameState.players);
    broadcastStateToWeb();
  });
});

server.listen(PORT, () => console.log(`🌍 Underworld 已启动: http://localhost:${PORT}`));