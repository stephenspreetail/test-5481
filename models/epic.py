"""
Data contracts shared across all agents.

All Pydantic models here serve as the structured JSON exchange currency
between the orchestrator and each Claude Agent SDK subprocess. Every agent
receives context as embedded JSON and returns one of these validated models.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class Epic(BaseModel):
    """A high-level feature description supplied by the user in epics.yaml."""

    id: str
    title: str
    description: str
    language: str = "python"
    framework: str | None = None
    acceptance_criteria: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    priority: Literal["high", "medium", "low"] = "medium"


class Subtask(BaseModel):
    """A single unit of work within a plan, mapping to one file or cohesive unit."""

    id: str
    title: str
    description: str
    file_path: str
    dependencies: list[str] = Field(default_factory=list)
    estimated_complexity: Literal["low", "medium", "high"] = "medium"
    test_file_path: str | None = None


class Plan(BaseModel):
    """Structured implementation plan returned by the Planner agent."""

    epic_id: str
    iteration: int
    summary: str
    subtasks: list[Subtask]
    testing_strategy: str
    risks: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Artifact(BaseModel):
    """A file produced by the Builder agent."""

    subtask_id: str
    file_path: str
    file_type: Literal["source", "test", "config", "readme"]
    lines_of_code: int | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class BuildResult(BaseModel):
    """Returned by the Builder agent after implementing all subtasks."""

    epic_id: str
    iteration: int
    artifacts: list[Artifact]
    workspace_dir: str
    build_errors: list[str] = Field(default_factory=list)
    success: bool


class TestResult(BaseModel):
    """
    Returned by the Tester agent after running the full test suite.

    feedback_for_planner is the primary signal driving the next planning
    iteration — it should concisely describe what failed and why.
    """

    epic_id: str
    iteration: int
    tests_passed: int
    tests_failed: int
    tests_total: int
    coverage_percent: float
    critical_issues: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    feedback_for_planner: str
    success: bool

    @property
    def pass_rate(self) -> float:
        if self.tests_total == 0:
            return 0.0
        return self.tests_passed / self.tests_total


class ReviewResult(BaseModel):
    """Optional: returned by the Reviewer agent for code quality checks."""

    epic_id: str
    iteration: int
    security_issues: list[str] = Field(default_factory=list)
    style_issues: list[str] = Field(default_factory=list)
    quality_score: float
    blocking_issues: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    approved: bool
