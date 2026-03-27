const { runAuthenticated, formatWalk, formatChatSend, formatInteract, parseFlags } = require('./core');

function throwForAuth(auth) {
  if (!auth) return;
  throw new Error(auth.message || '当前无法执行该操作，请先 login。');
}

async function walk(args) {
  const flags = parseFlags(args);
  const target = {};
  if (flags.to || flags._[0]) target.to = flags.to || flags._.join(' ');
  if (flags.x !== undefined) target.x = Number(flags.x);
  if (flags.y !== undefined) target.y = Number(flags.y);
  if (flags.forward !== undefined) target.forward = Number(flags.forward);
  if (flags.right !== undefined) target.right = Number(flags.right);

  if (!target.to && target.x === undefined && target.forward === undefined && target.right === undefined) {
    throw new Error('用法: town walk --to <地名> | --x <X> --y <Y> | --forward <N> --right <N>');
  }

  const { auth, result } = await runAuthenticated('POST', '/api/walk', target);
  if (!result) throwForAuth(auth);
  if (result.error) throw new Error(result.error);
  console.log(formatWalk(result));
}

async function chat(args) {
  const flags = parseFlags(args);
  const text = flags.text || flags._.join(' ');
  if (!text) {
    throw new Error('用法: town chat --text <消息内容>');
  }

  const { auth, result } = await runAuthenticated('POST', '/api/chat', { text });
  if (!result) throwForAuth(auth);
  console.log(formatChatSend(text));
}

async function interact(args) {
  const flags = parseFlags(args);
  const item = flags.item || flags._.join(' ') || null;
  const body = item ? { item } : undefined;
  const { auth, result } = await runAuthenticated('POST', '/api/interact', body);
  if (!result) throwForAuth(auth);
  console.log(formatInteract(result));
}

async function status() {
  try {
    const { auth, result } = await runAuthenticated('GET', '/api/rpg/attrs');
    if (!result) throwForAuth(auth);
    if (!result || !result.attrs) {
      console.log('⚙️ status 命令需要 RPG Advanced 插件支持。当前服务器未安装该插件，请联系服务器管理员了解详情。');
      return;
    }

    const attrLabels = {
      hp: '❤️ 生命',
      hunger: '🍜 饱腹',
      mood: '😊 心情',
      energy: '⚡ 精力',
      social: '💬 社交',
      age: '📅 年龄',
    };

    let text = '📊 【我的状态】\n';
    for (const [key, info] of Object.entries(result.attrs)) {
      const label = attrLabels[key] || key;
      const max = info.max || 100;
      const pct = Math.round((info.value / max) * 10);
      const bar = '█'.repeat(pct) + '░'.repeat(10 - pct);
      text += `${label}: ${info.value}/${max} ${bar} (${info.label})\n`;
    }

    if (result.suggestions && result.suggestions.length > 0) {
      text += '\n💡 【行动建议】\n';
      for (const s of result.suggestions) {
        text += `• ${s}\n`;
      }
    }

    console.log(text.trimEnd());
  } catch (err) {
    if (err.statusCode === 404 || err.message?.includes('404')) {
      console.log('⚙️ status 命令需要 RPG Advanced 插件支持。当前服务器未安装该插件，请联系服务器管理员了解详情。');
    } else {
      throw err;
    }
  }
}

module.exports = { walk, chat, interact, status };
