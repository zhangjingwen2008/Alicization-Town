// 快速冒烟测试：验证地牢生成 + FOV + 战斗 + 战利品
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { generateFloor, isPassable, Tile } = require('../src/dungeon-gen');
const { computeFOV, renderFOVText } = require('../src/fov');
const { attackRound, createPlayerCombatStats, checkLevelUp } = require('../src/combat');
const { rollLoot, rollChestLoot } = require('../src/loot');
const { spawnMonster } = require('../src/monsters');

describe('Dungeon generation', () => {
  it('generates a floor with rooms, entry, exit, monsters and chests', () => {
    const floor = generateFloor(1, 48, 32, 42);
    assert.ok(floor.rooms.length >= 3, 'should have at least 3 rooms');
    assert.ok(floor.entry.x >= 0 && floor.entry.y >= 0);
    assert.ok(floor.exit.x >= 0 && floor.exit.y >= 0);
    assert.equal(floor.map[`${floor.entry.x},${floor.entry.y}`], Tile.EXIT);
    assert.equal(floor.map[`${floor.exit.x},${floor.exit.y}`], Tile.STAIRS);
    assert.ok(floor.monsters.length > 0, 'should spawn some monsters');
    // floor 1 entry should be passable
    assert.ok(isPassable(floor.map, floor.entry.x, floor.entry.y));
  });

  it('produces deterministic maps with the same seed', () => {
    const a = generateFloor(1, 48, 32, 99);
    const b = generateFloor(1, 48, 32, 99);
    assert.equal(a.rooms.length, b.rooms.length);
    assert.equal(a.entry.x, b.entry.x);
    assert.equal(a.monsters.length, b.monsters.length);
  });
});

describe('FOV', () => {
  it('computes visible tiles around a point', () => {
    const floor = generateFloor(1, 48, 32, 42);
    const visible = computeFOV(floor.map, floor.entry.x, floor.entry.y, 6);
    assert.ok(visible.size > 0, 'should have visible tiles');
    assert.ok(visible.has(`${floor.entry.x},${floor.entry.y}`), 'player position should be visible');
  });

  it('renders a text view without crashing', () => {
    const floor = generateFloor(1, 48, 32, 42);
    const visible = computeFOV(floor.map, floor.entry.x, floor.entry.y, 6);
    const text = renderFOVText(floor, floor.entry.x, floor.entry.y, visible);
    assert.ok(text.includes('B1F'));
    assert.ok(text.includes('@') === false || text.length > 50); // just check no crash
  });
});

describe('Combat', () => {
  it('deals damage and reduces HP', () => {
    const player = createPlayerCombatStats('TestPlayer');
    const monster = spawnMonster(1, Math.random);
    const initialHp = monster.hp;
    attackRound(player, monster);
    assert.ok(monster.hp < initialHp, 'monster should take damage');
  });

  it('levels up when enough exp is gained', () => {
    const stats = createPlayerCombatStats('Test');
    stats.exp = 25; // needs 20 for level 1→2
    const logs = checkLevelUp(stats);
    assert.ok(logs.length > 0);
    assert.equal(stats.level, 2);
  });
});

describe('Loot', () => {
  it('rolls loot items', () => {
    const item = rollLoot(2, Math.random);
    assert.ok(item);
    assert.ok(item.name);
  });

  it('generates chest loot', () => {
    const items = rollChestLoot(3, Math.random);
    assert.ok(items.length > 0);
  });
});
