#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UI_DIR="${REPO_ROOT}/dashboard/generated/ui"
HOST="${DASHBOARD_HOST:-127.0.0.1}"
PORT="${DASHBOARD_PORT:-3001}"

if [[ ! -d "${UI_DIR}" ]]; then
  printf 'Generated dashboard UI not found: %s\n' "${UI_DIR}" >&2
  printf 'Run npm run dashboard:generate first.\n' >&2
  exit 1
fi

node "${REPO_ROOT}/scripts/build-dashboard-feed.mjs" --repo-root "${REPO_ROOT}"

if [[ ! -d "${UI_DIR}/node_modules" ]]; then
  (cd "${UI_DIR}" && pnpm install --frozen-lockfile)
fi

cd "${UI_DIR}"
pnpm dev --hostname "${HOST}" --port "${PORT}"
