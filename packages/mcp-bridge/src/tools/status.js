const definitions = [
  {
    name: 'status',
    description: '查看自己的身体状态（饥饿、精力、心情、社交等属性）和行动建议。需要 RPG 插件支持。',
    inputSchema: { type: 'object', properties: {} },
    annotations: { title: 'Status', readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
];

async function handle(name, _args, client) {
  if (name !== 'status') return null;
  const result = await client.getRpgAttrs();
  return { content: [{ type: 'text', text: result }] };
}

module.exports = { definitions, handle };
