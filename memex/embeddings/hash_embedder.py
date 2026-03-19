from __future__ import annotations

import re
import string
from typing import List

import numpy as np

from memex.embeddings.base import BaseEmbedder

# FNV-1a 32-bit constants
_FNV_PRIME = 0x01000193
_FNV_OFFSET = 0x811C9DC5
_MASK32 = 0xFFFFFFFF


def _fnv1a_32(data: bytes) -> int:
    h = _FNV_OFFSET
    for byte in data:
        h ^= byte
        h = (h * _FNV_PRIME) & _MASK32
    return h


def _normalize(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^\w\s]", " ", text)
    return text.strip()


class HashEmbedder(BaseEmbedder):
    """
    Deterministic hash-based embedder using character n-grams (n=2,3,4).
    FNV-1a 32-bit is used instead of Python's built-in hash() to ensure
    reproducibility across processes (PYTHONHASHSEED independence).
    Output vectors are L2-normalized to unit norm.
    """

    def __init__(self, dim: int = 512, seed: int = 42) -> None:
        self._dim = dim
        self._seed = seed

    def embed(self, text: str) -> np.ndarray:
        vec = np.zeros(self._dim, dtype=np.float32)
        normalized = _normalize(text)
        if not normalized:
            return vec

        for n in (2, 3, 4):
            for i in range(len(normalized) - n + 1):
                ngram = normalized[i : i + n]
                # XOR seed into hash for per-instance variation
                h = _fnv1a_32(ngram.encode("utf-8")) ^ self._seed
                bucket = h % self._dim
                vec[bucket] += 1.0

        norm = float(np.linalg.norm(vec))
        if norm > 0.0:
            vec /= norm
        return vec

    def embed_batch(self, texts: List[str]) -> List[np.ndarray]:
        return [self.embed(t) for t in texts]

    @property
    def dim(self) -> int:
        return self._dim
