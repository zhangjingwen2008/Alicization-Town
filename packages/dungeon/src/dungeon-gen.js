// 地牢地图生成 —— 基于 rot.js Digger 算法
const ROT = require('rot-js');
const { spawnMonster } = require('./monsters');
const { rollChestLoot } = require('./loot');

// 地图 tile 类型
const Tile = {
  WALL:     '#',
  FLOOR:    '.',
  DOOR:     '+',
  STAIRS:   '>',  // 下楼梯
  EXIT:     '<',  // 出口（回到地面）
  CHEST:    'C',
  MONSTER:  'M',
};

/**
 * 生成一层地牢
 * @param {number} floor - 层数 (1-based)
 * @param {number} [width=48] - 地图宽
 * @param {number} [height=32] - 地图高
 * @param {number} [seed] - 随机种子
 * @returns {{ map, rooms, monsters, chests, entry, exit, width, height }}
 */
function generateFloor(floor, width = 48, height = 32, seed) {
  // 设置全局 RNG seed，Digger 内部也使用 ROT.RNG
  if (seed != null) ROT.RNG.setSeed(seed + floor);
  const rngFn = () => ROT.RNG.getUniform();

  // 生成地牢
  const digger = new ROT.Map.Digger(width, height, {
    roomWidth: [4, 9],
    roomHeight: [3, 6],
    corridorLength: [2, 8],
    dugPercentage: 0.35,
  });

  // 收集 tile 数据
  const map = {};
  digger.create((x, y, value) => {
    // value: 0 = floor, 1 = wall
    map[`${x},${y}`] = value === 0 ? Tile.FLOOR : Tile.WALL;
  });

  // 获取房间列表
  const rooms = digger.getRooms();

  // 标记门
  for (const room of rooms) {
    room.getDoors((x, y) => {
      map[`${x},${y}`] = Tile.DOOR;
    });
  }

  // 入口: 第一个房间中心
  const entryRoom = rooms[0];
  const entry = {
    x: Math.floor((entryRoom.getLeft() + entryRoom.getRight()) / 2),
    y: Math.floor((entryRoom.getTop() + entryRoom.getBottom()) / 2),
  };

  // 出口/楼梯: 最后一个房间中心
  const exitRoom = rooms[rooms.length - 1];
  const exit = {
    x: Math.floor((exitRoom.getLeft() + exitRoom.getRight()) / 2),
    y: Math.floor((exitRoom.getTop() + exitRoom.getBottom()) / 2),
  };

  // 标记入口和出口
  map[`${entry.x},${entry.y}`] = Tile.EXIT;    // 回到上一层/地面
  map[`${exit.x},${exit.y}`] = Tile.STAIRS;    // 下楼

  // 在中间房间放置怪物和宝箱
  const monsters = [];
  const chests = [];

  for (let i = 1; i < rooms.length - 1; i++) {
    const room = rooms[i];
    const cx = Math.floor((room.getLeft() + room.getRight()) / 2);
    const cy = Math.floor((room.getTop() + room.getBottom()) / 2);

    // 每个房间 70% 概率有怪物
    if (rngFn() < 0.7) {
      const monster = spawnMonster(floor, rngFn);
      monster.x = cx;
      monster.y = cy;
      monsters.push(monster);
    }

    // 每个房间 40% 概率有宝箱（放在房间角落）
    if (rngFn() < 0.4) {
      const cx2 = room.getLeft() + 1;
      const cy2 = room.getTop() + 1;
      const items = rollChestLoot(floor, rngFn);
      if (items.length > 0) {
        chests.push({ x: cx2, y: cy2, items, opened: false });
        map[`${cx2},${cy2}`] = Tile.CHEST;
      }
    }
  }

  return { map, rooms, monsters, chests, entry, exit, width, height, floor };
}

/**
 * 检测 tile 是否可通行
 */
function isPassable(map, x, y) {
  const tile = map[`${x},${y}`];
  return tile && tile !== Tile.WALL;
}

module.exports = { generateFloor, isPassable, Tile };
