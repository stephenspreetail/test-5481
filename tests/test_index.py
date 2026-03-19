from __future__ import annotations

import time

import pytest

from memex.core.experience import Experience
from memex.core.index import MultiDimensionalIndex


@pytest.fixture
def index(in_memory_db, hash_embedder):
    return MultiDimensionalIndex(in_memory_db, hash_embedder)


def test_add_then_get_semantic_vector(index, sample_experience):
    index.add(sample_experience)
    vec = index.get_semantic_vector(sample_experience.id)
    assert vec is not None
    assert vec.shape == (index._embedder.dim,)


def test_remove_clears_from_index(index, sample_experience):
    index.add(sample_experience)
    index.remove(sample_experience.id)
    assert index.get_semantic_vector(sample_experience.id) is None
    assert index.get_behavioral_vector(sample_experience.id) is None


def test_rebuild_from_db_restores_index(in_memory_db, hash_embedder, sample_experience):
    idx1 = MultiDimensionalIndex(in_memory_db, hash_embedder)
    idx1.add(sample_experience)

    # Create a fresh index from same DB
    idx2 = MultiDimensionalIndex(in_memory_db, hash_embedder)
    idx2.rebuild_from_db()

    import numpy as np
    v1 = idx1.get_semantic_vector(sample_experience.id)
    v2 = idx2.get_semantic_vector(sample_experience.id)
    assert v1 is not None and v2 is not None
    np.testing.assert_array_almost_equal(v1, v2)


def test_temporal_index_preserves_order(index):
    exps = [
        Experience(state="s", action="a", reward=0.0, outcome="o",
                   task_context="t", timestamp=float(ts))
        for ts in [1000, 3000, 2000]
    ]
    for e in exps:
        index.add(e)

    timestamps = [ts for ts, _ in index._temporal]
    assert timestamps == sorted(timestamps)


def test_len_reflects_added_experiences(index):
    assert len(index) == 0
    e1 = Experience(state="s", action="a", reward=0.0, outcome="o", task_context="t", timestamp=1.0)
    e2 = Experience(state="s", action="b", reward=0.0, outcome="o", task_context="t", timestamp=2.0)
    index.add(e1)
    index.add(e2)
    assert len(index) == 2
