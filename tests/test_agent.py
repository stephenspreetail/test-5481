from __future__ import annotations

import pytest

from memex.agent.memex_agent import MemexAgent
from memex.utils.config import MemexConfig


@pytest.fixture
def agent(mock_anthropic_client):
    config = MemexConfig(embedding_backend="hash", top_k=3)
    return MemexAgent(config=config, db_path=":memory:")


def test_act_returns_valid_action(agent):
    actions = ["move_north", "move_south", "move_east"]
    result = agent.act("at position (0,0)", "reach the goal", actions)
    assert result in actions


def test_observe_increases_db_count(agent):
    assert agent._db.count() == 0
    agent.observe("s", "move_north", 0.5, "moved", "task")
    assert agent._db.count() == 1


def test_observe_then_act_retrieves_experience(agent):
    # Store a relevant experience
    agent.observe("the map is dark", "use_torch", 1.0, "light appeared", "explore")

    actions = ["use_torch", "move_north", "wait"]
    result = agent.act("the map is dark", "explore", actions)
    assert result in actions


def test_reset_clears_episode_state_not_db(agent):
    agent.observe("s", "a", 0.8, "o", "t")
    agent._last_retrieved_ids = ["fake-id"]
    agent.reset()
    assert agent._last_retrieved_ids == []
    assert agent._db.count() == 1  # DB preserved


def test_action_parsing_falls_back_to_first(agent, mocker):
    # Make Claude return garbage
    agent._client = mocker.MagicMock()
    agent._client.messages.create.return_value.content = [
        mocker.MagicMock(text="I cannot decide what to do here!!!")
    ]
    actions = ["move_north", "move_south"]
    result = agent.act("state", "task", actions)
    assert result == "move_north"


def test_end_to_end_three_cycles(agent):
    actions = ["move_north", "move_south", "move_east"]
    for i in range(3):
        action = agent.act(f"state_{i}", "navigate to exit", actions)
        assert action in actions
        agent.observe(f"state_{i}", action, float(i) * 0.3, f"outcome_{i}", "navigate to exit")
    assert agent._db.count() == 3
