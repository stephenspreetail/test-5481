from __future__ import annotations

import bisect
from typing import Dict, List, Optional, Tuple

import numpy as np

from memex.core.database import ExperienceDatabase
from memex.core.experience import Experience
from memex.embeddings.base import BaseEmbedder
from memex.utils.logging import get_logger

logger = get_logger(__name__)


class MultiDimensionalIndex:
    """
    In-memory index over three dimensions:
      - semantic_index:    exp_id → semantic embedding (from state+action+outcome)
      - behavioral_index:  exp_id → behavioral embedding (from action only)
      - temporal_index:    sorted list of (timestamp, exp_id)

    The database is the source of truth; this index is the hot retrieval path.
    Rebuild from DB on startup via rebuild_from_db().
    """

    def __init__(self, db: ExperienceDatabase, embedder: BaseEmbedder) -> None:
        self._db = db
        self._embedder = embedder
        self._semantic: Dict[str, np.ndarray] = {}
        self._behavioral: Dict[str, np.ndarray] = {}
        self._temporal: List[Tuple[float, str]] = []  # sorted by timestamp

    # ------------------------------------------------------------------
    # Index management
    # ------------------------------------------------------------------

    def add(self, exp: Experience) -> None:
        sem_text = f"{exp.state} {exp.action} {exp.outcome}"
        sem_vec = self._embedder.embed(sem_text)
        beh_vec = self._compute_behavioral_vector(exp.action)

        exp.semantic_embedding = sem_vec
        exp.behavioral_embedding = beh_vec

        self._semantic[exp.id] = sem_vec
        self._behavioral[exp.id] = beh_vec
        bisect.insort(self._temporal, (exp.timestamp, exp.id))

        self._db.insert_experience(exp)
        logger.debug("Indexed experience %s", exp.id)

    def remove(self, exp_id: str) -> None:
        self._semantic.pop(exp_id, None)
        self._behavioral.pop(exp_id, None)
        self._temporal = [(ts, eid) for ts, eid in self._temporal if eid != exp_id]
        self._db.delete_experience(exp_id)
        logger.debug("Removed experience %s", exp_id)

    def rebuild_from_db(self) -> None:
        self._semantic.clear()
        self._behavioral.clear()
        self._temporal.clear()

        for exp in self._db.get_all_experiences():
            if exp.semantic_embedding is not None:
                self._semantic[exp.id] = exp.semantic_embedding
            else:
                sem_text = f"{exp.state} {exp.action} {exp.outcome}"
                self._semantic[exp.id] = self._embedder.embed(sem_text)

            if exp.behavioral_embedding is not None:
                self._behavioral[exp.id] = exp.behavioral_embedding
            else:
                self._behavioral[exp.id] = self._compute_behavioral_vector(exp.action)

            bisect.insort(self._temporal, (exp.timestamp, exp.id))

        logger.info("Rebuilt index from DB: %d experiences", len(self._semantic))

    # ------------------------------------------------------------------
    # Accessors
    # ------------------------------------------------------------------

    def get_semantic_vector(self, exp_id: str) -> Optional[np.ndarray]:
        return self._semantic.get(exp_id)

    def get_behavioral_vector(self, exp_id: str) -> Optional[np.ndarray]:
        return self._behavioral.get(exp_id)

    def get_temporal_position(self, exp_id: str) -> Optional[float]:
        for ts, eid in self._temporal:
            if eid == exp_id:
                return ts
        return None

    def all_exp_ids(self) -> List[str]:
        return list(self._semantic.keys())

    def __len__(self) -> int:
        return len(self._semantic)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _compute_behavioral_vector(self, action: str) -> np.ndarray:
        """
        Deterministic hash-based action fingerprint.
        Uses the same embedder so dimensions are consistent.
        """
        return self._embedder.embed(action)
