import type { TestContext } from "../run.js";
import { createApp, getChat, stopApp } from "../lib/api.js";
import { kubectl } from "../lib/context.js";
import { assert, assertEq, log } from "../lib/log.js";
import { streamChat } from "../lib/ws-chat.js";

export default async function helloWorldTest(ctx: TestContext): Promise<void> {
  // 1. Create app with unique name
  const appName = `sandbox-hello-${Date.now()}`;
  const { app, chatId } = await createApp(ctx.token, appName);
  const appId = app.id;
  log("info", `Created app ${appId}: ${appName}`);

  // 2. Verify no k8s deployment exists yet
  // (kubectl() auto-injects --context and -n)
  const noDeployYet = await kubectl("get", "deployment", `app-${appId}`);
  assert(noDeployYet.exitCode !== 0, "Deployment should not exist yet");
  log("pass", "No pre-existing k8s deployment");

  // 3. Send chat prompt (triggers container creation + agent)
  log("step", "Sending chat prompt (this triggers container + agent)...");
  const result = await streamChat({
    token: ctx.token,
    chatId,
    prompt:
      "Build a simple hello world page that says 'Hello from Kova!' in large centered text. Use plain HTML and CSS. Save as index.html.",
    onDelta: (d) => process.stdout.write(d),
  });
  process.stdout.write("\n");
  log(
    "pass",
    `Chat completed (${result.durationMs}ms, $${result.costUsd?.toFixed(4) ?? "n/a"})`,
  );

  // 4. Validate k8s pod is running
  const podPhase = await kubectl(
    "get",
    "pod",
    "-l",
    `kova.app-id=${appId}`,
    "-o",
    "jsonpath={.items[0].status.phase}",
  );
  assertEq(podPhase.stdout.trim(), "Running", "Pod should be Running");
  log("pass", "K8s pod is Running");

  // 5. Validate chat has user + assistant messages
  const chat = await getChat(ctx.token, chatId);
  assert(
    chat.messages.length >= 2,
    `Expected >=2 messages, got ${chat.messages.length}`,
  );
  assertEq(chat.messages[0].role, "user", "First message should be user");
  assert(
    chat.messages.some((m) => m.role === "assistant"),
    "Should have assistant message",
  );
  log("pass", `Chat has ${chat.messages.length} messages`);

  // 6. Stop app (scale to 0)
  await stopApp(ctx.token, appId);
  log("pass", "App stopped (deployment scaled to 0)");
}
