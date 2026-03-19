from __future__ import annotations

import os
from functools import lru_cache
from typing import List, Optional

import numpy as np

from memex.embeddings.base import BaseEmbedder
from memex.embeddings.hash_embedder import HashEmbedder


class ClaudeEmbedder(BaseEmbedder):
    """
    Embedder using Anthropic's voyage-3 model via the anthropic SDK.
    Falls back to HashEmbedder if ANTHROPIC_API_KEY is not available.
    Uses an LRU cache to avoid redundant API calls for identical texts.
    """

    MODEL = "voyage-3"
    DIM = 1024
    _CACHE_SIZE = 512

    def __init__(
        self,
        api_key: Optional[str] = None,
        cache: bool = True,
    ) -> None:
        resolved_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        self._available = bool(resolved_key)
        self._fallback = HashEmbedder(dim=512)

        if self._available:
            import anthropic  # lazy import

            self._client = anthropic.Anthropic(api_key=resolved_key)
            if cache:
                self._embed_cached = lru_cache(maxsize=self._CACHE_SIZE)(
                    self._embed_api
                )
            else:
                self._embed_cached = self._embed_api  # type: ignore[assignment]

    def _embed_api(self, text: str) -> tuple:
        """Call the Anthropic embeddings API. Returns a tuple for LRU caching."""
        response = self._client.embeddings.create(
            model=self.MODEL, input=text
        )
        return tuple(response.embeddings[0].values)

    def embed(self, text: str) -> np.ndarray:
        if not self._available:
            return self._fallback.embed(text)
        vec = np.array(self._embed_cached(text), dtype=np.float32)
        norm = float(np.linalg.norm(vec))
        if norm > 0.0:
            vec /= norm
        return vec

    def embed_batch(self, texts: List[str]) -> List[np.ndarray]:
        return [self.embed(t) for t in texts]

    @property
    def dim(self) -> int:
        if not self._available:
            return self._fallback.dim
        return self.DIM

    @property
    def is_available(self) -> bool:
        return self._available
