# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Memex(RL) is an indexed experience memory system for LLM agents. It stores, indexes, and retrieves past experiences (state/action/reward/outcome tuples) to augment an agent's decision-making via retrieval-augmented context injection into Claude API calls.

## Commands

```bash
# Install (editable with dev dependencies)
pip install -e ".[dev]"

# Run all tests
pytest

# Run a single test file
pytest tests/test_retriever.py

# Run a single test by name
pytest tests/test_retriever.py -k "test_name"

# Run with coverage
pytest --cov=memex
```

## Architecture

The system follows a pipeline: **Experience → Index → Retrieve → Score → Build Context → Claude API call**.

### Core (`memex/core/`)
- **`experience.py`** — `Experience` dataclass (state, action, reward, outcome, task_context, timestamp, importance, embeddings) and `TrajectorySegment` for grouping experiences. Importance is updated via RL feedback.
- **`database.py`** — `ExperienceDatabase` wraps SQLite with custom binary serialization for numpy embedding vectors (length-prefixed JSON metadata + raw bytes).
- **`index.py`** — `MultiDimensionalIndex` maintains three in-memory indexes over experiences: semantic (state+action+outcome embedding), behavioral (action embedding), and temporal (sorted timestamps). The DB is source of truth; index rebuilds from DB on startup.

### Embeddings (`memex/embeddings/`)
- **`base.py`** — `BaseEmbedder` ABC with `embed()`, `embed_batch()`, `dim` property.
- **`hash_embedder.py`** — Deterministic FNV-1a hash-based embedder using character n-grams. No API calls needed. Default backend.
- **`claude_embedder.py`** — Uses Anthropic's `voyage-3` model (1024-dim). Falls back to `HashEmbedder` if no API key. Has LRU cache.

### Retrieval (`memex/retrieval/`)
- **`scorer.py`** — `RetrievalScorer` computes: `(alpha * semantic_sim + beta * task_alignment + gamma * temporal_weight) * importance`. Weights must sum to 1.0.
- **`retriever.py`** — `MemexRetriever` scores all experiences against a query, returns top-k. Also handles importance EMA updates from reward signals.

### Agent (`memex/agent/`)
- **`memex_agent.py`** — `MemexAgent` is the main entry point. Wires together all components. Public API: `act(state, task_context, available_actions)` → action string, `observe(state, action, reward, outcome, task_context)` → stores experience. Uses lazy Anthropic client initialization.
- **`context_builder.py`** — Formats retrieved experiences into a structured prompt block for the system message.

### Config (`memex/utils/config.py`)
`MemexConfig` dataclass with defaults. Configurable via constructor, `from_dict()`, or `from_env()` (env vars prefixed `MEMEX_`). Key settings: `embedding_backend` ("hash" or "claude"), scorer weights (alpha/beta/gamma), `top_k`, `importance_ema_alpha`.

## Key Design Decisions

- **Embedding backend is swappable**: `HashEmbedder` for tests/offline, `ClaudeEmbedder` for production. Tests use `HashEmbedder(dim=64)`.
- **SQLite for persistence**: In-memory (`:memory:`) for tests, file-based for production.
- **Importance as multiplicative weight**: Zero-importance memories never surface regardless of other scores.
- **Tests mock the Anthropic client** via `pytest-mock` (see `conftest.py::mock_anthropic_client` fixture).
