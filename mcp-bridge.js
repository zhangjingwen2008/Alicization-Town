// mcp-bridge.js - 本地 AI 网关
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { io } = require('socket.io-client');

// 拿到你想给 AI 取的名字，默认叫 Claude_Bot
const myName = process.env.BOT_NAME || 'Claude_Bot';

// 连接到我们在第一步写的世界服务器
const socket = io('http://localhost:5660');

let myState = null;
let allPlayers = {};

socket.on('connect', () => {
  console.error(`📡 成功连接到游戏服务器! ID: ${socket.id}`);
  socket.emit('join', myName); // 告诉服务器我要加入
});

socket.on('stateUpdate', (players) => {
  allPlayers = players;
  myState = players[socket.id];
});

// ==== MCP 服务器设置 ====
const mcpServer = new Server({ name: 'Alicization-Town-Bridge', version: '1.0.0' }, { capabilities: { tools: {} } });

// 定义 AI 可以用的工具
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools:[
      {
        name: 'walk',
        description: '在小镇移动 (N北/S南/W西/E东)',
        inputSchema: {
          type: 'object',
          properties: { direction: { type: 'string', enum:['N', 'S', 'W', 'E'] }, steps: { type: 'number' } },
          required:['direction', 'steps']
        }
      },
      {
        name: 'say',
        description: '在小镇里大声说话',
        inputSchema: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text']
        }
      },
      {
        name: 'look_around',
        description: '环顾四周，看看有谁在附近',
        inputSchema: { type: 'object', properties: {} }
      }
    ]
  };
});

// 处理 AI 调用工具的逻辑
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'walk') {
    socket.emit('move', { direction: args.direction, steps: args.steps });
    return { content:[{ type: 'text', text: `你向 ${args.direction} 走了 ${args.steps} 步。` }] };
  } 
  
  if (name === 'say') {
    socket.emit('say', args.text);
    return { content:[{ type: 'text', text: `你大声说: ${args.text}` }] };
  }

  if (name === 'look_around') {
    if (!myState) return { content:[{ type: 'text', text: '你还没进入小镇。' }] };
    let info = `你当前在坐标 (${myState.x}, ${myState.y})。\n`;
    const others = Object.values(allPlayers).filter(p => p.id !== socket.id);
    if (others.length === 0) {
      info += '四周空无一人。';
    } else {
      info += '你看到了以下玩家：\n';
      others.forEach(p => {
        info += `- ${p.name} 在坐标 (${p.x}, ${p.y})。`;
        if (p.message) info += ` 他正在说: "${p.message}"`;
        info += '\n';
      });
    }
    return { content: [{ type: 'text', text: info }] };
  }
});

// 启动 MCP (Stdio 模式)
async function start() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error('🚀 MCP Bridge 启动成功，正在等待大模型接入...');
}
start();