# Multi-Tenancy & Helm Refactor Plan

## Problem

Multiple Kova deployments (dev instances, local development, staging) all orchestrate app containers against the same target cluster (`dev01-eks-kova`). The current naming scheme `app-{serial_integer_id}` guarantees collisions — two Kova instances will both try to create `app-1`, `app-2`, etc.

## Goals

1. **Globally unique K8s resource names** — no collisions across Kova deployments
2. **Helm chart per app** — declarative, versionable app infrastructure (Deployment, Service, VirtualService, PVC)
3. **User-friendly slugs** — human-readable names for apps (e.g., `my-todo-app`)
4. **Preserve integer IDs** — API routes, database FKs, and internal references stay as-is

## New Identifier Model

Each app gets three identifiers:

| Identifier | Format | Purpose | Example |
|---|---|---|---|
| `id` (existing) | Serial integer | DB primary key, API routes, internal refs | `42` |
| `guid` (new) | UUIDv4 | Canonical globally unique identifier | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` |
| `shortId` (new) | First 8 chars of guid | K8s resource names, DNS labels | `a1b2c3d4` |
| `slug` (new) | User-defined, validated | Display name, human-friendly URLs | `my-todo-app` |

### Why `shortId` Instead of Full GUID

- K8s labels have a 63-character limit; DNS labels have a 63-character limit
- Resource names like `{instanceId}-{shortId}-workspace` must be concise
- 8 hex chars = 4 billion combinations — collision-free at our scale
- If paranoid: DB unique constraint on `guid` (and therefore `shortId`) catches it at insert time

### Instance Identifier

Each Kova deployment gets a short **instance ID** (e.g., `dev`, `local-gabe`, `staging`). This is set via environment variable `KOVA_INSTANCE_ID`. This prefixes all K8s resources to provide namespace-level isolation without requiring separate K8s namespaces.

**K8s resource naming pattern**: `{instanceId}-{shortId}`

Examples:
- `dev-a1b2c3d4` (deployment, service, virtualservice)
- `dev-a1b2c3d4-workspace` (PVC)
- `app-a1b2c3d4.dev.toolkit.co` (preview URL — no instance prefix in DNS for cleanliness)

## Database Changes

### Migration: Add `guid` and `slug` to `apps` table

```sql
ALTER TABLE apps ADD COLUMN guid UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE apps ADD COLUMN slug VARCHAR(100);
ALTER TABLE apps ADD UNIQUE (guid);
ALTER TABLE apps ADD UNIQUE (slug);  -- per-user unique, or globally unique TBD
```

### Drizzle Schema Update

```typescript
// In backend/src/db/schema.ts
export const apps = pgTable("apps", {
  id: serial("id").primaryKey(),
  guid: uuid("guid").notNull().defaultRandom().unique(),
  slug: varchar("slug", { length: 100 }),
  // ... existing fields
});
```

### Backfill Strategy

For existing apps, a migration script generates UUIDs and derives slugs from the `name` field:

```typescript
// Backfill: UPDATE apps SET guid = gen_random_uuid() WHERE guid IS NULL;
// Backfill: UPDATE apps SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9-]', '-', 'g'));
```

### Computed `shortId`

Not stored — derived at runtime: `app.guid.replace(/-/g, '').substring(0, 8)`. Add a helper:

```typescript
// backend/src/utils/app-identifiers.ts
export function shortId(guid: string): string {
  return guid.replace(/-/g, "").substring(0, 8);
}

export function k8sName(instanceId: string, guid: string): string {
  return `${instanceId}-${shortId(guid)}`;
}
```

## Helm Chart: `kova-app`

### Location: `helm/kova-app/`

A new Helm chart that encapsulates all K8s resources for a single app container.

### Chart Structure

```
helm/kova-app/
├── Chart.yaml
├── values.yaml            # Default values
├── templates/
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── virtualservice.yaml
│   ├── pvc.yaml
│   └── _helpers.tpl
```

### `Chart.yaml`

```yaml
apiVersion: v2
name: kova-app
description: Infrastructure for a single Kova application container
type: application
version: 0.1.0
```

### `values.yaml`

```yaml
# Identity
instanceId: "dev"          # Kova deployment instance
appShortId: ""             # Required: 8-char hex from app GUID
appGuid: ""                # Full GUID (for labels/annotations)
appId: ""                  # Integer ID (for labels only)
userId: ""                 # Owner user ID (for labels)

