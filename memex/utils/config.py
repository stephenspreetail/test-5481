from __future__ import annotations

import os
from dataclasses import dataclass, field


@dataclass
class MemexConfig:
    # LLM settings
    claude_model: str = "claude-sonnet-4-6"
    max_tokens: int = 1024

    # Embedding settings
    embedding_backend: str = "hash"   # "hash" or "claude"
    embedding_dim: int = 512          # overridden to 1024 if backend="claude"

    # Retrieval settings
    top_k: int = 5
    scorer_alpha: float = 0.5         # semantic weight
    scorer_beta: float = 0.3          # task-alignment weight
    scorer_gamma: float = 0.2         # temporal weight
    temporal_decay: float = 0.01

    # Agent settings
    max_context_experiences: int = 5
    importance_ema_alpha: float = 0.1

    def __post_init__(self) -> None:
        total = self.scorer_alpha + self.scorer_beta + self.scorer_gamma
        if abs(total - 1.0) > 1e-6:
            raise ValueError(
                f"scorer weights must sum to 1.0, got {total:.4f}"
            )
        if self.embedding_backend == "claude":
            self.embedding_dim = 1024

    @classmethod
    def from_dict(cls, d: dict) -> MemexConfig:
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})

    @classmethod
    def from_env(cls) -> MemexConfig:
        kwargs: dict = {}
        env_map = {
            "MEMEX_CLAUDE_MODEL": ("claude_model", str),
            "MEMEX_MAX_TOKENS": ("max_tokens", int),
            "MEMEX_EMBEDDING_BACKEND": ("embedding_backend", str),
            "MEMEX_TOP_K": ("top_k", int),
            "MEMEX_SCORER_ALPHA": ("scorer_alpha", float),
            "MEMEX_SCORER_BETA": ("scorer_beta", float),
            "MEMEX_SCORER_GAMMA": ("scorer_gamma", float),
            "MEMEX_TEMPORAL_DECAY": ("temporal_decay", float),
            "MEMEX_IMPORTANCE_EMA_ALPHA": ("importance_ema_alpha", float),
        }
        for env_var, (attr, cast) in env_map.items():
            val = os.environ.get(env_var)
            if val is not None:
                kwargs[attr] = cast(val)
        return cls(**kwargs)
