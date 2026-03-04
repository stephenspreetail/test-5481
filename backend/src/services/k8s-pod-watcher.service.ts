/**
 * K8s Pod Watcher Service
 *
 * Two capabilities:
 * 1. queryPodStatus(appId) — queries K8s for real pod state (with query debouncing)
 * 2. ensureWatching()      — namespace-wide watch that pushes real-time updates
 *
 * The watcher is the speed layer; queryPodStatus is the correctness layer.
 *
 * Query debouncing:
 * queryPodStatus coalesces rapid identical queries (subscribe storms, reconnects)
 * so that N clients subscribing to the same app within 2s produce only one K8s
 * API call. This is NOT a cache — it doesn't store long-lived state or substitute
 * for the real source. It's a debouncer that prevents flooding the API server.
 * - The watcher clears debounce entries on state change so the next query is fresh.
 * - Entries expire after 2s regardless, bounding staleness if the watcher is down.
 * - The push path (watcher → WebSocket broadcast) is completely independent.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { buildK8sEnvironmentConfig } from "./k8s-environment.service.js";
import {
  broadcastAgentStatus,
  type AgentStatus,
} from "../websocket/handlers/agent-status.handler.js";

// ── Types ───────────────────────────────────────────────────────────────────

interface PodEvent {
  metadata?: {
    labels?: Record<string, string>;
  };
  status?: {
    phase?: string;
    containerStatuses?: Array<{ ready?: boolean }>;
  };
}

interface PodList {
  items?: PodEvent[];
}

// ── Shared pod-phase mapping ────────────────────────────────────────────────

/**
 * Extract appId from pod labels. Supports both orchestrator label conventions:
 * - helm: kova.dev/app-id
 * - kubectl: kova.app-id
 */
function extractAppId(pod: PodEvent): number | null {
  const labels = pod.metadata?.labels;
  if (!labels) return null;

  const raw = labels["kova.dev/app-id"] || labels["kova.app-id"];
  if (!raw) return null;

  const id = parseInt(raw, 10);
  return Number.isNaN(id) ? null : id;
}

/**
 * Map Kubernetes pod state to agent status.
 */
function podPhaseToAgentStatus(pod: PodEvent): AgentStatus {
  const phase = pod.status?.phase;

  if (phase === "Pending") return "scheduling";
  if (phase === "Running") {
    const ready = pod.status?.containerStatuses?.[0]?.ready;
    return ready ? "ready" : "starting";
  }
  if (phase === "Failed" || phase === "Unknown") return "error";
  if (phase === "Succeeded") return "offline";

  return "scheduling";
}

// ── Query debouncer ─────────────────────────────────────────────────────────
//
// Coalesces rapid identical K8s queries for the same app.
// Cleared by the watcher on state change; expires after 2s as a safety net.

const DEBOUNCE_TTL_MS = 2_000;

interface DebounceEntry {
  status: AgentStatus;
  expiresAt: number;
}

const recentQueries = new Map<number, DebounceEntry>();

function getDebounced(appId: number): AgentStatus | null {
  const entry = recentQueries.get(appId);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    recentQueries.delete(appId);
    return null;
  }
  return entry.status;
}

function setDebounced(appId: number, status: AgentStatus): void {
  recentQueries.set(appId, { status, expiresAt: Date.now() + DEBOUNCE_TTL_MS });
}

function clearDebounced(appId: number): void {
  recentQueries.delete(appId);
}

// ── One-shot query (correctness layer) ──────────────────────────────────────

/**
 * Run kubectl and return stdout, or null on failure.
 */
async function execKubectl(args: string[]): Promise<string | null> {
  const proc = spawn("kubectl", args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const chunks: Buffer[] = [];
  proc.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));

  const exitCode = await new Promise<number | null>((resolve) => {
    proc.on("close", resolve);
    proc.on("error", () => resolve(null));
  });

  if (exitCode !== 0) return null;
  return Buffer.concat(chunks).toString();
}

/**
 * Query K8s for the current pod status of an app.
 *
 * Debounced: if the same app was queried within the last 2s and no state
 * change has occurred since, returns the previous result without hitting K8s.
 * The watcher clears debounce entries on state change so the next query is fresh.
 */
export async function queryPodStatus(appId: number): Promise<AgentStatus> {
  // Debounce hit — same app queried recently, no state change since
  const recent = getDebounced(appId);
  if (recent !== null) return recent;

  // Query K8s (the source of truth)
  const status = await queryK8sDirectly(appId);

  // Store for debouncing subsequent queries
  setDebounced(appId, status);

  return status;
}

