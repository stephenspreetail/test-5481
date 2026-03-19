from __future__ import annotations

import time
from typing import List, Optional, Tuple

import numpy as np

from memex.core.database import ExperienceDatabase
from memex.core.experience import Experience
from memex.core.index import MultiDimensionalIndex
from memex.embeddings.base import BaseEmbedder
from memex.retrieval.scorer import RetrievalScorer
from memex.utils.logging import get_logger

logger = get_logger(__name__)


class MemexRetriever:
    def __init__(
        self,
        index: MultiDimensionalIndex,
        scorer: RetrievalScorer,
        embedder: BaseEmbedder,
        db: ExperienceDatabase,
        top_k: int = 5,
    ) -> None:
        self._index = index
        self._scorer = scorer
        self._embedder = embedder
        self._db = db
        self._top_k = top_k

    def retrieve(
        self, query: Experience
    ) -> List[Tuple[Experience, float]]:
        """Return top-k (experience, score) pairs sorted by score descending."""
        all_ids = self._index.all_exp_ids()
        if not all_ids:
            return []

        # Build query vectors
        query_sem_text = f"{query.state} {query.action} {query.outcome}"
        query_sem_vec = self._embedder.embed(query_sem_text)
        query_beh_vec = self._embedder.embed(query.action)

        scored: List[Tuple[float, str]] = []
        for exp_id in all_ids:
            cand_sem_vec = self._index.get_semantic_vector(exp_id)
            cand_beh_vec = self._index.get_behavioral_vector(exp_id)
            if cand_sem_vec is None or cand_beh_vec is None:
                continue

            cand_exp = self._db.get_experience(exp_id)
            if cand_exp is None:
                continue

            s = self._scorer.score(
                query, cand_exp,
                query_sem_vec, cand_sem_vec,
                query_beh_vec, cand_beh_vec,
            )
            scored.append((s, exp_id))

        scored.sort(key=lambda x: x[0], reverse=True)
        top = scored[: self._top_k]

        results: List[Tuple[Experience, float]] = []
        for s, exp_id in top:
            exp = self._db.get_experience(exp_id)
            if exp is not None:
                results.append((exp, s))

        logger.debug("Retrieved %d experiences (top_k=%d)", len(results), self._top_k)
        return results

    def retrieve_for_context(self, query: Experience) -> List[Experience]:
        """Convenience wrapper — returns Experience objects only."""
        return [exp for exp, _ in self.retrieve(query)]

    def update_importance_from_reward(
        self,
        exp_id: str,
        reward: float,
        ema_alpha: float = 0.1,
    ) -> None:
        """
        Exponential moving average update:
            new_importance = old * (1 - alpha) + clip(reward, 0, 1) * alpha
        """
        exp = self._db.get_experience(exp_id)
        if exp is None:
            return
        reward_norm = float(np.clip(reward, 0.0, 1.0))
        new_importance = exp.importance * (1.0 - ema_alpha) + reward_norm * ema_alpha
        self._db.update_importance(exp_id, new_importance)
