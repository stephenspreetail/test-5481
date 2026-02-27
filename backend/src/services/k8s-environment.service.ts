/**
 * Kubernetes Environment Service
 *
 * Maps application K8s environment configuration to orchestrator settings.
 * Similar to LLM provider abstraction - each environment has sensible defaults.
 *
 * Supported environments:
 * - local: Local k3d development cluster
 * - eks-dev: EKS development cluster
 * - eks-prod: EKS production cluster
 */

import { config } from "../config/index.js";
import { getDefaultInstanceId } from "../utils/app-identifiers.js";

export type K8sEnvironment = "local" | "eks-app-admin" | "eks-dev" | "eks-prod";

export interface K8sEnvironmentConfig {
  environment: K8sEnvironment;
  context: string;
  namespace: string;
  previewDomain: string;
  previewPort: number;
  // Whether this is an EKS cluster (affects networking mode)
  isEKS: boolean;
  // Cluster identifier (stored in DB to track app locations)
  // Example: "dev01-eks-app-admin", "dev01-eks-ops", "k3d-kova-dev"
  clusterIdentifier: string;
  // Container image for app pods (local uses k3d-imported image, EKS uses ECR)
  containerImage: string;
  // StorageClass for PVCs (local uses local-path, EKS uses EBS)
  storageClass: string;
  // Unique identifier for this Kova deployment instance (for multi-tenancy)
  instanceId: string;
  // Preview URL mode: "prefixed" uses app-{shortId}.domain, "slug" uses {slug}.domain
  previewUrlMode: "prefixed" | "slug";
}

/**
 * Environment-specific Kubernetes configuration
 */
interface EnvironmentDefaults {
  context: string;
  namespace: string;
  previewDomain: string;
  previewPort: number;
  isEKS: boolean;
  clusterIdentifier: string;
  containerImage: string;
  storageClass: string;
}

const ECR_IMAGE =
  "851725519214.dkr.ecr.us-east-1.amazonaws.com/scaled-innovation/kova-app-container:latest";

const ENVIRONMENT_DEFAULTS: Record<K8sEnvironment, EnvironmentDefaults> = {
  // Local k3d development (hostNetwork + Istio ingress via HTTPS)
  local: {
    context: "k3d-kova-dev",
    namespace: "kova-apps",
    previewDomain: "dev.toolkit.co",
    previewPort: 8443,
    isEKS: false,
    clusterIdentifier: "k3d-kova-dev",
    containerImage: "kova-app-container:latest",
    storageClass: "local-path",
  },

  // EKS app cluster (local dev orchestrating against real EKS)
  "eks-app-admin": {
    context: "dev01-eks-app-admin",
    namespace: "kova-apps",
    previewDomain: "app.eks.dev01.tk.dev",
    previewPort: 443,
    isEKS: true,
    clusterIdentifier: "dev01-eks-app-admin",
    containerImage: ECR_IMAGE,
    storageClass: "ebs-sc",
  },

  // EKS development cluster (kova cluster — cross-cluster from dev01-eks-app)
  // Entrypoint bootstraps kubeconfig via `aws eks update-kubeconfig --alias`
  "eks-dev": {
    context: "dev01-eks-kova",
    namespace: "kova-apps",
    previewDomain: "kova.eks.dev01.tk.dev",
    previewPort: 443,
    isEKS: true,
    clusterIdentifier: "dev01-eks-kova",
    containerImage: ECR_IMAGE,
    storageClass: "ebs-sc",
  },

  // EKS production cluster
  "eks-prod": {
    context: "arn:aws:eks:us-east-1:851725519214:cluster/prod-eks-kova",
    namespace: "kova-apps",
    previewDomain: "kova.eks.prod.tk.dev",
    previewPort: 443,
    isEKS: true,
    clusterIdentifier: "prod-eks-kova",
    containerImage: ECR_IMAGE,
    storageClass: "ebs-sc",
  },
};

/**
 * Detect K8s environment from configuration
 * Falls back to "local" if not explicitly set
 */
export function detectK8sEnvironment(): K8sEnvironment {
  // Explicit environment config takes precedence
  if (config.K8S_ENVIRONMENT) {
    return config.K8S_ENVIRONMENT as K8sEnvironment;
  }

  // Default to local
  return "local";
}

/**
 * Build K8s environment config from application config
 */
export function buildK8sEnvironmentConfig(): K8sEnvironmentConfig {
  const environment = detectK8sEnvironment();
  const defaults = ENVIRONMENT_DEFAULTS[environment];

  return {
    environment,
    // Allow explicit overrides, otherwise use environment defaults
    context: config.K8S_CONTEXT || defaults.context,
    namespace: config.K8S_NAMESPACE || defaults.namespace,
    previewDomain: config.PREVIEW_DOMAIN || defaults.previewDomain,
    previewPort: config.PREVIEW_PORT || defaults.previewPort,
    isEKS: defaults.isEKS,
    clusterIdentifier: defaults.clusterIdentifier,
    containerImage: config.CONTAINER_IMAGE !== "kova-app-container:latest"
      ? config.CONTAINER_IMAGE // Explicit override takes precedence
      : defaults.containerImage,
    storageClass: defaults.storageClass,
    instanceId: config.KOVA_INSTANCE_ID || getDefaultInstanceId(),
    previewUrlMode: config.PREVIEW_URL_MODE || "prefixed",
  };
}
