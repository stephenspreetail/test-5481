"""
Orchestrator state models.

Tracks the full lifecycle of every epic across all iterations.
These models are serialised to JSON after each phase for observability
and post-run analysis.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from models.epic import Epic, Plan, BuildResult, TestResult, ReviewResult


class IterationRecord(BaseModel):
    """Complete record of a single iteration for one epic."""

    iteration: int
    started_at: datetime
    completed_at: datetime | None = None
    plan: Plan | None = None
    build_result: BuildResult | None = None
    test_result: TestResult | None = None
    review_result: ReviewResult | None = None
    status: Literal[
        "planning",
        "building",
        "testing",
        "reviewing",
        "completed",
        "failed",
        "max_iterations_reached",
    ] = "planning"
    failure_reason: str | None = None


class EpicState(BaseModel):
    """Complete state for one epic across all iterations."""

    epic: Epic
    iterations: list[IterationRecord] = Field(default_factory=list)
    current_iteration: int = 0
    status: Literal[
        "pending",
        "in_progress",
        "completed",
        "failed",
        "max_iterations_reached",
    ] = "pending"
    final_result: TestResult | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None

    def current_record(self) -> IterationRecord | None:
        if not self.iterations:
            return None
        return self.iterations[-1]

    def all_test_results(self) -> list[TestResult]:
        return [r.test_result for r in self.iterations if r.test_result]


class OrchestratorState(BaseModel):
    """Global state across all epics for a single orchestrator run."""

    run_id: str
    epics: dict[str, EpicState] = Field(default_factory=dict)
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: datetime | None = None
    settings: dict = Field(default_factory=dict)

    def to_json_log(self) -> str:
        return self.model_dump_json(indent=2)

    def summary(self) -> dict:
        results = {}
        for epic_id, epic_state in self.epics.items():
            final = epic_state.final_result
            results[epic_id] = {
                "status": epic_state.status,
                "iterations_used": epic_state.current_iteration,
                "coverage_percent": final.coverage_percent if final else None,
                "tests_passed": final.tests_passed if final else None,
                "tests_total": final.tests_total if final else None,
            }
        return results
