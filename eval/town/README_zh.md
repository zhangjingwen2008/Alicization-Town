# Town Resident Evaluation

[🌍 English](./README.md)

这个目录保存从小镇居民视角出发的本地评估脚本、场景定义和运行报告。

## 核心能力

- 使用本机已经配置好的 `Claude Code` 与 `Codex` 引擎
- 通过 `packages/mcp-bridge/bin/bridge.js` 暴露 MCP 工具（`map`、`look`、`walk`、`say`、`interact`）
- 评估来自 `skills/alicization-town/SKILL.md` 的本地 CLI skill 路径
- 让居民真实进入由 `server/src/main.js` 启动的小镇服务行动
- **以服务端世界状态作为唯一事实源**，通过 WebSocket 观察器实时追踪
- 为每次运行落出场景说明、结果对象、世界观测和判定产物

## 使用方式

这套评估脚本没有默认引擎，必须显式传入至少一个 `--engine`。
`--mode` 默认是 `mcp`，如果要评估 skill 路径，需要显式传 `--mode skill`。

### 基础用法

```bash
# 单引擎
node eval/town/evaluate.js --engine claude-code
node eval/town/evaluate.js --engine codex --mode mcp

# 多引擎对比
node eval/town/evaluate.js --engine claude-code --engine codex --mode mcp
```

### 双模式评估

同时评估 MCP 和 skill 两种模式：

```bash
node eval/town/evaluate.js --engine claude-code --mode mcp --mode skill
```

### 并发执行

通过 `--concurrency` 控制同时运行的评估数量（默认 1，上限 5）：

```bash
# 5 个场景同时跑
node eval/town/evaluate.js --engine claude-code --mode mcp --mode skill --concurrency 5
```

### 保持服务

评估结束后保留小镇服务，方便在网页上观察结果：

```bash
node eval/town/evaluate.js --engine claude-code --concurrency 3 --keep-server
# 然后浏览器打开 http://127.0.0.1:5660
```

### 查询信息

```bash
node eval/town/evaluate.js --list-engines   # 支持的引擎
node eval/town/evaluate.js --list-modes     # 支持的模式
```

## 评估场景

当前包含 **5 个递进式场景**，覆盖从基础到综合的不同能力维度：

| # | 场景 | 测试重点 | 预期工具 |
|---|------|---------|---------|
| 1 | `orientation-zh` | 地图认知 + 环境感知 + 社交 | map, look, say |
| 2 | `exploration-zh` | 多方向移动 + 持续观察 | look, walk, say |
| 3 | `social-interaction-zh` | 目标导航 + 互动体验 | map, walk, look, say, interact |
| 4 | `navigation-challenge-zh` | 精确路径规划 + 多段观察 | map, look, walk, say, interact |
| 5 | `full-life-zh` | 所有工具全覆盖的综合测试 | map, look, walk, say, interact |

场景定义在 `scenarios/resident-walkthrough.json`。

## 评估模式

| 模式 | 说明 |
|------|------|
| `mcp` | 通过 `packages/mcp-bridge/bin/bridge.js` 暴露的 MCP 工具进行评估 |
| `skill` | 通过 `skills/alicization-town/SKILL.md` 挂载的本地 CLI skill 进行评估 |

## 评估维度

每个场景的结果按三个维度打分：

| 维度 | 来源 | 含义 |
|------|------|------|
| **world_truth** | WebSocket 观察器 | 服务端世界中是否发生了预期的状态变化 |
| **format_truth** | 工具调用 + 结构化输出 | 引擎是否调用了场景要求的工具，输出是否与观测对齐 |
| **persona_truth** | 结构化输出 summary | 叙述是否以第一人称居民口吻，无元数据泄露 |

评估逻辑会根据场景 brief 自适应判断工具需求和时间线门槛。

## 停止标准

- **单引擎超时**：180 秒
- **全局 deadline**：900 秒（15 分钟）
- **状态隔离**：每轮评估使用独立的 `server-home` 和 `mcp-home`/`skill-home`

## 目录结构

```text
eval/town/
├── README.md
├── README_zh.md
├── evaluate.js               # 评估器主脚本
├── scenarios/
│   └── resident-walkthrough.json   # 5 个场景定义
├── schemas/
│   └── resident-outcome.schema.json
└── reports/                  # 运行产物（gitignore）
    └── latest -> run-YYYYMMDDTHHMMSSMMM/
```

## 报告产物

每轮评估在 `reports/run-{timestamp}/` 下生成：

| 文件 | 说明 |
|------|------|
| `report.md` | 人类可读的汇总报告 |
| `report.json` | 机器可解析的完整结果 |
| `review.html` | HTML 可视化回顾页面 |
| `run.json` | 本轮运行配置（引擎、模式、并发度） |
| `server.log` | 服务端日志 |

每个场景/模式/引擎组合独立目录，包含：

| 文件 | 说明 |
|------|------|
| `scenario.json` | 场景定义和 prompt |
| `assessment.json` | 详细判定结果，含每项期望的通过/失败证据 |
| `timing.json` | 耗时和 token 消耗 |
| `outputs/resident-outcome.json` | 引擎输出的结构化结果 |
| `outputs/world-observation.json` | WebSocket 观察器捕获的世界状态 |
| `outputs/world-timeline.jsonl` | 逐帧的状态变化流水 |
| `outputs/engine-events.jsonl` | 引擎原始事件流 |
| `outputs/journey.md` | 可读的行动记录 |
