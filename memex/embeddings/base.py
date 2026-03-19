from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List

import numpy as np


class BaseEmbedder(ABC):
    @abstractmethod
    def embed(self, text: str) -> np.ndarray:
        """Return a unit-norm float32 numpy vector."""

    @abstractmethod
    def embed_batch(self, texts: List[str]) -> List[np.ndarray]:
        """Embed multiple texts; default implementation calls embed() sequentially."""

    @property
    @abstractmethod
    def dim(self) -> int:
        """Dimensionality of the embedding vectors."""
