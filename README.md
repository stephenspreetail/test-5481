# Memex(RL)

Indexed experience memory for LLM agents. Memex(RL) stores past experiences (state, action, reward, outcome) and retrieves the most relevant ones to augment an agent's decision-making through context injection into Claude API calls.

## Installation

```bash
pip install -e ".[dev]"
```

Requires Python 3.9+. Core dependencies: `anthropic`, `numpy`.

## Quick Start

```python
from memex import MemexAgent, MemexConfig

config = MemexConfig(embedding_backend="hash")
agent = MemexAgent(config=config, db_path="memex.db")

# Agent chooses an action based on state and retrieved past experiences
action = agent.act(
    state="The agent is at position (3, 4)",
    task_context="Navigate to the exit",
    available_actions=["move_north", "move_south", "move_east", "move_west"],
)

# After executing the action, feed the result back
agent.observe(
    state="The agent is at position (3, 4)",
    action=action,
    reward=0.75,
    outcome="Moved to position (3, 5). Found a key.",
    task_context="Navigate to the exit",
)
```

To use the Claude embeddings backend (`voyage-3`) instead of the default hash embedder, set `embedding_backend="claude"` and provide an `ANTHROPIC_API_KEY` environment variable or pass `anthropic_api_key` to `MemexAgent`.

## Architecture

```
Experience → MultiDimensionalIndex → MemexRetriever → ContextBuilder → Claude API
                (semantic, behavioral, temporal)         ↑
                                                   RetrievalScorer
```

- **Experience** — dataclass holding state/action/reward/outcome with importance scoring
- **ExperienceDatabase** — SQLite persistence with binary numpy embedding serialization
- **MultiDimensionalIndex** — in-memory indexes across semantic, behavioral, and temporal dimensions
- **RetrievalScorer** — weighted combination: `(alpha * semantic + beta * task_alignment + gamma * temporal) * importance`
- **MemexRetriever** — top-k retrieval with RL-driven importance updates via EMA
- **ContextBuilder** — formats retrieved experiences into structured prompt blocks
- **MemexAgent** — orchestrates the full act/observe loop

## Configuration

All settings are in `MemexConfig`. Configure via constructor, `MemexConfig.from_dict()`, or `MemexConfig.from_env()` using `MEMEX_`-prefixed environment variables.

| Setting | Default | Description |
|---|---|---|
| `embedding_backend` | `"hash"` | `"hash"` (offline/tests) or `"claude"` (voyage-3) |
| `top_k` | `5` | Number of experiences retrieved per query |
| `scorer_alpha` | `0.5` | Semantic similarity weight |
| `scorer_beta` | `0.3` | Task alignment weight |
| `scorer_gamma` | `0.2` | Temporal recency weight |
| `importance_ema_alpha` | `0.1` | EMA learning rate for importance updates |

## Testing

```bash
pytest                          # run all tests
pytest tests/test_scorer.py     # run a single test file
pytest -k "test_name"           # run a specific test
pytest --cov=memex              # run with coverage
```