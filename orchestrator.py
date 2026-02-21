"""
Orchestrator — the control plane for the Agentic Epic Builder.

This is pure Python. No Claude agents here. The orchestrator drives the
detect → plan → build → test → evaluate → repeat loop for each epic,
dispatching to specialised Claude Agent SDK subprocesses at each phase.

Key responsibilities:
- Manage iteration loops with a configurable max_iterations guard.
- Route TestResult feedback back to the Planner on retry iterations.
- Evaluate completeness via deterministic four-gate logic (not delegated to agents).
- Log every phase to structured JSON files for observability.
- Isolate failures per epic — one epic failing does not block others.
- Serialise full run state for post-run analysis.
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime
from pathlib import Path

from agents.builder import run_builder
from agents.planner import run_planner
from agents.tester import run_tester
from models.epic import Epic, TestResult
from models.state import EpicState, IterationRecord, OrchestratorState

logger = logging.getLogger(__name__)


class Orchestrator:
    """
    Core orchestration engine for the Agentic Epic Builder.

    Accepts a list of epics, manages their iteration lifecycle, and returns
    a fully-populated OrchestratorState describing every decision made.
    """

    def __init__(
        self,
        epics: list[Epic],
        workspace_root: Path,
        log_dir: Path,
        max_iterations: int = 3,
        coverage_threshold: float = 80.0,
        model: str = "claude-opus-4-6",
        parallel_epics: bool = False,
    ) -> None:
        """
        Args:
            epics: List of epics to implement.
            workspace_root: Root directory; each epic gets workspace_root/<epic.id>/.
            log_dir: Directory for structured JSON phase logs and state files.
            max_iterations: Maximum plan-build-test cycles per epic before giving up.
            coverage_threshold: Minimum test coverage % required for completeness.
            model: Claude model ID used for all agent subprocesses.
            parallel_epics: If True, run all epics concurrently via asyncio.gather().
        """
        self.epics = epics
        self.workspace_root = workspace_root
        self.log_dir = log_dir
        self.max_iterations = max_iterations
        self.coverage_threshold = coverage_threshold
        self.model = model
        self.parallel_epics = parallel_epics

        self.run_id = str(uuid.uuid4())[:8]
        self.state = OrchestratorState(
            run_id=self.run_id,
            settings={
                "max_iterations": max_iterations,
                "coverage_threshold": coverage_threshold,
                "model": model,
                "parallel_epics": parallel_epics,
            },
        )

        # Initialise per-epic workspace and state
        for epic in epics:
            workspace_dir = workspace_root / epic.id
            workspace_dir.mkdir(parents=True, exist_ok=True)
            self.state.epics[epic.id] = EpicState(epic=epic)

        log_dir.mkdir(parents=True, exist_ok=True)

    async def run(self) -> OrchestratorState:
        """
        Entry point. Run all epics, return the final OrchestratorState.

        Exit code semantics: callers should check whether all epics have
        status="completed" to determine overall success.
        """
        self.state.started_at = datetime.utcnow()
        logger.info(
            f"Orchestrator run {self.run_id} starting | "
            f"epics={len(self.epics)} "
            f"max_iterations={self.max_iterations} "
            f"coverage_threshold={self.coverage_threshold}% "
            f"parallel={self.parallel_epics}"
        )

        if self.parallel_epics:
            await asyncio.gather(*[self._run_epic(epic) for epic in self.epics])
        else:
            for epic in self.epics:
                await self._run_epic(epic)

        self.state.completed_at = datetime.utcnow()
        self._save_final_state()
        self._print_summary()
        return self.state

    # ------------------------------------------------------------------
    # Epic lifecycle
    # ------------------------------------------------------------------

    async def _run_epic(self, epic: Epic) -> None:
        """
        Run the full detect-plan-build-test loop for one epic.

        The loop runs up to max_iterations times. Each iteration passes the
        previous TestResult (if any) to the Planner as feedback, enabling
        the Planner to adapt its approach based on what failed.
        """
        epic_state = self.state.epics[epic.id]
        epic_state.status = "in_progress"
        epic_state.started_at = datetime.utcnow()
        workspace_dir = self.workspace_root / epic.id

        logger.info(f"[{epic.id}] Starting epic: '{epic.title}'")

        previous_test_result: TestResult | None = None

        for iteration in range(1, self.max_iterations + 1):
            logger.info(
                f"[{epic.id}] ── Iteration {iteration}/{self.max_iterations} ──"
            )

            record = IterationRecord(
                iteration=iteration,
                started_at=datetime.utcnow(),
            )
            epic_state.iterations.append(record)
            epic_state.current_iteration = iteration

            # ── PHASE 1: PLAN ──────────────────────────────────────────
            try:
                record.status = "planning"
                plan = await run_planner(
                    epic=epic,
                    iteration=iteration,
                    previous_test_result=previous_test_result,
                    workspace_dir=workspace_dir,
                    model=self.model,
                )
                record.plan = plan
                self._log_phase(epic.id, iteration, "plan", plan.model_dump(mode="json"))

            except Exception as exc:
                self._handle_phase_failure(epic_state, record, "planning", exc)
                break

            # ── PHASE 2: BUILD ─────────────────────────────────────────
            try:
                record.status = "building"
                build_result = await run_builder(
                    epic=epic,
                    plan=plan,
                    workspace_dir=workspace_dir,
                    model=self.model,
                )
                record.build_result = build_result
                self._log_phase(
                    epic.id, iteration, "build", build_result.model_dump(mode="json")
                )
                # Soft build errors: log but don't abort — let Tester evaluate
                # what was actually produced rather than short-circuiting early.

            except Exception as exc:
                self._handle_phase_failure(epic_state, record, "building", exc)
                break

            # ── PHASE 3: TEST ──────────────────────────────────────────
            try:
                record.status = "testing"
                test_result = await run_tester(
                    epic=epic,
                    plan=plan,
                    build_result=build_result,
                    workspace_dir=workspace_dir,
                    coverage_threshold=self.coverage_threshold,
                    model=self.model,
                )
                record.test_result = test_result
                previous_test_result = test_result  # Feed into next Planner call
                self._log_phase(
                    epic.id, iteration, "test", test_result.model_dump(mode="json")
                )

            except Exception as exc:
                self._handle_phase_failure(epic_state, record, "testing", exc)
                break

            # ── COMPLETENESS EVALUATION ────────────────────────────────
            record.completed_at = datetime.utcnow()

            if self._is_complete(test_result):
                logger.info(
                    f"[{epic.id}] Completeness reached at iteration {iteration} | "
                    f"coverage={test_result.coverage_percent:.1f}% "
                    f"passed={test_result.tests_passed}/{test_result.tests_total}"
                )
                record.status = "completed"
                epic_state.status = "completed"
                epic_state.final_result = test_result
                epic_state.completed_at = datetime.utcnow()
                self._save_epic_state(epic.id)
                break

            else:
                logger.info(
                    f"[{epic.id}] Not complete after iteration {iteration} | "
                    f"coverage={test_result.coverage_percent:.1f}% "
                    f"(need {self.coverage_threshold}%) "
                    f"failed={test_result.tests_failed} "
                    f"critical_issues={len(test_result.critical_issues)}"
                )
                record.status = "completed"
                self._save_epic_state(epic.id)
                # Loop continues; previous_test_result carries feedback forward

        else:
            # for-loop exhausted without a break = max iterations reached
            logger.warning(
                f"[{epic.id}] Max iterations ({self.max_iterations}) reached "
                "without completing."
            )
            epic_state.status = "max_iterations_reached"
            epic_state.completed_at = datetime.utcnow()
            self._save_epic_state(epic.id)

    # ------------------------------------------------------------------
    # Completeness evaluation (deterministic Python — not delegated to agents)
    # ------------------------------------------------------------------

    def _is_complete(self, test_result: TestResult) -> bool:
        """
        Four-gate completeness check. All gates must pass.

        Gate 1 — Zero failures:       tests_failed == 0
        Gate 2 — Coverage threshold:  coverage_percent >= self.coverage_threshold
        Gate 3 — No critical issues:  critical_issues is empty
        Gate 4 — Agent declaration:   test_result.success == True

        Gates 1–3 are the authoritative orchestrator checks. Gate 4 adds the
        Tester agent's own assessment of acceptance criteria that can't be
        checked deterministically by the orchestrator.
        """
        return (
            test_result.tests_failed == 0
            and test_result.coverage_percent >= self.coverage_threshold
            and len(test_result.critical_issues) == 0
            and test_result.success
        )

    # ------------------------------------------------------------------
    # Failure handling
    # ------------------------------------------------------------------

    def _handle_phase_failure(
        self,
        epic_state: EpicState,
        record: IterationRecord,
        phase: str,
        error: Exception,
    ) -> None:
        """Record a phase failure, mark state, and log the error."""
        msg = (
            f"{phase} phase failed at iteration {record.iteration}: "
            f"{type(error).__name__}: {error}"
        )
        logger.error(f"[{epic_state.epic.id}] {msg}", exc_info=True)
        record.status = "failed"
        record.failure_reason = msg
        record.completed_at = datetime.utcnow()
        epic_state.status = "failed"
        epic_state.completed_at = datetime.utcnow()
        self._save_epic_state(epic_state.epic.id)

    # ------------------------------------------------------------------
    # Logging and state persistence
    # ------------------------------------------------------------------

    def _log_phase(
        self, epic_id: str, iteration: int, phase: str, data: dict
    ) -> None:
        """Write a structured JSON log entry for one agent phase."""
        log_file = self.log_dir / f"{epic_id}_iter{iteration:02d}_{phase}.json"
        event = {
            "run_id": self.run_id,
            "epic_id": epic_id,
            "iteration": iteration,
            "phase": phase,
            "timestamp": datetime.utcnow().isoformat(),
            "data": data,
        }
        log_file.write_text(json.dumps(event, indent=2, default=str))
        logger.debug(f"[{epic_id}] Phase '{phase}' logged to {log_file}")

    def _save_epic_state(self, epic_id: str) -> None:
        state_file = self.log_dir / f"{epic_id}_state.json"
        state_file.write_text(
            self.state.epics[epic_id].model_dump_json(indent=2)
        )

    def _save_final_state(self) -> None:
        final_file = self.log_dir / f"run_{self.run_id}_final_state.json"
        final_file.write_text(self.state.to_json_log())
        logger.info(f"Final state saved to {final_file}")

    def _print_summary(self) -> None:
        logger.info("=" * 60)
        logger.info(f"RUN {self.run_id} COMPLETE")
        logger.info("=" * 60)
        for epic_id, epic_state in self.state.epics.items():
            final = epic_state.final_result
            status = epic_state.status.upper()
            n_iter = epic_state.current_iteration
            if final:
                logger.info(
                    f"  [{epic_id}] {status} after {n_iter} iteration(s) | "
                    f"coverage={final.coverage_percent:.1f}% "
                    f"passed={final.tests_passed}/{final.tests_total}"
                )
            else:
                logger.info(
                    f"  [{epic_id}] {status} after {n_iter} iteration(s)"
                )
        logger.info("=" * 60)
