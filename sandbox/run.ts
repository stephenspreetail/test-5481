import { Glob } from "bun";
import { resolve } from "node:path";
import { login } from "./lib/api.js";
import { startBackend, stopBackend } from "./lib/backend.js";
import {
  API_BASE_URL,
  K8S_CONTEXT,
  K8S_ENVIRONMENT,
  K8S_NAMESPACE,
  assertK8sReachable,
} from "./lib/context.js";
import { log } from "./lib/log.js";

export interface TestContext {
  token: string;
  apiBaseUrl: string;
  k8sContext: string;
  k8sNamespace: string;
}

const SANDBOX_DIR = import.meta.dir;

// Parse optional test name from args.
// Usage: bun run sandbox/run.ts [test-name]
//   e.g. bun run sandbox/run.ts 00-smoke
function getTestFilter(): string | undefined {
  // Skip argv entries that are bun runtime args or the script path itself
  const args = process.argv.slice(2);
  return args[0];
}

function testName(filePath: string): string {
  return filePath.split("/").pop()!.replace(/\.ts$/, "");
}

// ─── Prerequisites ───────────────────────────────────────────────────────────

async function checkPrerequisites(): Promise<void> {
  log("step", "Checking prerequisites...");

  // kubectl available
  const kv = Bun.spawn(["kubectl", "version", "--client"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const kvExit = await kv.exited;
  if (kvExit !== 0) {
    throw new Error("kubectl is not installed or not in PATH");
  }
  log("pass", "kubectl is available");

  // K8s cluster reachable via target context (does not require it to be current)
  await assertK8sReachable();

  log(
    "info",
    `Sandbox K8s target: environment=${K8S_ENVIRONMENT}, context=${K8S_CONTEXT}, namespace=${K8S_NAMESPACE}`,
  );
}

// ─── Test discovery & execution ──────────────────────────────────────────────

async function discoverTests(): Promise<string[]> {
  const testsDir = resolve(SANDBOX_DIR, "tests");
  const glob = new Glob("*.ts");
  const files: string[] = [];
  for await (const entry of glob.scan({ cwd: testsDir, absolute: true })) {
    files.push(entry);
  }
  return files.sort();
}

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function runTest(
  file: string,
  ctx: TestContext,
): Promise<TestResult> {
  const name = testName(file);
  log("step", `Running test: ${name}`);

  try {
    const mod = await import(file);
    const testFn = mod.default;
    if (typeof testFn !== "function") {
      throw new Error(`${file} does not export a default function`);
    }
    await testFn(ctx);
    log("pass", `Test passed: ${name}`);
    return { name, passed: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("fail", `Test failed: ${name} — ${message}`);
    return { name, passed: false, error: message };
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startTime = Date.now();

  try {
    await checkPrerequisites();
  } catch (err) {
    log("fail", `Prerequisites check failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  // Start backend with sandbox-controlled K8s env injected
  const backend = startBackend({
    K8S_ENVIRONMENT,
    K8S_CONTEXT,
    K8S_NAMESPACE,
  });
  try {
    await backend.ready;
  } catch (err) {
    log("fail", `Backend failed to start: ${err instanceof Error ? err.message : err}`);
    await stopBackend(backend.process);
    process.exit(1);
  }

  // Authenticate
  let token: string;
  try {
    log("step", "Authenticating as dev user...");
    const auth = await login("dev@kova.local", "devpassword123");
    token = auth.accessToken;
    log("pass", `Authenticated as ${auth.user.email} (id=${auth.user.id})`);
  } catch (err) {
    log("fail", `Authentication failed: ${err instanceof Error ? err.message : err}`);
    await stopBackend(backend.process);
    process.exit(1);
  }

  const ctx: TestContext = {
    token,
    apiBaseUrl: API_BASE_URL,
    k8sContext: K8S_CONTEXT,
    k8sNamespace: K8S_NAMESPACE,
  };

  // Discover and run tests
  const filter = getTestFilter();
  let testFiles = await discoverTests();
  if (filter) {
    testFiles = testFiles.filter((f) => testName(f) === filter);
    if (testFiles.length === 0) {
      // Fall back to substring match
      testFiles = (await discoverTests()).filter((f) =>
        testName(f).includes(filter),
      );
    }
    log("info", `Filter "${filter}" matched ${testFiles.length} test(s)`);
  }
  if (testFiles.length === 0) {
    log("warn", "No test files found in sandbox/tests/");
    await stopBackend(backend.process);
    process.exit(0);
  }

  log("info", `Running ${testFiles.length} test(s)`);
  const results: TestResult[] = [];

  for (const file of testFiles) {
    const result = await runTest(file, ctx);
    results.push(result);
  }

  // Stop backend
  await stopBackend(backend.process);

  // Report
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n" + "=".repeat(60));
  log("info", `Results: ${passed} passed, ${failed} failed (${elapsed}s)`);

  if (failed > 0) {
    console.log("");
    log("fail", "Failed tests:");
    for (const r of results.filter((r) => !r.passed)) {
      log("fail", `  ${r.name}: ${r.error}`);
    }
  }

  console.log("=".repeat(60));
  process.exit(failed > 0 ? 1 : 0);
}

main();
