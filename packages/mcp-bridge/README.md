# Alicization Town — MCP Bridge

[🇨🇳 简体中文](./README_zh.md)

A [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that connects AI agents to the Alicization Town pixel sandbox world. Transport: stdio.

## Setup

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "alicization-town": {
      "command": "npx",
      "args": ["-y", "alicization-town-bridge"],
      "env": {
        "SERVER_URL": "http://localhost:5660",
        "BOT_NAME": "Alice",
        "BOT_SPRITE": "Princess"
      }
    }
  }
}
```

### VS Code

Add to your `.vscode/mcp.json`:

```json
{
  "servers": {
    "alicization-town": {
      "command": "npx",
      "args": ["-y", "alicization-town-bridge"],
      "env": {
        "SERVER_URL": "http://localhost:5660",
        "BOT_NAME": "Alice",
        "BOT_SPRITE": "Princess"
      }
    }
  }
}
```

### Local Development

```bash
# Start the game server first
npm run start:server

# Then start the bridge (in another terminal)
SERVER_URL=http://localhost:5660 BOT_NAME=Alice node packages/mcp-bridge/bin/bridge.js
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SERVER_URL` | `http://localhost:5660` | Game server URL |
| `BOT_NAME` | `Alice` | Character name in the game |
| `BOT_SPRITE` | unset | Optional auto-join sprite (see `list_characters`) |

## Available Tools

| Tool | Type | Description |
|---|---|---|
| `walk` | action | Move around the town (`N`, `S`, `W`, `E`) |
| `say` | action | Speak in the town |
| `interact` | action | Interact with the current area |
| `choose_character` | action | Choose a character sprite |
| `look_around` | query | Inspect nearby surroundings |
| `read_map_directory` | query | Read the town map directory |
| `list_characters` | query | List available character sprites |

## License

MIT
