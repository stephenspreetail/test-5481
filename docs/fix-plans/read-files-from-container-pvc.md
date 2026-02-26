# Plan: Read Files from Running App Containers

## Context

The `GET /api/apps/:id/files` endpoint reads files from the **host filesystem** at `{APPS_BASE_PATH}/{appPath}/{filePath}`. But when the agent creates files inside a container (e.g., `BD_Prospecting_workflow.md`), those files exist only in the container's **PVC** at `/workspace/` — not on the host. The frontend's "Build App" button calls `readAppFile()` and gets a 404.

This affects ALL agent-generated files — not just workflow docs. `FileEditor`, `SecurityPanel`, and `useParseRouter` also call this endpoint and would fail on any file the agent created.

## Approach: Container-First with Host Fallback

Add `readFileFromContainer` to the orchestrator (using `kubectl exec <pod> -- cat <path>`), then modify the files endpoint to try the container first when it's running, falling back to the host filesystem.

**Container-first** is correct because:
- When a container is running, its PVC is the authoritative source — the agent writes there
- The host directory is only a staging area; it may be stale or missing agent-generated files
- If the container read fails, we silently fall back to host (backward compatible)

## Implementation

### Step 1: Add `readFileFromContainer` to interface

**File**: `backend/src/services/orchestrator/types.ts`

After `copyFileToContainer`, add:
```typescript
readFileFromContainer(appId: number, containerPath: string): Promise<string>;
```

### Step 2: Implement in `KubectlOrchestrator`

**File**: `backend/src/services/orchestrator/kubectl.orchestrator.ts`

After `copyFileToContainer` method (~line 812), add:
```typescript
async readFileFromContainer(appId: number, containerPath: string): Promise<string> {
  const podName = (
    await this.kubectl(
      "get", "pod", "-l", `kova.app-id=${appId}`,
      "-n", this.options.namespace,
      "-o", "jsonpath={.items[0].metadata.name}"
    )
  ).trim();
  if (!podName) {
    throw new Error(`No running pod found for app ${appId}`);
  }
  // kubectl exec -- cat returns file content on stdout
  // The existing kubectl() helper uses execFileAsync which captures stdout as string
  return this.kubectl("exec", podName, "-n", this.options.namespace, "--", "cat", containerPath);
}
```

Unlike `copyFileToContainer` (which needed `spawn` + stdin pipe), reading can use the existing `kubectl()` helper since `execFileAsync` captures stdout as a string — perfect for `cat` output.

### Step 3: Add wrappers to `AppContainerService`

**File**: `backend/src/services/app-container.service.ts`

After `copyFileToContainer` (~line 497), add:
```typescript
async readFileFromContainer(appId: number, containerPath: string): Promise<string> {
  return orchestrator.readFileFromContainer(appId, containerPath);
}

isContainerRunning(appId: number): boolean {
  const containerInfo = appContainers.get(appId);
  return containerInfo?.state === "running" && containerInfo.containerId !== null;
}
```

`isContainerRunning` is synchronous (in-memory map lookup) — zero overhead when no container is running.

### Step 4: Modify `GET /api/apps/:id/files` endpoint

**File**: `backend/src/api/routes/apps.routes.ts` (lines 615-627)

Replace the try/catch that does `readFileSync` with:
```typescript
const containerPath = `/workspace/${normalizedFilePath}`;

if (appContainerService.isContainerRunning(appId)) {
  try {
    const content = await appContainerService.readFileFromContainer(appId, containerPath);
    return { content };
  } catch (containerError: any) {
    // File may not exist in container — fall through to host
    console.log(
      `[apps.routes] Container read failed for app ${appId}, falling back to host.`
    );
  }
}

// Fallback: host filesystem (original behavior)
try {
  const content = readFileSync(fullPath, "utf-8");
  return { content };
} catch (error: any) {
  if (error.code === "ENOENT") {
    reply.status(404).send({ error: "File not found" });
    return;
  }
  console.error("[apps.routes] Error reading file:", error);
  reply.status(500).send({ error: "Failed to read file" });
  return;
}
```

`appContainerService` is already imported on line 9 — no new imports needed.

### No Frontend Changes Required

All callers (`ChatInput.handleBuildApp`, `FileEditor`, `SecurityPanel`, `useParseRouter`) use the same `GET /api/apps/:id/files` endpoint — the fix is transparent.

## Files to Modify

| File | Change |
|------|--------|
| `backend/src/services/orchestrator/types.ts` | Add `readFileFromContainer` to interface |
| `backend/src/services/orchestrator/kubectl.orchestrator.ts` | Implement using `kubectl exec -- cat` |
| `backend/src/services/app-container.service.ts` | Add `readFileFromContainer` wrapper + `isContainerRunning` helper |
| `backend/src/api/routes/apps.routes.ts` | Container-first read with host fallback |

## Behavior Matrix

| Scenario | Before | After |
|----------|--------|-------|
| File on host, no container | Returns content | Same |
| File NOT on host, container running, file IN container | **404 (BUG)** | **Returns content (FIXED)** |
| File NOT on host, no container | 404 | Same |
| File on host AND in container | Returns host (stale) | Returns container (authoritative) |
| Container read fails, file on host | N/A | Falls back to host |

## Verification

1. Restart backend: `bun run dev:backend`
2. Upload an Excel file via the hub page workflow
3. Wait for planning step to complete (agent writes `_workflow.md` to container)
4. Click "Build App" — should succeed (no 404)
5. Open `FileEditor` on agent-generated files — should load content
6. Stop a container, verify host-side files still readable (fallback works)
