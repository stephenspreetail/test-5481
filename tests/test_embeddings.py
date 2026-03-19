from __future__ import annotations

import numpy as np
import pytest

from memex.embeddings.hash_embedder import HashEmbedder


def test_output_is_unit_norm(hash_embedder):
    vec = hash_embedder.embed("hello world")
    norm = np.linalg.norm(vec)
    assert abs(norm - 1.0) < 1e-5


def test_deterministic(hash_embedder):
    text = "the quick brown fox"
    vec1 = hash_embedder.embed(text)
    vec2 = hash_embedder.embed(text)
    np.testing.assert_array_equal(vec1, vec2)


def test_different_inputs_different_vectors(hash_embedder):
    v1 = hash_embedder.embed("apple")
    v2 = hash_embedder.embed("orange")
    assert not np.allclose(v1, v2)


def test_dim_property_matches_constructor():
    emb = HashEmbedder(dim=128)
    assert emb.dim == 128
    vec = emb.embed("test")
    assert vec.shape == (128,)


def test_embed_batch_matches_sequential(hash_embedder):
    texts = ["one", "two", "three"]
    batch = hash_embedder.embed_batch(texts)
    sequential = [hash_embedder.embed(t) for t in texts]
    for b, s in zip(batch, sequential):
        np.testing.assert_array_equal(b, s)


def test_empty_string_returns_zero_vector(hash_embedder):
    vec = hash_embedder.embed("")
    assert vec.shape == (hash_embedder.dim,)
    # Zero vector (no norm to normalize)
    assert np.all(vec == 0.0)


@pytest.mark.integration
def test_claude_embedder_live():
    """Requires ANTHROPIC_API_KEY to be set."""
    import os
    if not os.environ.get("ANTHROPIC_API_KEY"):
        pytest.skip("ANTHROPIC_API_KEY not set")
    from memex.embeddings.claude_embedder import ClaudeEmbedder
    emb = ClaudeEmbedder()
    assert emb.is_available
    vec = emb.embed("hello world")
    assert vec.shape == (ClaudeEmbedder.DIM,)
    norm = np.linalg.norm(vec)
    assert abs(norm - 1.0) < 1e-5