# Container
image:
  repository: "kova-app-container"
  tag: "latest"
  pullPolicy: IfNotPresent

# Ports
ports:
  agent: 3100
  dev: 3000

# Resources
resources:
  requests:
    memory: "4Gi"
    cpu: "1"
  limits:
    memory: "4Gi"
    cpu: "1"

# Storage
storage:
  size: "5Gi"
  storageClass: "ebs-sc"

# Networking
networking:
  hostNetwork: false
  previewDomain: "dev.toolkit.co"
  gatewayName: "istio-system/kova-gateway"

# Environment variables (passed as map)
env: {}
```

### `templates/_helpers.tpl`

```yaml
{{- define "kova-app.name" -}}
{{ .Values.instanceId }}-{{ .Values.appShortId }}
{{- end }}

{{- define "kova-app.labels" -}}
app.kubernetes.io/managed-by: kova
kova.dev/instance: {{ .Values.instanceId }}
kova.dev/app-guid: {{ .Values.appGuid }}
kova.dev/app-id: {{ .Values.appId | quote }}
kova.dev/user-id: {{ .Values.userId | quote }}
{{- end }}

{{- define "kova-app.selectorLabels" -}}
kova.dev/instance: {{ .Values.instanceId }}
kova.dev/app-guid: {{ .Values.appGuid }}
{{- end }}
```

### `templates/deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "kova-app.name" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "kova-app.labels" . | nindent 4 }}
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels:
      {{- include "kova-app.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "kova-app.labels" . | nindent 8 }}
    spec:
      {{- if .Values.networking.hostNetwork }}
      hostNetwork: true
      {{- end }}
      containers:
        - name: app
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: agent
              containerPort: {{ .Values.ports.agent }}
            - name: dev
              containerPort: {{ .Values.ports.dev }}
          env:
            {{- range $key, $value := .Values.env }}
            - name: {{ $key }}
              value: {{ $value | quote }}
            {{- end }}
          volumeMounts:
            - name: workspace
              mountPath: /workspace
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
      volumes:
        - name: workspace
          persistentVolumeClaim:
            claimName: {{ include "kova-app.name" . }}-workspace
```

### `templates/service.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ include "kova-app.name" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "kova-app.labels" . | nindent 4 }}
spec:
  type: ClusterIP
  selector:
    {{- include "kova-app.selectorLabels" . | nindent 4 }}
  ports:
    - name: agent
      port: {{ .Values.ports.agent }}
      targetPort: agent
    - name: dev
      port: {{ .Values.ports.dev }}
      targetPort: dev
```

### `templates/virtualservice.yaml`

```yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: {{ include "kova-app.name" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "kova-app.labels" . | nindent 4 }}
spec:
  hosts:
    - "app-{{ .Values.appShortId }}.{{ .Values.networking.previewDomain }}"
  gateways:
    - {{ .Values.networking.gatewayName }}
  http:
    - match:
        - uri:
            prefix: "/agent/"
      rewrite:
        uri: "/"
      route:
        - destination:
            host: {{ include "kova-app.name" . }}
            port:
              number: {{ .Values.ports.agent }}
    - match:
        - uri:
            prefix: "/"
      route:
        - destination:
            host: {{ include "kova-app.name" . }}
            port:
              number: {{ .Values.ports.dev }}
```

### `templates/pvc.yaml`

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: {{ include "kova-app.name" . }}-workspace
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "kova-app.labels" . | nindent 4 }}
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: {{ .Values.storage.storageClass }}
  resources:
    requests:
      storage: {{ .Values.storage.size }}
```

## Orchestrator Refactor

### Replace `kubectl apply` with `helm upgrade --install`

