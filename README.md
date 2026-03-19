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
Experience -> MultiDimensionalIndex -> MemexRetriever -> ContextBuilder -> Claude API
                (semantic, behavioral, temporal)              |
                                                        RetrievalScorer
```

### Pipeline: Experience -> Index -> Retrieve -> Score -> Build Context -> Claude API call

- **Experience** — dataclass holding state/action/reward/outcome with importance scoring. Importance is updated via RL feedback.
- **ExperienceDatabase** — SQLite persistence with custom binary serialization for numpy embedding vectors (length-prefixed JSON metadata + raw bytes). Uses `:memory:` for tests, file-based for production.
- **MultiDimensionalIndex** — in-memory indexes across semantic (state+action+outcome embedding), behavioral (action embedding), and temporal (sorted timestamps) dimensions. Rebuilds from DB on startup.
- **RetrievalScorer** — weighted combination: `(alpha * semantic + beta * task_alignment + gamma * temporal) * importance`
- **MemexRetriever** — top-k retrieval with RL-driven importance updates via EMA
- **ContextBuilder** — formats retrieved experiences into structured prompt blocks for the system message
- **MemexAgent** — orchestrates the full act/observe loop with lazy Anthropic client initialization

### Embedding Backends

| Backend | Module | Description |
|---|---|---|
| `hash` | `HashEmbedder` | Deterministic FNV-1a hash-based embedder using character n-grams. No API calls needed. Default. |
| `claude` | `ClaudeEmbedder` | Uses Anthropic's `voyage-3` model (1024-dim). Falls back to `HashEmbedder` if no API key. Has LRU cache. |

## Project Structure

```
memex/
  core/
    experience.py      # Experience dataclass, TrajectorySegment
    database.py        # SQLite persistence with binary embedding serialization
    index.py           # Multi-dimensional in-memory indexes
  embeddings/
    base.py            # BaseEmbedder ABC
    hash_embedder.py   # FNV-1a hash embedder (default)
    claude_embedder.py # Voyage-3 embedder via Anthropic API
  retrieval/
    scorer.py          # Weighted retrieval scoring
    retriever.py       # Top-k retrieval and importance updates
  agent/
    memex_agent.py     # Main entry point: act() and observe()
    context_builder.py # Formats experiences into prompt blocks
  utils/
    config.py          # MemexConfig dataclass
    logging.py         # Logging utilities
```

## Configuration

All settings are in `MemexConfig`. Configure via constructor, `MemexConfig.from_dict()`, or `MemexConfig.from_env()` using `MEMEX_`-prefixed environment variables.

| Setting | Default | Description |
|---|---|---|
| `claude_model` | `"claude-sonnet-4-6"` | Claude model used for action selection |
| `max_tokens` | `1024` | Max tokens for Claude API responses |
| `embedding_backend` | `"hash"` | `"hash"` (offline/tests) or `"claude"` (voyage-3) |
| `embedding_dim` | `512` | Embedding dimensions (auto-set to 1024 for `"claude"` backend) |
| `top_k` | `5` | Number of experiences retrieved per query |
| `max_context_experiences` | `5` | Max experiences injected into prompt context |
| `scorer_alpha` | `0.5` | Semantic similarity weight |
| `scorer_beta` | `0.3` | Task alignment weight |
| `scorer_gamma` | `0.2` | Temporal recency weight |
| `temporal_decay` | `0.01` | Temporal decay rate for recency scoring |
| `importance_ema_alpha` | `0.1` | EMA learning rate for importance updates |

Scorer weights (`alpha`, `beta`, `gamma`) must sum to 1.0.

## Testing

```bash
pytest                          # run all tests
pytest tests/test_scorer.py     # run a single test file
pytest -k "test_name"           # run a specific test
pytest --cov=memex              # run with coverage
```

Tests use `HashEmbedder(dim=64)` and in-memory SQLite. The Anthropic client is mocked via `pytest-mock` (see `conftest.py`).
