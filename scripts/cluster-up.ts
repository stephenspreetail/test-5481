#!/usr/bin/env bun
/**
 * Cluster Up - Local K8s infrastructure with Istio.
 * Creates k3d cluster, installs Istio, sets up PostgreSQL.
 */
import { run, capture, check, hasCommand, kubectlApplyStdin, log } from "./lib/run";
import { copyDevCertToLocal } from "./copy-dev-cert-to-local";

const CLUSTER_NAME = "kova-dev";
const REGISTRY_NAME = "kova-registry";
const REGISTRY_PORT = "5555";
const DOMAIN = "dev.toolkit.co";
const APP_DOMAIN = `app.${DOMAIN}`;

log.step("Starting local Kubernetes cluster...");
console.log();

// Check if cluster already exists
const clusterList = capture("k3d", ["cluster", "list"]);
if (clusterList.includes(CLUSTER_NAME)) {
  log.success(`Cluster ${CLUSTER_NAME} already exists`);
  run("kubectl", ["config", "use-context", `k3d-${CLUSTER_NAME}`]);
} else {
  // Create registry if needed
  log.info("Creating local container registry...");
  const registryList = capture("k3d", ["registry", "list"]);
  if (!registryList.includes(REGISTRY_NAME)) {
    run("k3d", ["registry", "create", REGISTRY_NAME, "--port", REGISTRY_PORT]);
  }

  // Create cluster
  log.info("Creating k3d cluster...");
  run("k3d", [
    "cluster", "create", CLUSTER_NAME,
    "--registry-use", `k3d-${REGISTRY_NAME}:${REGISTRY_PORT}`,
    "--port", "80:80@loadbalancer",
    "--port", "443:443@loadbalancer",
    "--port", "8080:30080@server:0",
    "--port", "8443:30443@server:0",
    "--port", "5433:30433@server:0",
    "--api-port", "6550",
    "--servers", "1",
    "--agents", "2",
    "--volume", `${process.cwd()}:/workspace@all`,
    "--k3s-arg", "--disable=traefik@server:0",
  ]);

  // Create namespaces
  log.info("Creating namespaces...");
  run("kubectl", ["create", "namespace", "kova"]);
  run("kubectl", ["create", "namespace", "kova-apps"]);
  run("kubectl", ["create", "namespace", "istio-system"]);

  // Install Istio
  log.info("Installing Istio...");
  if (!hasCommand("istioctl")) {
    log.info("   Downloading istioctl...");
    const ISTIO_VERSION = "1.24.2";
    run("bash", [
      "-c",
      `curl -L https://istio.io/downloadIstio | ISTIO_VERSION=${ISTIO_VERSION} sh -`,
    ]);
    process.env.PATH = `${process.cwd()}/istio-${ISTIO_VERSION}/bin:${process.env.PATH}`;
  }

  run("istioctl", ["install", "--set", "profile=default", "-y"]);

  // Copy TLS certificate from EKS
  log.info("Copying TLS certificate from EKS...");
  copyDevCertToLocal();

  // Configure Istio Gateway
  log.info("Configuring Istio Gateway...");
  const gatewayYaml = `apiVersion: networking.istio.io/v1
kind: Gateway
metadata:
  name: kova-gateway
  namespace: istio-system
spec:
  selector:
    istio: ingressgateway
  servers:
  - port:
      number: 80
      name: http
      protocol: HTTP
    hosts:
    - "${DOMAIN}"
    - "*.${DOMAIN}"
    tls:
      httpsRedirect: true
  - port:
      number: 443
      name: https
      protocol: HTTPS
    hosts:
    - "${DOMAIN}"
    - "*.${DOMAIN}"
    tls:
      mode: SIMPLE
      credentialName: kova-tls-cert
---
apiVersion: v1
kind: Service
metadata:
  name: istio-ingressgateway-nodeport
  namespace: istio-system
spec:
  type: NodePort
  selector:
    istio: ingressgateway
  ports:
  - name: http
    port: 80
    targetPort: 8080
    nodePort: 30080
  - name: https
    port: 443
    targetPort: 8443
    nodePort: 30443`;

  kubectlApplyStdin(gatewayYaml);

  // Deploy PostgreSQL
  log.info("Deploying PostgreSQL...");
  run("kubectl", ["apply", "-f", "manifests/kova/postgres.yaml"]);
  log.info("   Waiting for PostgreSQL to be ready...");
  run("kubectl", [
    "wait", "--for=condition=ready",
    "pod", "-l", "app=postgres",
    "-n", "kova",
    "--timeout=120s",
  ]);
}

console.log();
log.success("Cluster is ready!");
console.log();
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log();
log.banner("Cluster info:");
console.log();
console.log(`   Name:            ${CLUSTER_NAME}`);
console.log(`   Registry:        localhost:${REGISTRY_PORT}`);
console.log(`   Domain:          ${DOMAIN}`);
console.log(`   App Domain:      ${APP_DOMAIN}`);
console.log();
console.log("   Namespaces:      kova, kova-apps, istio-system");
console.log("   Istio Gateway:   configured with Let's Encrypt TLS");
console.log("   PostgreSQL:      localhost:5433 (user: kova, password: kova_dev_password)");
console.log();
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log();
console.log("Add to /etc/hosts:");
console.log(`   sudo sh -c 'echo "127.0.0.1 ${DOMAIN} ${APP_DOMAIN}" >> /etc/hosts'`);
console.log();
console.log("Useful commands:");
console.log();
console.log("   View pods:       kubectl get pods -A");
console.log("   View services:   kubectl get svc -A");
console.log("   Stop cluster:    bun run scripts/cluster-down.ts");
console.log();
console.log("Next steps:");
console.log();
console.log("   1. Run migrations:   bun run db:push");
console.log("   2. Start Kova:       bun run dev:full");
console.log();
console.log("   Database URL: postgresql://kova:kova_dev_password@localhost:5433/kova");
console.log();
