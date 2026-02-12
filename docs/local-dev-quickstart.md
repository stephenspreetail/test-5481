# Local Development Setup

From zero to a working local k3d cluster with end-to-end sandbox validation.

## Prerequisites

### Required tools

| Tool | Check | Install |
|------|-------|---------|
| Bun | `bun --version` | [bun.sh](https://bun.sh) |
| Docker | `docker info` | Docker Desktop / Rancher Desktop |
| k3d | `k3d version` | `brew install k3d` or [k3d.io](https://k3d.io) |
| kubectl | `kubectl version --client` | `brew install kubectl` |
| istioctl | `istioctl version` | `brew install istioctl` or [istio.io/downloadIstio](https://istio.io/latest/docs/setup/getting-started/#download) |

### Required access

| Resource | Why | How to get it |
|----------|-----|---------------|
| `dev01-eks-app-ro` kubectl context | `cluster-up` copies the Let's Encrypt wildcard TLS cert (`*.dev.toolkit.co`) from this EKS cluster to your local k3d | Request EKS read-only access through IT; run `aws eks update-kubeconfig --name dev01-eks-app --alias dev01-eks-app-ro --region us-east-1` |
| LLM API key | Agent needs an LLM provider to generate code | See `.env.example` for Azure Foundry (default), direct Anthropic, or AWS Bedrock options |
| ProGet API key | App containers install `@spreetail` npm packages at runtime | Find in [GitLab CI/CD variables](https://gitlab.com/spreetail/engineering/scaled-innovation/app-builder/-/settings/ci_cd) |

Verify your EKS context works before proceeding:

```bash
kubectl --context=dev01-eks-app-ro get secret kova-tls-cert -n istio-system
```

If this returns a secret, you're good. If not, the cert may need to be provisioned first — see [TLS certificate provisioning](#tls-certificate-provisioning) below.

## Getting started

### 1. Clone and install

```bash
git clone git@gitlab.com:spreetail/engineering/scaled-innovation/app-builder.git
cd app-builder
bun install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Generate security keys and fill in `.env`:

```bash
# Generate JWT_SECRET and ENCRYPTION_KEY (both require: openssl rand -hex 32)
openssl rand -hex 32   # paste as JWT_SECRET
openssl rand -hex 32   # paste as ENCRYPTION_KEY
```

Required values:

```bash
# LLM provider (Azure Foundry is the default)
LLM_PROVIDER=azure
ANTHROPIC_API_KEY=<your-azure-foundry-key>

# Database (default for local k3d PostgreSQL)
DATABASE_URL=postgresql://kova:kova_dev_password@localhost:5433/kova

# Security
JWT_SECRET=<64-char hex from openssl>
ENCRYPTION_KEY=<64-char hex from openssl>

# Spreetail internal
PROGET_API_KEY=<your-proget-key>
```

See `.env.example` for the full list of options (data platform, Bedrock, model overrides, etc.).

### 3. Create the k3d cluster

```bash
bun run scripts/cluster-up.ts
```

This single command:
- Creates a local k3d container registry (`kova-registry` on port 5555)
- Spins up a 3-node k3d cluster (`kova-dev`)
- Installs Istio service mesh with an ingress gateway
- Copies the Let's Encrypt wildcard TLS cert from `dev01-eks-app-ro` to local k3d
- Configures an Istio Gateway with HTTPS for `*.dev.toolkit.co`
- Deploys PostgreSQL on `localhost:5433`
- Creates namespaces: `kova`, `kova-apps`, `istio-system`

### 4. Add DNS entry

App previews are served at `app-{id}.dev.toolkit.co:8443`. You need a local DNS entry.

```bash
# Linux / macOS / WSL2
sudo sh -c 'echo "127.0.0.1 dev.toolkit.co app.dev.toolkit.co" >> /etc/hosts'
```

On **Windows** (not using WSL2), edit `C:\Windows\System32\drivers\etc\hosts`.

> Wildcard DNS (`*.dev.toolkit.co`) doesn't work in `/etc/hosts`. For per-app entries, add `app-{id}.dev.toolkit.co`. For true wildcard support, use [dnsmasq](https://thekelleys.org.uk/dnsmasq/doc.html) or a local DNS resolver.

### 5. Label the kova-apps namespace

```bash
kubectl apply -f manifests/kova/namespace-kova-apps.yaml
```

This applies the `kova.dev/cluster-name=k3d-kova-dev` label used by integration tests to verify cluster identity.

### 6. Build the app-container image

```bash
bun run container:rebuild
```

Builds the Docker image and imports it into k3d so pods can pull it locally.

### 7. Push database schema

```bash
bun run db:push
```

### 8. Seed the dev user

The seed script calls the REST API, so the backend must be running.

In one terminal, start the backend:

```bash
bun run dev:backend
```

In a second terminal, create the dev user:

```bash
bun run --cwd backend seed:dev-user
```

You can stop the backend in the first terminal after seeding (Ctrl+C). It will start again in the next step.

Dev credentials: `dev@kova.local` / `devpassword123`

### 9. Start developing

```bash
bun run dev:full
```

Open http://localhost:5174/login and sign in with the dev credentials.

### 10. Validate with sandbox tests

```bash
# Quick smoke test — verifies auth, CRUD, K8s connectivity
bun run sandbox 00-smoke

# Full end-to-end — sends a prompt to the agent, creates a K8s pod, validates output
bun run sandbox 01-hello-world
```

Expected smoke test output:

```
[PASS] kubectl is available
[PASS] K8s cluster reachable via context k3d-kova-dev
[PASS] K8s namespace kova-apps exists
[PASS] Cluster identity verified: kova.dev/cluster-name=k3d-kova-dev
[PASS] Backend is ready
[PASS] Authenticated as dev@kova.local (id=1)
[PASS] Test passed: 00-smoke
Results: 1 passed, 0 failed
```

## Teardown

```bash
bun run scripts/cluster-down.ts            # Keep registry (faster restart)
bun run scripts/cluster-down.ts --volumes  # Full cleanup: registry + certs + istio
```

## Daily workflow

After initial setup, your daily routine is:

```bash
# If cluster was stopped
k3d cluster start kova-dev

# Start developing
bun run dev:full
```

If you've changed `app-container/` or `packages/agent/`, rebuild the image:

```bash
bun run container:rebuild
```

## TLS certificate provisioning

The local dev TLS cert is a real Let's Encrypt wildcard cert for `*.dev.toolkit.co`, provisioned via cert-manager on the `dev01-eks-app-ro` EKS cluster. `cluster-up.ts` copies it to your local k3d automatically.

If the cert doesn't exist yet (first-time team setup or cert expired), provision it:

```bash
./scripts/deploy-local-dev-certs.sh
```

This requires `dev01-eks-app-ro` context with write access and cert-manager configured in the cluster. The cert auto-renews via cert-manager once provisioned.

## Troubleshooting

**`cluster-up.ts` fails at "Copying TLS certificate from EKS"**
Your `dev01-eks-app-ro` kubectl context is missing or the secret doesn't exist. Check:
```bash
kubectl --context=dev01-eks-app-ro get secret kova-tls-cert -n istio-system
```
If the secret is missing, run `./scripts/deploy-local-dev-certs.sh` (requires write access).

**Pod networking issues on VPN?**
Pods use `hostNetwork: true` by default in local mode, which lets VPN split-tunneling work for npm/apt.

**Backend won't start (missing packages)?**
```bash
bun install
```

**Schema out of date?**
```bash
bun run db:push
```

**App container image not found by k3d?**
```bash
bun run container:rebuild
```

**Wrong kubectl context?**
The sandbox injects `K8S_CONTEXT=k3d-kova-dev` automatically — your active kubectl context doesn't matter.

**App preview not loading in browser?**
Check that `/etc/hosts` has an entry for `app-{id}.dev.toolkit.co` pointing to `127.0.0.1`. You need one entry per app, or use a local DNS resolver for wildcards.
