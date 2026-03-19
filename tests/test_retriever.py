from __future__ import annotations

import pytest

from memex.core.experience import Experience
from memex.core.index import MultiDimensionalIndex
from memex.retrieval.retriever import MemexRetriever
from memex.retrieval.scorer import RetrievalScorer


@pytest.fixture
def retriever(in_memory_db, hash_embedder):
    index = MultiDimensionalIndex(in_memory_db, hash_embedder)
    scorer = RetrievalScorer()
    return MemexRetriever(index=index, scorer=scorer, embedder=hash_embedder,
                          db=in_memory_db, top_k=3)


def _make_exp(state, action, task="t", ts=1_700_000_000.0, importance=1.0):
    return Experience(state=state, action=action, reward=0.5,
                      outcome="ok", task_context=task, timestamp=ts,
                      importance=importance)


def test_returns_at_most_top_k(retriever):
    for i in range(10):
        exp = _make_exp(f"state {i}", f"action {i}")
        retriever._index.add(exp)

    query = _make_exp("some state", "some action")
    results = retriever.retrieve(query)
    assert len(results) <= 3


def test_results_sorted_descending(retriever):
    for i in range(5):
        exp = _make_exp(f"state {i}", f"action {i}")
        retriever._index.add(exp)

    query = _make_exp("state 0", "action 0")
    results = retriever.retrieve(query)
    scores = [s for _, s in results]
    assert scores == sorted(scores, reverse=True)


def test_high_importance_ranks_above_low(retriever):
    hi = _make_exp("same state", "same action", importance=5.0)
    lo = _make_exp("same state", "same action", importance=0.1)
    retriever._index.add(hi)
    retriever._index.add(lo)

    query = _make_exp("same state", "same action")
    results = retriever.retrieve(query)
    top_exp = results[0][0]
    assert top_exp.id == hi.id


def test_retrieve_for_context_returns_experiences(retriever):
    exp = _make_exp("explore the map", "move north")
    retriever._index.add(exp)
    query = _make_exp("explore the map", "move north")
    results = retriever.retrieve_for_context(query)
    assert all(isinstance(e, Experience) for e in results)


def test_empty_index_returns_empty_list(retriever):
    query = _make_exp("state", "action")
    assert retriever.retrieve(query) == []


def test_importance_update_from_reward(retriever):
    exp = _make_exp("s", "a")
    retriever._index.add(exp)
    original = retriever._db.get_experience(exp.id).importance

    retriever.update_importance_from_reward(exp.id, reward=1.0, ema_alpha=0.1)
    updated = retriever._db.get_experience(exp.id).importance
    # new = old * 0.9 + 1.0 * 0.1 = 1.0 * 0.9 + 0.1 = 1.0 (no change for reward=1)
    assert updated == pytest.approx(original * 0.9 + 1.0 * 0.1)