/**
 * Direct K8s query with no caching. Tries both label conventions.
 */
async function queryK8sDirectly(appId: number): Promise<AgentStatus> {
  const k8sConfig = buildK8sEnvironmentConfig();
  const baseArgs = [
    "-o", "json",
    "-n", k8sConfig.namespace,
    ...(k8sConfig.context ? ["--context", k8sConfig.context] : []),
  ];

  for (const label of [`kova.dev/app-id=${appId}`, `kova.app-id=${appId}`]) {
    const stdout = await execKubectl(["get", "pods", "-l", label, ...baseArgs]);
    if (!stdout) continue;

    try {
      const list: PodList = JSON.parse(stdout);
      if (list.items && list.items.length > 0) {
        return podPhaseToAgentStatus(list.items[0]);
      }
    } catch {
      // Malformed JSON
    }
  }

  return "offline";
}

// ── Namespace watcher (speed layer) ─────────────────────────────────────────

let watcherProcess: ChildProcess | null = null;
let restartTimer: ReturnType<typeof setTimeout> | null = null;
let consecutiveFailures = 0;
const MAX_BACKOFF_MS = 30_000;

// Dedup: only broadcast when status actually changes for an app
const lastKnownStatus = new Map<number, AgentStatus>();

/**
 * Start the namespace-wide pod watcher. Idempotent.
 */
export function ensureWatching(): void {
  if (watcherProcess) return;
  startWatcher();
}

function startWatcher(): void {
  const k8sConfig = buildK8sEnvironmentConfig();

  const args = [
    "get", "pods",
    "--watch", "-o", "json",
    "-n", k8sConfig.namespace,
    ...(k8sConfig.context ? ["--context", k8sConfig.context] : []),
  ];

  const proc = spawn("kubectl", args, {
    stdio: ["ignore", "pipe", "pipe"],
  });
  watcherProcess = proc;

  let buffer = "";

  proc.stdout?.on("data", (chunk: Buffer) => {
    consecutiveFailures = 0;

    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const pod: PodEvent = JSON.parse(trimmed);
        const appId = extractAppId(pod);
        if (appId == null) continue;

        const newStatus = podPhaseToAgentStatus(pod);

        if (newStatus !== lastKnownStatus.get(appId)) {
          lastKnownStatus.set(appId, newStatus);

          // Clear debounce — state just changed, so the next subscribe
          // query must go to K8s fresh.
          clearDebounced(appId);

          broadcastAgentStatus(appId, newStatus);
          console.log(`[PodWatcher] app-${appId}: ${newStatus}`);
        }
      } catch {
        // Partial JSON or non-pod output
      }
    }
  });

  proc.stderr?.on("data", (chunk: Buffer) => {
    const msg = chunk.toString().trim();
    if (msg) {
      console.error(`[PodWatcher] stderr: ${msg}`);
    }
  });

  proc.on("close", (code) => {
    watcherProcess = null;

    if (code === 0 || code === null) return;

    consecutiveFailures++;
    const backoff = Math.min(1000 * Math.pow(2, consecutiveFailures - 1), MAX_BACKOFF_MS);
    console.warn(
      `[PodWatcher] exited with code ${code}, restarting in ${backoff}ms (attempt ${consecutiveFailures})`,
    );

    restartTimer = setTimeout(() => {
      restartTimer = null;
      startWatcher();
    }, backoff);
  });

  proc.on("error", (err) => {
    console.error(`[PodWatcher] spawn error:`, err.message);
    watcherProcess = null;

    // Schedule restart (the close event may not fire after a spawn error)
    consecutiveFailures++;
    const backoff = Math.min(1000 * Math.pow(2, consecutiveFailures - 1), MAX_BACKOFF_MS);
    console.warn(
      `[PodWatcher] scheduling restart in ${backoff}ms (attempt ${consecutiveFailures})`,
    );
    restartTimer = setTimeout(() => {
      restartTimer = null;
      startWatcher();
    }, backoff);
  });
}

/**
 * Stop the namespace watcher.
 */
export function stopAllWatchers(): void {
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  if (watcherProcess) {
    watcherProcess.kill("SIGTERM");
    watcherProcess = null;
  }

  lastKnownStatus.clear();
  recentQueries.clear();
  consecutiveFailures = 0;
}

/**
 * Clear all tracked state for a specific app (e.g. on container stop).
 */
export function clearAppWatchState(appId: number): void {
  lastKnownStatus.delete(appId);
  clearDebounced(appId);
}
