"""
Core Claude Agent SDK integration layer.

This is the only file that imports claude_agent_sdk. Every agent wrapper
(planner, builder, tester) calls run_agent_with_retry(), which delegates
to run_agent_query() with automatic exponential-backoff retry logic.

Key design decisions:
- Uses the Python SDK's query() function, not raw subprocess CLI calls,
  because it handles subprocess lifecycle, JSON buffering, structured output
  schema validation, and typed exceptions internally.
- Unsets CLAUDECODE=1 in the subprocess environment to prevent "nested
  session" errors when running inside Claude Code.
- Structured outputs are guaranteed via json_schema output_format, so
  callers receive validated Pydantic models rather than raw strings.
"""
from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Any, Type, TypeVar

from pydantic import BaseModel

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


class AgentOutputError(Exception):
    """Raised when an agent fails to produce valid structured output."""


class AgentTimeoutError(Exception):
    """Raised when an agent exceeds its budget or turn limit."""


async def run_agent_query(
    prompt: str,
    system_prompt: str,
    output_schema: Type[T],
    workspace_dir: str | Path,
    allowed_tools: list[str],
    permission_mode: str = "acceptEdits",
    model: str = "claude-opus-4-6",
    max_turns: int = 50,
    max_budget_usd: float = 5.0,
    extra_env: dict[str, str] | None = None,
) -> tuple[T, Any]:
    """
    Invoke a Claude agent and return (parsed_structured_output, result_message).

    The agent is launched as a subprocess via the Claude Agent SDK's query()
    function. The output is validated against output_schema before returning.

    Args:
        prompt: The user prompt to send to the agent.
        system_prompt: The agent's system prompt (role and instructions).
        output_schema: Pydantic model class defining the expected output shape.
        workspace_dir: Working directory for the agent subprocess.
        allowed_tools: List of tool names the agent may use.
        permission_mode: SDK permission mode ("plan", "acceptEdits", "bypassPermissions").
        model: Claude model ID.
        max_turns: Maximum agentic turns before stopping.
        max_budget_usd: Maximum spend in USD before stopping.
        extra_env: Additional environment variables for the subprocess.

    Returns:
        Tuple of (validated Pydantic model, ResultMessage).

    Raises:
        AgentOutputError: If structured output validation fails after SDK retries.
        AgentTimeoutError: If the agent exceeds budget or turn limits.
        CLINotFoundError: If the claude CLI is not installed.
        ProcessError: If the subprocess crashes.
    """
    try:
        from claude_agent_sdk import (
            query,
            ClaudeAgentOptions,
            ResultMessage,
            CLINotFoundError,
            ProcessError,
        )
    except ImportError as exc:
        raise ImportError(
            "claude-agent-sdk is not installed. Run: pip install claude-agent-sdk"
        ) from exc

    schema = output_schema.model_json_schema()

    # Unset CLAUDECODE=1 to prevent "nested session" errors when running
    # the Claude Agent SDK from inside an existing Claude Code session.
    subprocess_env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}
    if extra_env:
        subprocess_env.update(extra_env)

    options = ClaudeAgentOptions(
        system_prompt=system_prompt,
        allowed_tools=allowed_tools,
        permission_mode=permission_mode,
        model=model,
        max_turns=max_turns,
        cwd=str(workspace_dir),
        output_format={"type": "json_schema", "schema": schema},
        env=subprocess_env,
    )

    result_message = None

    async for message in query(prompt=prompt, options=options):
        if isinstance(message, ResultMessage):
            result_message = message

    if result_message is None:
        raise AgentOutputError("No ResultMessage received from agent subprocess.")

    if getattr(result_message, "subtype", None) == "error_max_structured_output_retries":
        raise AgentOutputError(
            f"Agent could not produce valid JSON matching schema: {output_schema.__name__}"
        )

    if getattr(result_message, "is_error", False):
        raise AgentOutputError(
            f"Agent returned an error result: {result_message.result}"
        )

    structured = getattr(result_message, "structured_output", None)
    if structured is None:
        # Fallback: try to parse the raw result as JSON
        import json

        try:
            structured = json.loads(result_message.result)
        except Exception:
            raise AgentOutputError(
                f"Agent returned no structured_output and result is not JSON: "
                f"{str(result_message.result)[:200]}"
            )

    parsed = output_schema.model_validate(structured)

    cost = getattr(result_message, "total_cost_usd", None)
    logger.debug(
        f"Agent query complete | schema={output_schema.__name__} "
        f"cost=${cost:.4f}" if cost else f"Agent query complete | schema={output_schema.__name__}"
    )

    return parsed, result_message


async def run_agent_with_retry(
    max_attempts: int = 3,
    base_delay: float = 2.0,
    **kwargs: Any,
) -> tuple[Any, Any]:
    """
    Retry run_agent_query() with exponential backoff on transient errors.

    Retries on ProcessError and AgentOutputError. Does NOT retry on
    CLINotFoundError (unrecoverable without user action).

    Args:
        max_attempts: Maximum number of attempts (default 3).
        base_delay: Base delay in seconds; doubles each attempt (2s, 4s, 8s).
        **kwargs: All arguments forwarded to run_agent_query().

    Returns:
        Same as run_agent_query().

    Raises:
        The last exception encountered if all attempts fail.
        CLINotFoundError immediately if the CLI is not installed.
    """
    try:
        from claude_agent_sdk import CLINotFoundError, ProcessError
    except ImportError:
        CLINotFoundError = Exception  # type: ignore[misc,assignment]
        ProcessError = Exception  # type: ignore[misc,assignment]

    last_error: Exception | None = None

    for attempt in range(1, max_attempts + 1):
        try:
            return await run_agent_query(**kwargs)

        except CLINotFoundError:
            raise  # Unrecoverable; re-raise immediately

        except (AgentOutputError, ProcessError) as exc:
            last_error = exc
            if attempt < max_attempts:
                delay = base_delay * (2 ** (attempt - 1))
                logger.warning(
                    f"Agent attempt {attempt}/{max_attempts} failed: {exc}. "
                    f"Retrying in {delay:.1f}s..."
                )
                await asyncio.sleep(delay)
            else:
                logger.error(
                    f"Agent failed after {max_attempts} attempts: {exc}"
                )

    raise last_error  # type: ignore[misc]
