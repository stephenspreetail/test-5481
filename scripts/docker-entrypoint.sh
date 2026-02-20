#!/bin/sh
set -e

# Bootstrap kubeconfig for cross-cluster orchestration.
# When K8S_CLUSTER_NAME is set, the pod uses Pod Identity (IAM role) to
# authenticate against a remote EKS cluster via `aws eks update-kubeconfig`.
# This creates a kubeconfig context that kubectl uses for app-container management.
if [ -n "$K8S_CLUSTER_NAME" ]; then
  echo "[entrypoint] Bootstrapping kubeconfig for cluster: $K8S_CLUSTER_NAME"
  aws eks update-kubeconfig \
    --name "$K8S_CLUSTER_NAME" \
    --region "${AWS_REGION:-us-east-1}" \
    --kubeconfig /tmp/kubeconfig \
    --alias "$K8S_CLUSTER_NAME"
  export KUBECONFIG=/tmp/kubeconfig
  echo "[entrypoint] Kubeconfig ready"
fi

exec "$@"
