from __future__ import annotations

import time
from typing import List, Optional

from memex.agent.context_builder import ContextBuilder
from memex.core.database import ExperienceDatabase
from memex.core.experience import Experience
from memex.core.index import MultiDimensionalIndex
from memex.embeddings.hash_embedder import HashEmbedder
from memex.embeddings.claude_embedder import ClaudeEmbedder
from memex.retrieval.retriever import MemexRetriever
from memex.retrieval.scorer import RetrievalScorer
from memex.utils.config import MemexConfig
from memex.utils.logging import get_logger

logger = get_logger(__name__)

_BASE_SYSTEM_PROMPT = (
    "You are a helpful agent. Based on the task context and any relevant past "
    "experiences provided, choose the best action from the available options. "
    "Respond with ONLY the exact action string from the list — no explanation."
)


class MemexAgent:
    """
    Ties together all Memex(RL) components.

    Usage:
        agent = MemexAgent(config)
        action = agent.act(state, task_context, available_actions)
        # ... execute action in environment, observe reward/outcome ...
        agent.observe(state, action, reward, outcome, task_context)
    """

    def __init__(
        self,
        config: Optional[MemexConfig] = None,
        db_path: str = "memex.db",
        anthropic_api_key: Optional[str] = None,
    ) -> None:
        self._config = config or MemexConfig()
        self._db = ExperienceDatabase(db_path)

        # Embedder
        if self._config.embedding_backend == "claude":
            self._embedder = ClaudeEmbedder(api_key=anthropic_api_key)
        else:
            self._embedder = HashEmbedder(dim=self._config.embedding_dim)

        # Index
        self._index = MultiDimensionalIndex(self._db, self._embedder)
        self._index.rebuild_from_db()

        # Retrieval
        self._scorer = RetrievalScorer(
            alpha=self._config.scorer_alpha,
            beta=self._config.scorer_beta,
            gamma=self._config.scorer_gamma,
            temporal_decay=self._config.temporal_decay,
        )
        self._retriever = MemexRetriever(
            index=self._index,
            scorer=self._scorer,
            embedder=self._embedder,
            db=self._db,
            top_k=self._config.top_k,
        )

        # Context builder
        self._context_builder = ContextBuilder(
            max_experiences=self._config.max_context_experiences
        )

        # Anthropic client (lazy import)
        self._api_key = anthropic_api_key
        self._client = None

        # Episode state: track recently retrieved exp IDs for importance update
        self._last_retrieved_ids: List[str] = []

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def act(
        self,
        state: str,
        task_context: str,
        available_actions: List[str],
    ) -> str:
        """Retrieve relevant experiences, build context, call Claude, return action."""
        query = Experience(
            state=state,
            action="",
            reward=0.0,
            outcome="",
            task_context=task_context,
            timestamp=time.time(),
        )

        retrieved = self._retriever.retrieve_for_context(query)
        self._last_retrieved_ids = [exp.id for exp in retrieved]

        memory_block = self._context_builder.build_memory_block(retrieved)
        system_prompt = self._context_builder.build_system_prompt(
            _BASE_SYSTEM_PROMPT, memory_block
        )

        user_msg = (
            f"Task: {task_context}\n"
            f"Current state: {state}\n"
            f"Available actions: {', '.join(available_actions)}\n"
            f"Choose one action:"
        )

        response = self._call_claude(system_prompt, user_msg)
        action = self._parse_action(response, available_actions)
        logger.info("act() → %r", action)
        return action

    def observe(
        self,
        state: str,
        action: str,
        reward: float,
        outcome: str,
        task_context: str,
    ) -> None:
        """Store experience and update importance of recently retrieved memories."""
        exp = Experience(
            state=state,
            action=action,
            reward=reward,
            outcome=outcome,
            task_context=task_context,
            timestamp=time.time(),
        )
        self._index.add(exp)

        # RL feedback: update importance of the memories that informed this decision
        for exp_id in self._last_retrieved_ids:
            self._retriever.update_importance_from_reward(
                exp_id, reward, ema_alpha=self._config.importance_ema_alpha
            )
        logger.info("observe() stored experience %s (reward=%.3f)", exp.id, reward)

    def reset(self) -> None:
        """Clear episode state without wiping the persistent database."""
        self._last_retrieved_ids = []
        logger.info("Agent episode reset (DB intact, %d experiences)", self._db.count())

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_client(self):
        if self._client is None:
            import anthropic
            self._client = anthropic.Anthropic(api_key=self._api_key)
        return self._client

    def _call_claude(self, system: str, user: str) -> str:
        client = self._get_client()
        response = client.messages.create(
            model=self._config.claude_model,
            max_tokens=self._config.max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return response.content[0].text.strip()

    def _parse_action(self, response: str, available_actions: List[str]) -> str:
        response_lower = response.lower().strip()
        for action in available_actions:
            if action.lower() in response_lower:
                return action
        # Fallback: return first available action
        logger.warning(
            "Could not parse action from response %r; falling back to %r",
            response,
            available_actions[0],
        )
        return available_actions[0]
