#!/usr/bin/env bash
# Scan the monorepo against SonarQube (local default: http://localhost:9012).
# Prefers native scanner (pnpm sonarqube-scanner / brew). Docker image is amd64-only.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Optional local overrides (gitignored via .env.*)
if [[ -f "$ROOT/.env.sonar" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env.sonar"
  set +a
fi

SONAR_HOST_URL="${SONAR_HOST_URL:-http://localhost:9012}"
SONAR_TOKEN="${SONAR_TOKEN:-}"

if [[ -z "$SONAR_TOKEN" ]]; then
  echo "SONAR_TOKEN is required."
  echo "Create a user token in SonarQube → My Account → Security, then:"
  echo "  export SONAR_TOKEN=squ_..."
  echo "  # or write SONAR_TOKEN=... into .env.sonar (gitignored)"
  exit 1
fi

echo "→ Generating LCOV coverage"
# Cap Turbo parallelism so gantt/web coverage workers don't starve each other.
if ! pnpm test:coverage --concurrency=2; then
  echo "error: coverage generation failed — fix tests before scanning (LCOV required for gate metrics)." >&2
  exit 1
fi

run_scanner() {
  export SONAR_HOST_URL SONAR_TOKEN
  local args=(
    "-Dsonar.host.url=${SONAR_HOST_URL}"
    "-Dsonar.token=${SONAR_TOKEN}"
  )

  # 1) System install (brew install sonar-scanner)
  if command -v sonar-scanner >/dev/null 2>&1; then
    echo "→ Using native sonar-scanner ($(command -v sonar-scanner))"
    sonar-scanner "${args[@]}"
    return
  fi

  # 2) Repo-local npm wrapper (downloads host-native scanner JVM binary)
  if [[ -x "$ROOT/node_modules/.bin/sonar-scanner-npm" ]]; then
    echo "→ Using pnpm sonarqube-scanner (host-native binary)"
    pnpm exec sonar-scanner-npm "${args[@]}"
    return
  fi

  # 3) Docker — only useful on amd64 hosts (official image has no arm64)
  if command -v docker >/dev/null 2>&1; then
    local arch
    arch="$(uname -m)"
    if [[ "$arch" == "arm64" || "$arch" == "aarch64" ]]; then
      echo "error: sonarsource/sonar-scanner-cli has no linux/arm64 image." >&2
      echo "Install a native scanner instead:" >&2
      echo "  brew install sonar-scanner" >&2
      echo "  # or: pnpm add -Dw sonarqube-scanner && pnpm sonar" >&2
      exit 1
    fi
    echo "→ SonarQube scan via Docker (linux/amd64) → $SONAR_HOST_URL"
    docker run --rm \
      --network host \
      -e SONAR_HOST_URL="$SONAR_HOST_URL" \
      -e SONAR_TOKEN="$SONAR_TOKEN" \
      -v "$ROOT:/usr/src" \
      -w /usr/src \
      sonarsource/sonar-scanner-cli:11
    return
  fi

  echo "error: no sonar-scanner available." >&2
  exit 1
}

echo "→ SonarQube scan → $SONAR_HOST_URL (projectKey=project-scheduler)"
run_scanner

echo "→ Waiting for quality gate"
STATUS="$(curl -sS -u "${SONAR_TOKEN}:" \
  "${SONAR_HOST_URL}/api/qualitygates/project_status?projectKey=project-scheduler" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["projectStatus"]["status"])')"

echo "Quality gate: $STATUS"
if [[ "$STATUS" != "OK" ]]; then
  echo "Quality gate failed. Open ${SONAR_HOST_URL}/dashboard?id=project-scheduler"
  exit 1
fi
