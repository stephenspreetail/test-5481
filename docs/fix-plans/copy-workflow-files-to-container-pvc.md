# Plan: Copy Workflow Files into App Container PVC

## Context

When a user uploads a file (Excel workbook, UI mockup) via the "Excel Workflow" or "Image Forge" feature on the hub page, the backend:
1. Writes the decoded file to the host filesystem at `${APPS_BASE_PATH}/${userId}/${appId}-${timestamp}/${fileName}`
2. Starts an app container via `kubectl.orchestrator`
3. The container gets a fresh **PersistentVolumeClaim** mounted at `/workspace`

**Problem**: The file exists on the host filesystem but the PVC is empty — the file never gets copied into the container. The agent then fails with `"File does not exist"` when it tries to read the uploaded file.

**There is no existing file transfer mechanism** — no `kubectl cp`, no upload endpoint, no init container, no shared volume. This is a missing feature.

## Recommended Approach: `kubectl cp` After Pod Ready

Add a `copyFileToContainer` method to the `KubectlOrchestrator` and call it from `workflow-app.routes.ts` after the container starts and is ready.

### Why This Approach

| Approach | Verdict |
|----------|---------|
| **kubectl cp** | **Best fit** — simple, uses existing kubectl infrastructure, no new endpoints needed, works with PVC |
| POST to container API | Would require a new upload endpoint, multipart handling, and auth — more code for same result |
| Init container + shared volume | Over-engineered — requires hostPath or NFS setup, complex for local dev |
| hostPath mount | Security risk, doesn't work on EKS (different host), breaks PVC persistence model |
| Base64 in prompt | File size limits, bloats context window, can't handle binary formats properly |
| ConfigMap/Secret | 1MB size limit, not designed for binary files |

### Why `kubectl cp` Is Safe Here

- The `spawnContainer` method already waits for rollout (`kubectl rollout status`) before returning
- The backend already has a `waitForContainerReady()` health check loop
- `kubectl cp` to a running pod with a writable PVC is a standard K8s pattern
- The file copy happens **before** the first chat prompt is sent, so there's no race condition

## Implementation Plan

### Step 1: Add `copyFileToContainer` to `KubectlOrchestrator`

**File**: `backend/src/services/orchestrator/kubectl.orchestrator.ts`

Add a new public method:

```typescript
async copyFileToContainer(appId: number, localPath: string, containerPath: string): Promise<void> {
  const deploymentName = `app-${appId}`;
  // Get the pod name from the deployment
  const podName = await this.kubectl(
    "get", "pod", "-l", `kova.app-id=${appId}`,
    "-n", this.options.namespace,
    "-o", "jsonpath={.items[0].metadata.name}"
  );
  if (!podName.trim()) {
    throw new Error(`No running pod found for app ${appId}`);
  }
  // kubectl cp <local> <namespace>/<pod>:<container-path>
  await this.kubectl(
    "cp", localPath,
    `${this.options.namespace}/${podName.trim()}:${containerPath}`
  );
}
```

### Step 2: Add `copyFileToContainer` to the interface

**File**: `backend/src/services/orchestrator/types.ts`

Add to `ContainerOrchestrator` interface:

```typescript
copyFileToContainer(appId: number, localPath: string, containerPath: string): Promise<void>;
```

### Step 3: Expose via `AppContainerService`

**File**: `backend/src/services/app-container.service.ts`

Add a thin wrapper:

```typescript
async copyFileToContainer(appId: number, localPath: string, containerPath: string): Promise<void> {
  await orchestrator.copyFileToContainer(appId, localPath, containerPath);
}
```

### Step 4: Call from `workflow-app.routes.ts`

**File**: `backend/src/api/routes/workflow-app.routes.ts`

After `startContainer()` (line 132-136), add:

```typescript
// 4. Start container for this app
await appContainerService.startContainer({ ... });

// 5. Copy workflow file into container workspace
const localFilePath = path.join(appDir, fileName);
await appContainerService.copyFileToContainer(
  newApp.id,
  localFilePath,
  `/workspace/${fileName}`
);

app.log.info(`Copied workflow file to container for app ${newApp.id}`);
```

Renumber subsequent steps (current step 5 → step 6).

## Files to Modify

| File | Change |
|------|--------|
| `backend/src/services/orchestrator/types.ts` | Add `copyFileToContainer` to interface |
| `backend/src/services/orchestrator/kubectl.orchestrator.ts` | Implement `copyFileToContainer` method |
| `backend/src/services/app-container.service.ts` | Add passthrough wrapper |
| `backend/src/api/routes/workflow-app.routes.ts` | Call copy after container starts |

## Verification

1. **Rebuild app-container** (not needed — change is backend-only)
2. **Start the backend**: `bun run dev:backend`
3. **Upload an Excel file** via the hub page workflow
4. **Check container**: `kubectl exec -it <pod> -n kova-apps -- ls /workspace/` — the uploaded file should be present
5. **Verify agent succeeds**: The agent should be able to `Read` the file without "File does not exist" error
6. **Check logs**: Backend should log `Copied workflow file to container for app X`
