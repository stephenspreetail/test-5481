#!/usr/bin/env bash
set -e

# Deploy Kova development certificates to dev01-eks-app-ro cluster
# Uses cert-manager to provision Let's Encrypt certificates for *.dev.toolkit.co

echo "=========================================="
echo "Deploying Kova Dev Certificates"
echo "=========================================="
echo ""

# Target cluster context
TARGET_CONTEXT="dev01-eks-app-ro"

# Switch to target context
if ! kubectl config use-context "${TARGET_CONTEXT}" &>/dev/null; then
  echo "❌ Failed to switch to context: ${TARGET_CONTEXT}"
  echo "   Available contexts:"
  kubectl config get-contexts -o name | sed 's/^/   - /'
  exit 1
fi

# Show current context
CONTEXT=$(kubectl config current-context)
echo "📋 Switched to context: ${CONTEXT}"
echo ""

# Verify cert-manager is installed
if ! kubectl get namespace cert-manager &>/dev/null; then
  echo "❌ cert-manager namespace not found"
  echo "   Ensure cert-manager is installed in the cluster"
  exit 1
fi

# Verify ClusterIssuer exists
if ! kubectl get clusterissuer letsencrypt-prod-issuer &>/dev/null; then
  echo "❌ ClusterIssuer 'letsencrypt-prod-issuer' not found"
  echo "   Ensure cert-manager issuers are configured"
  exit 1
fi

echo "✅ Prerequisites verified"
echo ""

# Ensure istio-system namespace exists
echo "📁 Ensuring istio-system namespace exists..."
kubectl create namespace istio-system --dry-run=client -o yaml | kubectl apply -f -

# Apply certificate manifest
echo "📦 Applying certificate manifest..."
kubectl apply -f manifests/certificates/kova-dev-cert.yaml

echo ""
echo "⏳ Waiting for certificate to be issued..."
echo "   (This may take 1-2 minutes for DNS01 challenge)"
echo ""

# Wait for certificate to be ready (max 5 minutes)
if kubectl wait --for=condition=Ready \
  --timeout=300s \
  certificate/kova-dev -n istio-system 2>/dev/null; then
  echo "✅ Certificate issued successfully"
else
  echo "⚠️  Certificate not ready yet"
  echo "   Check status with: kubectl describe certificate kova-dev -n istio-system"
fi

echo ""
echo "📋 Certificate status:"
kubectl get certificate kova-dev -n istio-system

echo ""
echo "📋 Secret created:"
kubectl get secret kova-tls-cert -n istio-system

echo ""
echo "✅ Deployment complete"
echo ""
echo "Certificate details:"
kubectl get certificate kova-dev -n istio-system \
  -o jsonpath='{.spec.dnsNames}' 2>/dev/null && echo "" || echo "Not available yet"

echo ""
echo "Next steps:"
echo "  1. DNS records: *.dev.toolkit.co → 127.0.0.1"
echo "  2. Copy certificate to local k3d:"
echo "     bun run scripts/copy-dev-cert-to-local.ts"
echo ""
