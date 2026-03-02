import WebSocket from "ws";
import type { TestContext } from "../run.js";
import { createApp, deleteApp, stopApp } from "../lib/api.js";
import { WS_BASE_URL } from "../lib/context.js";
import { assert, log } from "../lib/log.js";

type AgentStatus =
  | "offline"
  | "scheduling"
  | "starting"
  | "ready"
  | "working"
  | "error";

interface AgentStatusEvent {
  status: AgentStatus;
  message: string;
  timestamp: number;
}

/**
 * Agent Status smoke test — validates that WebSocket agent status transitions
 * fire correctly during a chat prompt that triggers container spin-up + agent work.
 *
 * Expected flow: scheduling → starting → ready → working → ready
 */
export default async function agentStatusTest(
  ctx: TestContext,
): Promise<void> {
  // 1. Create app
  const appName = `status-test-${Date.now()}`;
  const { app, chatId } = await createApp(ctx.token, appName);
  const appId = app.id;
  log("info", `Created app ${appId}: ${appName}`);

  // 2. Connect WebSocket, subscribe to agent status, then send chat
  const statusEvents: AgentStatusEvent[] = [];

  const result = await new Promise<{
    updatedFiles: boolean;
    costUsd?: number;
    durationMs?: number;
  }>((resolve, reject) => {
    const url = `${WS_BASE_URL}/ws?token=${ctx.token}`;
    const ws = new WebSocket(url);
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        ws.close();
        reject(new Error("Agent status test timed out after 300s"));
      }
    }, 300_000);

    function settle(fn: () => void) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws.close();
      fn();
    }

    ws.on("open", () => {
      // Wait for "connected" message
    });

    ws.on("message", (data) => {
      let msg: { type: string; [key: string]: unknown };
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      switch (msg.type) {
        case "connected":
          // Subscribe to agent status first, then send chat prompt
          ws.send(
            JSON.stringify({ type: "subscribe:agent-status", appId }),
          );
          // Small delay to ensure subscription is registered before the chat triggers broadcasts
          setTimeout(() => {
            ws.send(
              JSON.stringify({
                type: "chat:stream",
                chatId,
                prompt:
                  "Create a file called index.html with: <h1>Hello from Kova!</h1>",
              }),
            );
          }, 100);
          break;

        case "app:agent:status":
          statusEvents.push({
            status: msg.status as AgentStatus,
            message: msg.message as string,
            timestamp: msg.timestamp as number,
          });
          log(
            "info",
            `Agent status: ${msg.status} — "${msg.message}"`,
          );
          break;

        case "chat:response:end":
          settle(() =>
            resolve({
              updatedFiles: (msg.updatedFiles as boolean) ?? false,
              costUsd: msg.costUsd as number | undefined,
              durationMs: msg.durationMs as number | undefined,
            }),
          );
          break;

        case "chat:response:error":
          settle(() =>
            reject(
              new Error(
                `chat:response:error: ${msg.error ?? "unknown"}`,
              ),
            ),
          );
          break;
      }
    });

    ws.on("error", (err) => settle(() => reject(err)));
    ws.on("close", (code, reason) => {
      settle(() =>
        reject(
          new Error(
            `WebSocket closed: code=${code} reason=${reason?.toString()}`,
          ),
        ),
      );
    });
  });

  log(
    "pass",
    `Chat completed (${result.durationMs}ms, $${result.costUsd?.toFixed(4) ?? "n/a"})`,
  );

  // 3. Validate status transitions
  const statuses = statusEvents.map((e) => e.status);
  log("info", `Status sequence: ${statuses.join(" → ")}`);

  // Must have received at least some status events
  assert(
    statusEvents.length >= 2,
    `Expected >=2 status events, got ${statusEvents.length}`,
  );
  log("pass", `Received ${statusEvents.length} status events`);

  // "scheduling" should appear (container spin-up)
  assert(
    statuses.includes("scheduling"),
    `Expected "scheduling" in status sequence: ${statuses.join(" → ")}`,
  );
  log("pass", 'Status "scheduling" observed');

  // "working" should appear (agent processing the prompt)
  assert(
    statuses.includes("working"),
    `Expected "working" in status sequence: ${statuses.join(" → ")}`,
  );
  log("pass", 'Status "working" observed');

  // Last status should be "ready" (agent finished, container still up)
  const lastStatus = statuses[statuses.length - 1];
  assert(
    lastStatus === "ready",
    `Expected last status to be "ready", got "${lastStatus}"`,
  );
  log("pass", 'Final status is "ready"');

  // "scheduling" should come before "working"
  const schedulingIdx = statuses.indexOf("scheduling");
  const workingIdx = statuses.indexOf("working");
  assert(
    schedulingIdx < workingIdx,
    `"scheduling" (idx=${schedulingIdx}) should come before "working" (idx=${workingIdx})`,
  );
  log("pass", '"scheduling" precedes "working"');

  // All messages should be non-empty strings
  for (const event of statusEvents) {
    assert(
      typeof event.message === "string" && event.message.length > 0,
      `Status "${event.status}" should have a non-empty message`,
    );
  }
  log("pass", "All status events have non-empty messages");

  // 4. Cleanup: stop and delete app
  await stopApp(ctx.token, appId);
  await deleteApp(ctx.token, appId);
  log("pass", `Cleaned up app ${appId}`);
}
