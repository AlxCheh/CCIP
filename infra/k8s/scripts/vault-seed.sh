#!/bin/sh
# Run after vault-0 in namespace vault is Ready.
# Dev-mode Vault: auto-unseal, root token = ccip-dev-root-token (see Task 9).
set -e

VEXEC="kubectl exec -n vault vault-0 --"
export VAULT_TOKEN=ccip-dev-root-token

echo "Enabling kubernetes auth method..."
$VEXEC vault auth enable kubernetes 2>&1 | grep -v "already enabled" || true

$VEXEC sh -c 'vault write auth/kubernetes/config kubernetes_host="https://$KUBERNETES_SERVICE_HOST:$KUBERNETES_SERVICE_PORT"'

echo "Writing policies..."
$VEXEC sh -c 'cat <<'"'"'EOF'"'"' | vault policy write ccip-api -
path "secret/data/ccip/api/*" { capabilities = ["read"] }
EOF'

$VEXEC sh -c 'cat <<'"'"'EOF'"'"' | vault policy write ccip-worker -
path "secret/data/ccip/worker/*" { capabilities = ["read"] }
EOF'

$VEXEC sh -c 'cat <<'"'"'EOF'"'"' | vault policy write ccip-pgbouncer -
path "secret/data/ccip/pgbouncer/*" { capabilities = ["read"] }
EOF'

echo "Binding K8s ServiceAccounts to Vault roles..."
$VEXEC vault write auth/kubernetes/role/ccip-api \
  bound_service_account_names=ccip-api \
  bound_service_account_namespaces=ccip \
  policies=ccip-api ttl=1h

$VEXEC vault write auth/kubernetes/role/ccip-worker \
  bound_service_account_names=ccip-sla-worker \
  bound_service_account_namespaces=ccip \
  policies=ccip-worker ttl=1h

$VEXEC vault write auth/kubernetes/role/ccip-pgbouncer \
  bound_service_account_names=ccip-pgbouncer \
  bound_service_account_namespaces=ccip \
  policies=ccip-pgbouncer ttl=1h

echo "Generating + writing secret material..."
PG_PASS=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
MINIO_PASS=$(openssl rand -hex 16)

$VEXEC vault kv put secret/ccip/api/database \
  user=ccip_owner password="$PG_PASS" dbname=ccip
$VEXEC vault kv put secret/ccip/api/jwt secret="$JWT_SECRET"
$VEXEC vault kv put secret/ccip/worker/database \
  user=ccip_owner password="$PG_PASS" dbname=ccip
$VEXEC vault kv put secret/ccip/worker/jwt secret="$JWT_SECRET"
$VEXEC vault kv put secret/ccip/pgbouncer/database \
  user=ccip_owner password="$PG_PASS" dbname=ccip

echo "Vault seed complete. Postgres bootstrap secret must match \$PG_PASS — see kind-up.sh."
echo "PG_PASS=$PG_PASS" > /tmp/ccip-vault-seed-output.env
echo "JWT_SECRET=$JWT_SECRET" >> /tmp/ccip-vault-seed-output.env
echo "MINIO_PASS=$MINIO_PASS" >> /tmp/ccip-vault-seed-output.env
