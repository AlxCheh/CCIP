#!/bin/sh
set -e

CLUSTER=ccip-dev
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

echo "=== 1. Create kind cluster ==="
kind create cluster --name "$CLUSTER" --config "$REPO_ROOT/infra/k8s/kind-config.yaml" || \
  echo "Cluster $CLUSTER already exists, reusing."

echo "=== 2. Install ingress-nginx ==="
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.11.2/deploy/static/provider/kind/deploy.yaml
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s

echo "=== 3. Install cert-manager CRDs + controller ==="
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.15.3/cert-manager.yaml
kubectl wait --namespace cert-manager \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/instance=cert-manager \
  --timeout=120s

echo "=== 4. Build + load application images ==="
docker build -f "$REPO_ROOT/apps/api/Dockerfile" -t ccip-api:local "$REPO_ROOT"
docker build -f "$REPO_ROOT/apps/web/Dockerfile" -t ccip-web:local "$REPO_ROOT"
docker build -t ccip-postgres:local "$REPO_ROOT/infra/docker/postgres"
kind load docker-image ccip-api:local --name "$CLUSTER"
kind load docker-image ccip-web:local --name "$CLUSTER"
kind load docker-image ccip-postgres:local --name "$CLUSTER"

echo "=== 5. Apply Vault (namespace + dev-server + injector) ==="
kubectl apply -k "$REPO_ROOT/infra/k8s/base/vault"
kubectl wait --namespace vault --for=condition=ready pod -l app.kubernetes.io/name=vault --timeout=120s

echo "=== 6. Seed Vault (policies, roles, generated secrets) ==="
sh "$SCRIPT_DIR/vault-seed.sh"
# shellcheck source=/dev/null
. /tmp/ccip-vault-seed-output.env

echo "=== 7. Apply namespace + bootstrap secrets (using Vault-generated PG_PASS) ==="
kubectl apply -f "$REPO_ROOT/infra/k8s/base/namespace.yaml"
kubectl create secret generic ccip-bootstrap-secrets -n ccip \
  --from-literal=postgres-password="$PG_PASS" \
  --from-literal=redis-password="$PG_PASS" \
  --from-literal=minio-user="ccip_minio" \
  --from-literal=minio-password="$MINIO_PASS" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "=== 8. Apply full dev overlay ==="
kubectl apply -k "$REPO_ROOT/infra/k8s/overlays/dev"

echo "=== 9. Wait for rollout ==="
kubectl rollout status statefulset/postgres -n ccip --timeout=120s
kubectl rollout status statefulset/redis -n ccip --timeout=120s
kubectl rollout status deployment/pgbouncer -n ccip --timeout=120s
kubectl rollout status deployment/minio -n ccip --timeout=120s
kubectl rollout status deployment/api -n ccip --timeout=180s
kubectl rollout status deployment/sla-worker -n ccip --timeout=180s
kubectl rollout status deployment/web -n ccip --timeout=120s

echo "=== 10. Ensure MinIO bucket exists ==="
kubectl run mc-mb --rm -i --restart=Never -n ccip --image=minio/mc:latest --command -- \
  sh -c "mc alias set local http://minio:9000 ccip_minio '$MINIO_PASS' && mc mb -p local/ccip-documents"

echo "=== Done. kubectl get pods -n ccip / -n vault to inspect. ==="