The `KubectlOrchestrator` currently builds JSON manifests in code and applies them via `kubectl apply`. Replace this with Helm:

```typescript
// backend/src/services/orchestrator/helm.orchestrator.ts

class HelmOrchestrator implements ContainerOrchestrator {

  async spawnContainer(config: SpawnContainerConfig): Promise<ContainerInfo> {
    const sid = shortId(config.appGuid);
    const releaseName = k8sName(this.instanceId, config.appGuid);

    await this.helmUpgrade(releaseName, {
      instanceId: this.instanceId,
      appShortId: sid,
      appGuid: config.appGuid,
      appId: config.appId.toString(),
      userId: config.userId.toString(),
      "image.repository": this.containerImage.split(":")[0],
      "image.tag": this.containerImage.split(":")[1] || "latest",
      "ports.agent": config.agentPort,
      "ports.dev": config.devPort,
      "storage.storageClass": this.storageClass,
      "networking.hostNetwork": (!this.isEKS).toString(),
      "networking.previewDomain": this.previewDomain,
      // Flatten env map into helm --set values
      ...Object.fromEntries(
        Object.entries(config.env).map(([k, v]) => [`env.${k}`, v])
      ),
    });

    return this.buildContainerInfo(config.appGuid);
  }

  async stopContainer(appGuid: string): Promise<void> {
    // Scale to 0 via helm upgrade with replicas=0
    // Or: kubectl scale deployment {name} --replicas=0
    const releaseName = k8sName(this.instanceId, appGuid);
    await this.kubectl("scale", "deployment", releaseName, "--replicas=0");
  }

  async deletePersistentStorage(appGuid: string): Promise<void> {
    // helm uninstall removes deployment, service, virtualservice, PVC
    const releaseName = k8sName(this.instanceId, appGuid);
    await this.helmUninstall(releaseName);
  }

  private async helmUpgrade(releaseName: string, values: Record<string, any>) {
    const args = [
      "upgrade", "--install", releaseName,
      "./helm/kova-app",
      "--namespace", this.namespace,
      "--wait", "--timeout", "180s",
    ];
    for (const [key, value] of Object.entries(values)) {
      args.push("--set", `${key}=${value}`);
    }
    await execFileAsync("helm", args);
  }
}
```

### Key Changes in Orchestrator

| Current (`kubectl.orchestrator.ts`) | New (`helm.orchestrator.ts`) |
|---|---|
| Builds JSON manifests in TypeScript | Helm chart templates |
| `kubectl apply -f -` with stdin | `helm upgrade --install` |
| `app-{intId}` naming | `{instanceId}-{shortId}` naming |
| `kubectl delete` for cleanup | `helm uninstall` for cleanup |
| Separate PVC/Deploy/Svc/VS creation | Single `helm upgrade` creates all |
| Port in resource names | GUID-based, port-independent |

### Interface Changes

```typescript
// backend/src/services/orchestrator/types.ts
export interface SpawnContainerConfig {
  appId: number;        // Keep for env vars / logging
  appGuid: string;      // NEW: for K8s resource naming
  userId: number;
  appPath: string;
  image: string;
  env: Record<string, string>;
}
```

## App Container Service Changes

### `app-container.service.ts`

The service currently maps `appId → container`. Refactor to pass `appGuid` through to the orchestrator while keeping `appId` for the in-memory map and API layer.

```typescript
export interface StartContainerConfig {
  appId: number;
  appGuid: string;    // NEW
  userId: number;
  appPath: string;
}
```

The container name changes from `app-{appId}` to `{instanceId}-{shortId}`:

```typescript
const containerName = k8sName(this.instanceId, cfg.appGuid);
```

Preview URL changes from `app-{appId}.domain` to `app-{shortId}.domain`:

```typescript
const appPreviewHost = `app-${shortId(cfg.appGuid)}.${k8sEnv.previewDomain}`;
```

### In-Memory Map

Keep `Map<number, AppContainerInfo>` keyed by integer `appId` — this is only used within a single Kova instance. The GUID is what goes onto K8s resources.

### Scanner Changes

