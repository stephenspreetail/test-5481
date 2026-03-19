from __future__ import annotations

import math

import numpy as np

from memex.core.experience import Experience


class RetrievalScorer:
    """
    Implements the combined scoring function from Memex(RL):

        score(q, e) = (alpha * semantic_sim
                     + beta  * task_alignment
                     + gamma * temporal_weight)
                     * e.importance

    All sub-scores are in [0, 1]. alpha + beta + gamma must equal 1.0.
    Importance as a multiplicative weight means zero-importance memories
    can never surface regardless of other scores.
    """

    def __init__(
        self,
        alpha: float = 0.5,
        beta: float = 0.3,
        gamma: float = 0.2,
        temporal_decay: float = 0.01,
    ) -> None:
        total = alpha + beta + gamma
        if abs(total - 1.0) > 1e-6:
            raise ValueError(f"alpha+beta+gamma must equal 1.0, got {total:.4f}")
        self.alpha = alpha
        self.beta = beta
        self.gamma = gamma
        self.temporal_decay = temporal_decay

    def score(
        self,
        query: Experience,
        candidate: Experience,
        query_sem_vec: np.ndarray,
        candidate_sem_vec: np.ndarray,
        query_beh_vec: np.ndarray,
        candidate_beh_vec: np.ndarray,
    ) -> float:
        s_sem = self.semantic_similarity(query_sem_vec, candidate_sem_vec)
        s_task = self.task_alignment(
            query.task_context,
            candidate.task_context,
            query_beh_vec,
            candidate_beh_vec,
        )
        s_temp = self.temporal_weight(query.timestamp, candidate.timestamp)
        base = self.alpha * s_sem + self.beta * s_task + self.gamma * s_temp
        return base * candidate.importance

    def semantic_similarity(self, a: np.ndarray, b: np.ndarray) -> float:
        return float(np.clip(self.cosine_similarity(a, b), 0.0, 1.0))

    def task_alignment(
        self,
        query_task: str,
        candidate_task: str,
        query_beh_vec: np.ndarray,
        candidate_beh_vec: np.ndarray,
    ) -> float:
        exact_match = 1.0 if query_task == candidate_task else 0.0
        beh_sim = float(np.clip(self.cosine_similarity(query_beh_vec, candidate_beh_vec), 0.0, 1.0))
        return 0.5 * exact_match + 0.5 * beh_sim

    def temporal_weight(self, query_ts: float, candidate_ts: float) -> float:
        delta_hours = abs(query_ts - candidate_ts) / 3600.0
        return math.exp(-self.temporal_decay * delta_hours)

    @staticmethod
    def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
        norm_a = float(np.linalg.norm(a))
        norm_b = float(np.linalg.norm(b))
        if norm_a == 0.0 or norm_b == 0.0:
            return 0.0
        return float(np.dot(a, b) / (norm_a * norm_b))
