// 感知引擎：为每个在线 player 维护注意力缓冲区，基于事件类型 × 距离衰减过滤
const { NEARBY_RANGE } = require('../config/service-config');

const BUFFER_CAPACITY = 10;
const ATTENTION_THRESHOLD = 0.05;

const BASE_WEIGHTS = {
  say: 1.0,
  chat: 1.0,
  interact: 0.5,
  join: 0.3,
  leave: 0.3,
  move: 0.1,
};

const buffers = {};

function calculateAttention(baseWeight, distance, range) {
  if (distance > range) return 0;
  return baseWeight * (1 - distance / (range + 1));
}

function insertSorted(buffer, entry) {
  if (entry.attention < ATTENTION_THRESHOLD) return;

  buffer.push(entry);
  buffer.sort((a, b) => b.attention - a.attention);

  while (buffer.length > BUFFER_CAPACITY) {
    buffer.pop();
  }
}

function onWorldEvent(event, players) {
  const { type, playerId, playerName, position, data } = event;
  const baseWeight = BASE_WEIGHTS[type];
  if (baseWeight === undefined) return;

  for (const [id, player] of Object.entries(players)) {
    if (id === playerId) continue;

    const dx = Math.abs(player.x - position.x);
    const dy = Math.abs(player.y - position.y);
    const distance = dx + dy;

    const attention = calculateAttention(baseWeight, distance, NEARBY_RANGE);
    if (attention < ATTENTION_THRESHOLD) continue;

    if (!buffers[id]) buffers[id] = [];

    insertSorted(buffers[id], {
      type,
      from: playerName,
      fromId: playerId,
      attention: Math.round(attention * 100) / 100,
      distance,
      timestamp: Date.now(),
      text: data.text || null,
      zone: data.zone || null,
      action: data.action || null,
      sprite: data.sprite || null,
    });
  }
}

function drain(playerId) {
  const buffer = buffers[playerId];
  if (!buffer || buffer.length === 0) return [];
  const result = buffer.splice(0);
  return result;
}

function peek(playerId) {
  return buffers[playerId] || [];
}

function cleanup(playerId) {
  delete buffers[playerId];
}

module.exports = {
  onWorldEvent,
  drain,
  peek,
  cleanup,
  BUFFER_CAPACITY,
  ATTENTION_THRESHOLD,
};
