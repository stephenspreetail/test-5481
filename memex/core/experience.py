from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Optional

import numpy as np


@dataclass
class Experience:
    state: str
    action: str
    reward: float
    outcome: str
    task_context: str
    timestamp: float
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    importance: float = 1.0
    semantic_embedding: Optional[np.ndarray] = field(default=None, repr=False)
    behavioral_embedding: Optional[np.ndarray] = field(default=None, repr=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "state": self.state,
            "action": self.action,
            "reward": self.reward,
            "outcome": self.outcome,
            "task_context": self.task_context,
            "timestamp": self.timestamp,
            "importance": self.importance,
            # embeddings excluded — serialized separately by DB layer
        }

    @classmethod
    def from_dict(cls, d: dict) -> Experience:
        return cls(
            id=d["id"],
            state=d["state"],
            action=d["action"],
            reward=float(d["reward"]),
            outcome=d["outcome"],
            task_context=d["task_context"],
            timestamp=float(d["timestamp"]),
            importance=float(d.get("importance", 1.0)),
        )

    def to_context_snippet(self, max_chars: int = 800) -> str:
        snippet = (
            f"State: {self.state}\n"
            f"Action: {self.action}\n"
            f"Outcome: {self.outcome}\n"
            f"Reward: {self.reward:.3f}"
        )
        if len(snippet) > max_chars:
            snippet = snippet[:max_chars] + "..."
        return snippet


@dataclass
class TrajectorySegment:
    experiences: list
    task_id: str
    total_reward: float

    def summarize(self) -> str:
        lines = [f"Task: {self.task_id} | Total reward: {self.total_reward:.3f}"]
        for i, exp in enumerate(self.experiences, 1):
            lines.append(f"  Step {i}: action={exp.action!r} reward={exp.reward:.3f}")
        return "\n".join(lines)
