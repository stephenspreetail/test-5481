from __future__ import annotations

import math

import numpy as np
import pytest

from memex.retrieval.scorer import RetrievalScorer


@pytest.fixture
def scorer():
    return RetrievalScorer(alpha=0.5, beta=0.3, gamma=0.2, temporal_decay=0.01)


def test_identical_vectors_semantic_sim_is_one(scorer):
    v = np.array([1.0, 0.0, 0.0], dtype=np.float32)
    assert scorer.semantic_similarity(v, v) == pytest.approx(1.0)


def test_orthogonal_vectors_semantic_sim_is_zero(scorer):
    a = np.array([1.0, 0.0], dtype=np.float32)
    b = np.array([0.0, 1.0], dtype=np.float32)
    assert scorer.semantic_similarity(a, b) == pytest.approx(0.0)


def test_zero_vector_semantic_sim_is_zero(scorer):
    zero = np.zeros(3, dtype=np.float32)
    v = np.array([1.0, 0.0, 0.0], dtype=np.float32)
    assert scorer.semantic_similarity(zero, v) == pytest.approx(0.0)
    assert scorer.semantic_similarity(v, zero) == pytest.approx(0.0)


def test_exact_task_match_raises_alignment(scorer):
    v = np.array([1.0, 0.0], dtype=np.float32)
    match = scorer.task_alignment("navigate", "navigate", v, v)
    no_match = scorer.task_alignment("navigate", "cook", v, v)
    assert match > no_match


def test_recent_temporal_weight_higher(scorer):
    now = 1_700_000_000.0
    w_recent = scorer.temporal_weight(now, now - 60)      # 1 minute ago
    w_old = scorer.temporal_weight(now, now - 36000)      # 10 hours ago
    assert w_recent > w_old


def test_temporal_weight_same_time_is_one(scorer):
    ts = 1_700_000_000.0
    assert scorer.temporal_weight(ts, ts) == pytest.approx(1.0)


def test_weights_must_sum_to_one():
    with pytest.raises(ValueError):
        RetrievalScorer(alpha=0.5, beta=0.4, gamma=0.2)


def test_score_multiplies_by_importance(scorer, sample_experience):
    from memex.core.experience import Experience
    import numpy as np

    query = Experience(state="s", action="a", reward=0.0, outcome="o",
                       task_context="t", timestamp=1_700_000_000.0)
    cand_hi = Experience(state="s", action="a", reward=0.0, outcome="o",
                         task_context="t", timestamp=1_700_000_000.0, importance=2.0)
    cand_lo = Experience(state="s", action="a", reward=0.0, outcome="o",
                         task_context="t", timestamp=1_700_000_000.0, importance=0.5)

    v = np.array([1.0, 0.0], dtype=np.float32)
    s_hi = scorer.score(query, cand_hi, v, v, v, v)
    s_lo = scorer.score(query, cand_lo, v, v, v, v)
    assert s_hi > s_lo
