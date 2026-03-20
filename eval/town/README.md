# Town Resident Evaluation

[🇨🇳 中文](./README_zh.md)

Local evaluation scripts, scenario definitions, and run reports from a town resident perspective.

## Core Capabilities

- Uses locally configured `Claude Code` and `Codex` engines
- Exposes MCP tools via `packages/mcp-bridge/bin/bridge.js` (`map`, `look`, `walk`, `say`, `interact`)
- Evaluates the local CLI skill path from `skills/alicization-town/SKILL.md`
- Runs real residents in the town server started by `server/src/main.js`
- **Server-side world state is the single source of truth**, tracked via WebSocket observer
- Produces scenario descriptions, result objects, world observations, and assessment artifacts per run

## Usage

No default engine — at least one `--engine` is required.
`--mode` defaults to `mcp`; pass `--mode skill` for CLI skill evaluation.

### Basic

```bash
# Single engine
node eval/town/evaluate.js --engine claude-code
node eval/town/evaluate.js --engine codex --mode mcp

# Multi-engine comparison
node eval/town/evaluate.js --engine claude-code --engine codex --mode mcp
```

### Dual Mode

Evaluate both MCP and skill paths in one run:

```bash
node eval/town/evaluate.js --engine claude-code --mode mcp --mode skill
```

### Concurrency

Control parallel evaluation tasks with `--concurrency` (default 1, max 5):

```bash
# Run all 5 scenarios concurrently
node eval/town/evaluate.js --engine claude-code --mode mcp --mode skill --concurrency 5
```

### Keep Server

Keep the town server alive after evaluation for web observation:

```bash
node eval/town/evaluate.js --engine claude-code --concurrency 3 --keep-server
# Then open http://127.0.0.1:5660 in your browser
```

### Info

```bash
node eval/town/evaluate.js --list-engines   # Supported engines
node eval/town/evaluate.js --list-modes     # Supported modes
```

## Evaluation Scenarios

5 progressive scenarios covering from basic to comprehensive abilities:

| # | Scenario | Focus | Expected Tools |
|---|----------|-------|----------------|
| 1 | `orientation-zh` | Map awareness + environment sensing + social | map, look, say |
| 2 | `exploration-zh` | Multi-directional movement + observation | look, walk, say |
| 3 | `social-interaction-zh` | Target navigation + interaction | map, walk, look, say, interact |
| 4 | `navigation-challenge-zh` | Precise pathfinding + multi-step observation | map, look, walk, say, interact |
| 5 | `full-life-zh` | Full tool coverage comprehensive test | map, look, walk, say, interact |

Scenarios defined in `scenarios/resident-walkthrough.json`.

## Evaluation Modes

| Mode | Description |
|------|-------------|
| `mcp` | Evaluation via MCP tools exposed by `packages/mcp-bridge/bin/bridge.js` |
| `skill` | Evaluation via local CLI skill mounted from `skills/alicization-town/SKILL.md` |

## Assessment Dimensions

Each scenario result is scored across three dimensions:

| Dimension | Source | Meaning |
|-----------|--------|---------|
| **world_truth** | WebSocket observer | Did the expected state changes occur in the server world? |
| **format_truth** | Tool calls + structured output | Did the engine call required tools? Does output align with observations? |
| **persona_truth** | Structured output summary | Is the narrative first-person, no metadata leakage? |

Assessment logic auto-adapts tool requirements and timeline thresholds per scenario brief.

## Stopping Criteria

- **Per-engine timeout**: 180 seconds
- **Global deadline**: 900 seconds (15 minutes)
- **State isolation**: Each run uses independent `server-home` and `mcp-home`/`skill-home`

## Directory Structure

```text
eval/town/
├── README.md
├── README_zh.md
├── evaluate.js               # Main evaluator script
├── scenarios/
│   └── resident-walkthrough.json   # 5 scenario definitions
├── schemas/
│   └── resident-outcome.schema.json
└── reports/                  # Run artifacts (gitignored)
    └── latest -> run-YYYYMMDDTHHMMSSMMM/
```

## Report Artifacts

Each evaluation run generates under `reports/run-{timestamp}/`:

| File | Description |
|------|-------------|
| `report.md` | Human-readable summary |
| `report.json` | Machine-parseable full results |
| `review.html` | HTML visual review page |
| `run.json` | Run configuration (engines, modes, concurrency) |
| `server.log` | Server-side logs |

Each scenario/mode/engine combination has its own directory:

| File | Description |
|------|-------------|
| `scenario.json` | Scenario definition and prompt |
| `assessment.json` | Detailed assessment with pass/fail evidence per expectation |
| `timing.json` | Duration and token usage |
| `outputs/resident-outcome.json` | Engine structured output |
| `outputs/world-observation.json` | WebSocket observer world state capture |
| `outputs/world-timeline.jsonl` | Frame-by-frame state change stream |
| `outputs/engine-events.jsonl` | Raw engine event stream |
| `outputs/journey.md` | Human-readable action record |
