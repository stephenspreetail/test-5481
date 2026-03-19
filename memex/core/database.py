from __future__ import annotations

import json
import sqlite3
from typing import List, Optional

import numpy as np

from memex.core.experience import Experience


class ExperienceDatabase:
    def __init__(self, db_path: str = ":memory:") -> None:
        self._db_path = db_path
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self.initialize_schema()

    def initialize_schema(self) -> None:
        self._conn.executescript("""
            CREATE TABLE IF NOT EXISTS experiences (
                id TEXT PRIMARY KEY,
                state TEXT NOT NULL,
                action TEXT NOT NULL,
                reward REAL NOT NULL,
                outcome TEXT NOT NULL,
                task_context TEXT NOT NULL,
                timestamp REAL NOT NULL,
                importance REAL NOT NULL DEFAULT 1.0,
                semantic_embedding BLOB,
                behavioral_embedding BLOB
            );
            CREATE INDEX IF NOT EXISTS idx_task_context ON experiences(task_context);
            CREATE INDEX IF NOT EXISTS idx_timestamp ON experiences(timestamp);
        """)
        self._conn.commit()

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    def insert_experience(self, exp: Experience) -> None:
        sem_blob = self._serialize_embedding(exp.semantic_embedding)
        beh_blob = self._serialize_embedding(exp.behavioral_embedding)
        self._conn.execute(
            """
            INSERT OR REPLACE INTO experiences
                (id, state, action, reward, outcome, task_context,
                 timestamp, importance, semantic_embedding, behavioral_embedding)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                exp.id, exp.state, exp.action, exp.reward, exp.outcome,
                exp.task_context, exp.timestamp, exp.importance,
                sem_blob, beh_blob,
            ),
        )
        self._conn.commit()

    def get_experience(self, exp_id: str) -> Optional[Experience]:
        row = self._conn.execute(
            "SELECT * FROM experiences WHERE id = ?", (exp_id,)
        ).fetchone()
        if row is None:
            return None
        return self._row_to_experience(row)

    def update_importance(self, exp_id: str, new_importance: float) -> None:
        self._conn.execute(
            "UPDATE experiences SET importance = ? WHERE id = ?",
            (new_importance, exp_id),
        )
        self._conn.commit()

    def get_all_experiences(self) -> List[Experience]:
        rows = self._conn.execute("SELECT * FROM experiences").fetchall()
        return [self._row_to_experience(r) for r in rows]

    def get_experiences_by_task(self, task_context: str) -> List[Experience]:
        rows = self._conn.execute(
            "SELECT * FROM experiences WHERE task_context = ?", (task_context,)
        ).fetchall()
        return [self._row_to_experience(r) for r in rows]

    def delete_experience(self, exp_id: str) -> None:
        self._conn.execute("DELETE FROM experiences WHERE id = ?", (exp_id,))
        self._conn.commit()

    def count(self) -> int:
        return self._conn.execute("SELECT COUNT(*) FROM experiences").fetchone()[0]

    def close(self) -> None:
        self._conn.close()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _serialize_embedding(self, vec: Optional[np.ndarray]) -> Optional[bytes]:
        if vec is None:
            return None
        meta = json.dumps({"dtype": str(vec.dtype), "shape": list(vec.shape)}).encode()
        meta_len = len(meta).to_bytes(4, "little")
        return meta_len + meta + vec.tobytes()

    def _deserialize_embedding(self, blob: Optional[bytes]) -> Optional[np.ndarray]:
        if blob is None:
            return None
        meta_len = int.from_bytes(blob[:4], "little")
        meta = json.loads(blob[4 : 4 + meta_len])
        data = blob[4 + meta_len :]
        return np.frombuffer(data, dtype=meta["dtype"]).reshape(meta["shape"]).copy()

    def _row_to_experience(self, row: sqlite3.Row) -> Experience:
        exp = Experience(
            id=row["id"],
            state=row["state"],
            action=row["action"],
            reward=row["reward"],
            outcome=row["outcome"],
            task_context=row["task_context"],
            timestamp=row["timestamp"],
            importance=row["importance"],
        )
        exp.semantic_embedding = self._deserialize_embedding(row["semantic_embedding"])
        exp.behavioral_embedding = self._deserialize_embedding(row["behavioral_embedding"])
        return exp
