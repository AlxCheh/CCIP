#!/bin/sh
# Run ONCE locally by the plan author/reviewer, result is committed.
# Helm is used only as a generator — output YAML is committed and applied
# via kubectl/kustomize without Helm at runtime (see spec §5/§11).
set -e

helm repo add hashicorp https://helm.releases.hashicorp.com
helm repo update

helm template vault hashicorp/vault \
  --namespace vault \
  --set "injector.enabled=true" \
  --set "server.dev.enabled=true" \
  --set "server.dev.devRootToken=ccip-dev-root-token" \
  --set "server.dataStorage.enabled=false" \
  --set "server.standalone.enabled=true" \
  > infra/k8s/base/vault/rendered/vault-helm.yaml

echo "Rendered $(wc -l < infra/k8s/base/vault/rendered/vault-helm.yaml) lines to infra/k8s/base/vault/rendered/vault-helm.yaml"
