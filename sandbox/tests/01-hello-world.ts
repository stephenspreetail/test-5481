import type { TestContext } from "../run.js";
import { createApp, getAppStatus, getChat, stopApp } from "../lib/api.js";
import { kubectl } from "../lib/context.js";
import { assert, assertEq, log } from "../lib/log.js";
import { streamChat } from "../lib/ws-chat.js";

/**
 * Find a running pod for an app using label selectors.
 * Works with both orchestrators:
 *   - kubectl: labels with kova.app-id={appId}
 *   - helm:    labels with kova.dev/app-id={appId}
 */
async function findAppPod(
  appId: number,
): Promise<{ found: boolean; phase: string }> {
  // Try helm-style labels first (kova.dev/app-id)
  let result = await kubectl(
    "get",
    "pod",
    "-l",
    `kova.dev/app-id=${appId}`,
    "-o",
    "jsonpath={.items[0].status.phase}",
  );

  if (result.exitCode === 0 && result.stdout.trim()) {
    return { found: true, phase: result.stdout.trim() };
  }

  // Fall back to kubectl-style labels (kova.app-id)
  result = await kubectl(
    "get",
    "pod",
    "-l",
    `kova.app-id=${appId}`,
    "-o",
    "jsonpath={.items[0].status.phase}",
  );

  if (result.exitCode === 0 && result.stdout.trim()) {
    return { found: true, phase: result.stdout.trim() };
  }

  return { found: false, phase: "" };
}

/**
 * Check that no deployment exists yet for this app.
 * Works with both orchestrators by checking deployments labeled with
 * app=kova-app and the app ID (both label styles).
 */
async function assertNoDeployment(appId: number): Promise<void> {
  const helmCheck = await kubectl(
    "get",
    "deployment",
    "-l",
    `kova.dev/app-id=${appId}`,
    "-o",
    "jsonpath={.items[*].metadata.name}",
  );
  const kubectlCheck = await kubectl(
    "get",
    "deployment",
    "-l",
    `kova.app-id=${appId}`,
    "-o",
    "jsonpath={.items[*].metadata.name}",
  );

  const helmDeployments = helmCheck.stdout.trim();
  const kubectlDeployments = kubectlCheck.stdout.trim();

  assert(
    !helmDeployments && !kubectlDeployments,
    `Expected no deployments for app ${appId}, found: ${helmDeployments || kubectlDeployments}`,
  );
}

export default async function helloWorldTest(ctx: TestContext): Promise<void> {
  // 1. Create app with unique name
  const appName = `sandbox-hello-${Date.now()}`;
  const { app, chatId } = await createApp(ctx.token, appName);
  const appId = app.id;
  log("info", `Created app ${appId}: ${appName}`);

  // 2. Verify no k8s deployment exists yet
  await assertNoDeployment(appId);
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
  const pod = await findAppPod(appId);
  assert(pod.found, `No pod found for app ${appId}`);
  assertEq(pod.phase, "Running", "Pod should be Running");
  log("pass", "K8s pod is Running");

  // 5. Verify app status via API (should report running with URLs)
  const status = await getAppStatus(ctx.token, appId);
  assertEq(status.status, "running", "App status should be running");
  assert(!!status.previewUrl, "Should have a preview URL");
  assert(!!status.agentUrl, "Should have an agent URL");
  log("pass", `App running at ${status.previewUrl}`);

  // 6. Validate chat has user + assistant messages
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

  // 7. Stop app (scale to 0)
  await stopApp(ctx.token, appId);
  log("pass", "App stopped (deployment scaled to 0)");
}
