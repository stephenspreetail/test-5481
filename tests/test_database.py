from __future__ import annotations

import numpy as np
import pytest

from memex.core.database import ExperienceDatabase
from memex.core.experience import Experience


def test_insert_and_retrieve(in_memory_db, sample_experience):
    in_memory_db.insert_experience(sample_experience)
    retrieved = in_memory_db.get_experience(sample_experience.id)
    assert retrieved is not None
    assert retrieved.id == sample_experience.id
    assert retrieved.state == sample_experience.state
    assert retrieved.reward == pytest.approx(sample_experience.reward)


def test_embedding_blob_roundtrip(in_memory_db, sample_experience):
    vec = np.array([0.1, 0.2, 0.3, 0.4], dtype=np.float32)
    sample_experience.semantic_embedding = vec
    in_memory_db.insert_experience(sample_experience)
    retrieved = in_memory_db.get_experience(sample_experience.id)
    assert retrieved.semantic_embedding is not None
    np.testing.assert_array_almost_equal(retrieved.semantic_embedding, vec)


def test_update_importance(in_memory_db, sample_experience):
    in_memory_db.insert_experience(sample_experience)
    in_memory_db.update_importance(sample_experience.id, 0.42)
    retrieved = in_memory_db.get_experience(sample_experience.id)
    assert retrieved.importance == pytest.approx(0.42)


def test_count(in_memory_db, sample_experience):
    assert in_memory_db.count() == 0
    in_memory_db.insert_experience(sample_experience)
    assert in_memory_db.count() == 1


def test_delete_experience(in_memory_db, sample_experience):
    in_memory_db.insert_experience(sample_experience)
    in_memory_db.delete_experience(sample_experience.id)
    assert in_memory_db.get_experience(sample_experience.id) is None
    assert in_memory_db.count() == 0


def test_get_experiences_by_task(in_memory_db):
    exp1 = Experience(state="s1", action="a", reward=0.0, outcome="o", task_context="task-A", timestamp=1.0)
    exp2 = Experience(state="s2", action="b", reward=0.0, outcome="o", task_context="task-B", timestamp=2.0)
    exp3 = Experience(state="s3", action="c", reward=0.0, outcome="o", task_context="task-A", timestamp=3.0)
    for e in (exp1, exp2, exp3):
        in_memory_db.insert_experience(e)

    results = in_memory_db.get_experiences_by_task("task-A")
    ids = {r.id for r in results}
    assert exp1.id in ids
    assert exp3.id in ids
    assert exp2.id not in ids


def test_schema_initialization_idempotent(in_memory_db):
    # Should not raise
    in_memory_db.initialize_schema()
    in_memory_db.initialize_schema()


def test_get_all_experiences(in_memory_db):
    exps = [
        Experience(state=f"s{i}", action="a", reward=float(i),
                   outcome="o", task_context="t", timestamp=float(i))
        for i in range(3)
    ]
    for e in exps:
        in_memory_db.insert_experience(e)
    all_exps = in_memory_db.get_all_experiences()
    assert len(all_exps) == 3


def test_none_embedding_stored_as_null(in_memory_db, sample_experience):
    sample_experience.semantic_embedding = None
    in_memory_db.insert_experience(sample_experience)
    retrieved = in_memory_db.get_experience(sample_experience.id)
    assert retrieved.semantic_embedding is None
