#!/usr/bin/env bash
# Build (and optionally push) runtime images. Recipients use infra/dist/, not this repo.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

registry="${SCHEDULER_REGISTRY:-ghcr.io/khannas43}"
tag="${SCHEDULER_TAG:-1.0.0}"
api_image="${registry}/project-scheduler-api:${tag}"
web_image="${registry}/project-scheduler-web:${tag}"

echo "Building ${api_image}"
docker build -f infra/docker/api.Dockerfile -t "${api_image}" .

echo "Building ${web_image}"
docker build -f infra/docker/web.Dockerfile -t "${web_image}" .

if [[ "${PUSH:-0}" == "1" ]]; then
  echo "Pushing ${api_image}"
  docker push "${api_image}"
  echo "Pushing ${web_image}"
  docker push "${web_image}"
fi

echo
echo "Give the other team only infra/dist/ plus pull access to:"
echo "  SCHEDULER_API_IMAGE=${api_image}"
echo "  SCHEDULER_WEB_IMAGE=${web_image}"
echo "Push with: PUSH=1 $0"
