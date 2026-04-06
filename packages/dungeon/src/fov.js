// FOV (迷雾/视野) —— 基于 rot.js PreciseShadowcasting
const ROT = require('rot-js');
const { Tile } = require('./dungeon-gen');

/**
 * 计算玩家在地牢中的可见 tile 集合
 * @param {Object} map - 地牢 map（key: "x,y", value: Tile）
 * @param {number} px - 玩家 x
 * @param {number} py - 玩家 y
 * @param {number} [radius=6] - 视野半径
 * @returns {Set<string>} 可见坐标集合（"x,y" 格式）
 */
function computeFOV(map, px, py, radius = 6) {
  const visible = new Set();

  const fov = new ROT.FOV.PreciseShadowcasting((x, y) => {
    const tile = map[`${x},${y}`];
    // 墙壁不透光，其他 tile 透光
    return tile != null && tile !== Tile.WALL;
  });

  fov.compute(px, py, radius, (x, y, r, visibility) => {
    if (visibility > 0) {
      visible.add(`${x},${y}`);
    }
  });

  return visible;
}

/**
 * 生成玩家视角的地牢文本描述
 * @param {Object} floorData - generateFloor 返回值
 * @param {number} px - 玩家 x
 * @param {number} py - 玩家 y
 * @param {Set<string>} visible - computeFOV 结果
 * @returns {string} ASCII 地图 + 周围描述
 */
function renderFOVText(floorData, px, py, visible) {
  const { map, monsters, chests, width, height, floor } = floorData;
  const radius = 8;

  const lines = [];
  lines.push(`📍 地牢 B${floor}F  坐标 (${px}, ${py})`);
  lines.push('');

  // ASCII mini-map（只渲染视野范围内）
  const minX = Math.max(0, px - radius);
  const maxX = Math.min(width - 1, px + radius);
  const minY = Math.max(0, py - radius);
  const maxY = Math.min(height - 1, py + radius);

  // 怪物/宝箱位置索引
  const monsterMap = new Map();
  for (const m of monsters) {
    if (m.hp > 0) monsterMap.set(`${m.x},${m.y}`, m);
  }
  const chestMap = new Map();
  for (const c of chests) {
    if (!c.opened) chestMap.set(`${c.x},${c.y}`, c);
  }

  for (let y = minY; y <= maxY; y++) {
    let row = '';
    for (let x = minX; x <= maxX; x++) {
      const key = `${x},${y}`;
      if (x === px && y === py) {
        row += '@';  // 玩家
      } else if (!visible.has(key)) {
        row += ' ';  // 迷雾
      } else if (monsterMap.has(key)) {
        row += 'M';
      } else if (chestMap.has(key) && !chestMap.get(key).opened) {
        row += 'C';
      } else {
        const tile = map[key];
        row += tile === Tile.WALL ? '#' : tile === Tile.STAIRS ? '>' : tile === Tile.EXIT ? '<' : tile === Tile.DOOR ? '+' : '.';
      }
    }
    lines.push(row);
  }

  lines.push('');

  // 描述可见的实体
  const nearbyMonsters = monsters.filter(m => m.hp > 0 && visible.has(`${m.x},${m.y}`));
  const nearbyChests = chests.filter(c => !c.opened && visible.has(`${c.x},${c.y}`));

  if (nearbyMonsters.length > 0) {
    lines.push('⚠️ 可见怪物:');
    for (const m of nearbyMonsters) {
      const dist = Math.abs(m.x - px) + Math.abs(m.y - py);
      lines.push(`  ${m.emoji} ${m.name} (HP: ${m.hp}/${m.maxHp}) — 距离 ${dist} 格`);
    }
  }

  if (nearbyChests.length > 0) {
    lines.push(`📦 可见宝箱: ${nearbyChests.length} 个`);
  }

  // 检查脚下
  const standingOn = map[`${px},${py}`];
  if (standingOn === Tile.STAIRS) lines.push('🔽 脚下有通往更深层的楼梯');
  if (standingOn === Tile.EXIT) lines.push('🔼 脚下有返回的出口');

  return lines.join('\n');
}

module.exports = { computeFOV, renderFOVText };
