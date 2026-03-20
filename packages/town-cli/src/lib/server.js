const { serverRegistry, parseFlags, stringifyResult } = require('./core');

function serverCommand(args) {
  const flags = parseFlags(args);
  const subcommand = flags._[0] || 'list';

  if (subcommand === 'list') {
    const info = serverRegistry.listServers();
    const entries = Object.entries(info.servers);
    if (entries.length === 0) {
      console.log('暂无已注册服务器。默认: ' + info.defaultServer);
      return;
    }
    console.log(`📡 已注册服务器 (默认: ${info.defaultServer})\n`);
    for (const [fp, entry] of entries) {
      const isDefault = entry.url === info.defaultServer;
      const nameTag = entry.name ? ` [${entry.name}]` : '';
      console.log(`${isDefault ? '→' : ' '} ${entry.url}${nameTag} (${fp})`);
    }
    return;
  }

  if (subcommand === 'set-default') {
    const nameOrUrl = flags._[1] || flags.url;
    if (!nameOrUrl) {
      console.error('❌ 请指定服务器名称或地址: server set-default <NAME_OR_URL>');
      process.exit(1);
    }
    const resolved = serverRegistry.resolveServer(nameOrUrl);
    const url = resolved || nameOrUrl;
    const result = serverRegistry.setDefaultServer(url);
    const label = result.name ? `${result.name} (${result.url})` : result.url;
    console.log(`✅ 默认服务器已设置为 ${label}`);
    return;
  }

  if (subcommand === 'add') {
    const url = flags._[1] || flags.url;
    const name = flags.name || null;
    if (!url) {
      console.error('❌ 请指定服务器地址: server add <URL> [--name <ALIAS>]');
      process.exit(1);
    }
    const result = serverRegistry.addServer(url, name);
    const label = result.name ? `${result.name} (${result.url})` : result.url;
    console.log(`✅ ${result.isNew ? '已添加' : '已更新'}服务器 ${label}`);
    return;
  }

  if (subcommand === 'rename') {
    const nameOrUrl = flags._[1];
    const newName = flags._[2] || flags.name;
    if (!nameOrUrl || !newName) {
      console.error('❌ 用法: server rename <NAME_OR_URL> <NEW_NAME>');
      process.exit(1);
    }
    const result = serverRegistry.renameServer(nameOrUrl, newName);
    if (!result) {
      console.error('❌ 未找到该服务器');
      process.exit(1);
    }
    console.log(`✅ 服务器 ${result.url} 已重命名为 [${result.name}]`);
    return;
  }

  console.log(`用法: server <list|set-default|add|rename> [args]

  list                              查看已注册的服务器列表
  set-default <NAME_OR_URL>         按名称或地址设置默认服务器
  add <URL> [--name <ALIAS>]        添加服务器到注册表（可附带别名）
  rename <NAME_OR_URL> <NEW_NAME>   重命名已注册的服务器`);
}

module.exports = { server: serverCommand };
