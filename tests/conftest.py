from __future__ import annotations

import time

import pytest

from memex.core.database import ExperienceDatabase
from memex.core.experience import Experience
from memex.embeddings.hash_embedder import HashEmbedder


@pytest.fixture
def in_memory_db():
    db = ExperienceDatabase(":memory:")
    yield db
    db.close()


@pytest.fixture
def hash_embedder():
    return HashEmbedder(dim=64)


@pytest.fixture
def sample_experience():
    return Experience(
        state="The agent is at position (3, 4)",
        action="move_north",
        reward=0.75,
        outcome="Moved to position (3, 5). Found a key.",
        task_context="Navigate to the exit",
        timestamp=1_700_000_000.0,
        importance=1.0,
    )


@pytest.fixture
def mock_anthropic_client(mocker):
    mock_client = mocker.MagicMock()
    mock_response = mocker.MagicMock()
    mock_response.content = [mocker.MagicMock(text="move_north")]
    mock_client.messages.create.return_value = mock_response
    mocker.patch("anthropic.Anthropic", return_value=mock_client)
    return mock_client
