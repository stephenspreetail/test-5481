from __future__ import annotations

import pytest

from memex.core.experience import Experience, TrajectorySegment


def test_to_dict_from_dict_roundtrip(sample_experience):
    d = sample_experience.to_dict()
    restored = Experience.from_dict(d)
    assert restored.id == sample_experience.id
    assert restored.state == sample_experience.state
    assert restored.action == sample_experience.action
    assert restored.reward == pytest.approx(sample_experience.reward)
    assert restored.outcome == sample_experience.outcome
    assert restored.task_context == sample_experience.task_context
    assert restored.timestamp == pytest.approx(sample_experience.timestamp)
    assert restored.importance == pytest.approx(sample_experience.importance)


def test_to_context_snippet_contains_all_fields(sample_experience):
    snippet = sample_experience.to_context_snippet()
    assert "State:" in snippet
    assert "Action:" in snippet
    assert "Outcome:" in snippet
    assert "Reward:" in snippet


def test_default_importance_is_one():
    exp = Experience(
        state="s", action="a", reward=0.0,
        outcome="o", task_context="t", timestamp=0.0
    )
    assert exp.importance == 1.0


def test_uuid_unique_across_instances():
    exp1 = Experience(state="s", action="a", reward=0.0, outcome="o", task_context="t", timestamp=0.0)
    exp2 = Experience(state="s", action="a", reward=0.0, outcome="o", task_context="t", timestamp=0.0)
    assert exp1.id != exp2.id


def test_to_context_snippet_truncation():
    long_text = "x" * 2000
    exp = Experience(state=long_text, action="a", reward=0.0, outcome="o", task_context="t", timestamp=0.0)
    snippet = exp.to_context_snippet(max_chars=100)
    assert len(snippet) <= 120  # small buffer for "..." suffix


def test_trajectory_segment_summarize(sample_experience):
    seg = TrajectorySegment(
        experiences=[sample_experience],
        task_id="task-1",
        total_reward=0.75,
    )
    summary = seg.summarize()
    assert "task-1" in summary
    assert "move_north" in summary