Container scanning needs to use the new label scheme:

```typescript
// Current: match /^app-(\d+)$/
// New: match by label selector kova.dev/instance={instanceId}
// Parse appGuid from kova.dev/app-guid label, look up appId from DB or label
```

## Environment Configuration

### New Environment Variable

```
KOVA_INSTANCE_ID=dev          # Short identifier for this Kova deployment
```

Add to `.env.example`, `config/index.ts`, and Helm values for the Kova backend chart.

### Local Development

For local dev, default `KOVA_INSTANCE_ID` to a generated value like `local-{username}` or just `local`:

```typescript
const instanceId = config.KOVA_INSTANCE_ID || `local-${os.userInfo().username}`;
```

## API Route Changes

**No changes needed.** API routes continue to use integer IDs:

- `GET /api/apps/:id` — integer ID lookup
- `POST /api/apps/:id/run` — looks up app by integer ID, passes GUID to orchestrator
- `DELETE /api/apps/:id` — looks up app by integer ID, uses GUID for helm uninstall

The GUID is an internal orchestration detail. The slug is exposed for display purposes.

### New Fields in API Responses

```typescript
// App response now includes:
{
  id: 42,
  guid: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  slug: "my-todo-app",
  name: "My Todo App",
  // ... existing fields
}
```

## Migration Strategy

### Phase 1: Schema + Identifiers (No K8s changes)

1. Add `guid` and `slug` columns to `apps` table
2. Backfill existing apps with generated UUIDs
3. Generate slugs from existing `name` field
4. Add `shortId()` and `k8sName()` utility functions
5. Add `KOVA_INSTANCE_ID` to config
6. Update API responses to include new fields

### Phase 2: Helm Chart + New Orchestrator

1. Create `helm/kova-app/` chart
2. Implement `HelmOrchestrator` alongside existing `KubectlOrchestrator`
3. Feature flag: `USE_HELM_ORCHESTRATOR=true` switches between them
4. Test with new apps (new apps get Helm, existing apps use kubectl)

### Phase 3: Migration of Existing Apps

1. For each existing running app:
   - Stop the container (scale to 0)
   - `helm upgrade --install` with the new naming scheme
   - Delete old `app-{intId}` resources
2. Can be done gradually, app by app
3. Once all migrated, remove `KubectlOrchestrator`

### Phase 4: Cleanup

1. Remove `KubectlOrchestrator`
2. Remove feature flag
3. Update documentation

## Slug Validation Rules

```typescript
function validateSlug(slug: string): boolean {
  // 3-60 characters, lowercase alphanumeric + hyphens
  // Must start and end with alphanumeric
  // No consecutive hyphens
  return /^[a-z0-9]([a-z0-9-]{1,58}[a-z0-9])?$/.test(slug);
}
```

Slugs are optional — apps without slugs are identified by their integer ID or shortId in the UI.

## Summary of Files to Change

### New Files
- `helm/kova-app/` — entire chart directory
- `backend/src/utils/app-identifiers.ts` — shortId, k8sName helpers
- `backend/src/services/orchestrator/helm.orchestrator.ts` — new orchestrator

### Modified Files
- `backend/src/db/schema.ts` — add `guid`, `slug` columns
- `backend/src/services/app-container.service.ts` — pass GUID, new naming
- `backend/src/services/orchestrator/types.ts` — add `appGuid` to config
- `backend/src/services/orchestrator/index.ts` — factory for Helm orchestrator
- `backend/src/services/k8s-environment.service.ts` — add `instanceId`
- `backend/src/config/index.ts` — add `KOVA_INSTANCE_ID`
- `backend/src/api/routes/apps.routes.ts` — expose guid/slug in responses
- `backend/src/api/routes/app-execution.routes.ts` — pass guid to container service
- `.env.example` — add `KOVA_INSTANCE_ID`

### Unchanged
- Frontend code (URLs come from backend, no hardcoded patterns)
- API route paths (still use integer IDs)
- Database relationships (all FKs remain integer-based)
- `helm/kova/` (Kova backend deployment — separate concern)
