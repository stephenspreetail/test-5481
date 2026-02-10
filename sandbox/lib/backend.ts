import type { Subprocess } from "bun";
import { resolve } from "node:path";
import { log } from "./log.js";

const ROOT_DIR = resolve(import.meta.dir, "../..");

export interface BackendEnvOverrides {
  K8S_ENVIRONMENT: string;
  K8S_CONTEXT: string;
  K8S_NAMESPACE: string;
}

/**
 * Poll a URL until it responds (any status code), or throw after maxMs.
 */
export async function waitForReady(url: string, maxMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      await fetch(url);
      return; // any response means the server is up
    } catch {
      // Connection refused — server not ready yet
    }
    await Bun.sleep(1000);
  }
  throw new Error(`waitForReady: ${url} did not respond within ${maxMs}ms`);
}

/**
 * Start the backend server as a child process.
 * Injects K8S_ENVIRONMENT, K8S_CONTEXT, and K8S_NAMESPACE into the process
 * env so the backend targets the sandbox's cluster regardless of what
 * .env or the user's shell says.
 */
export function startBackend(overrides: BackendEnvOverrides): {
  process: Subprocess;
  ready: Promise<void>;
} {
  log("info", "Starting backend...");
  log(
    "info",
    `Injecting K8S env: environment=${overrides.K8S_ENVIRONMENT}, context=${overrides.K8S_CONTEXT}, namespace=${overrides.K8S_NAMESPACE}`,
  );

  const proc = Bun.spawn(["bun", "--env-file=../.env", "--watch", "src/index.ts"], {
    cwd: resolve(ROOT_DIR, "backend"),
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      // Override K8s config — these take precedence over .env values
      // because Bun's --env-file sets vars that process.env overrides win over
      K8S_ENVIRONMENT: overrides.K8S_ENVIRONMENT,
      K8S_CONTEXT: overrides.K8S_CONTEXT,
      K8S_NAMESPACE: overrides.K8S_NAMESPACE,
    },
  });

  const ready = waitForReady("http://localhost:3002/api/auth/me", 30_000).then(
    () => {
      log("pass", "Backend is ready");
    },
  );

  return { process: proc, ready };
}

/**
 * Stop the backend process. Sends SIGTERM, waits up to 5s, then SIGKILL.
 */
export async function stopBackend(proc: Subprocess): Promise<void> {
  log("info", "Stopping backend...");
  proc.kill("SIGTERM");

  const exitedInTime = await Promise.race([
    proc.exited.then(() => true),
    Bun.sleep(5000).then(() => false),
  ]);

  if (!exitedInTime) {
    log("warn", "Backend did not exit in 5s, sending SIGKILL");
    proc.kill("SIGKILL");
    await proc.exited;
  }

  log("info", "Backend stopped");
}
