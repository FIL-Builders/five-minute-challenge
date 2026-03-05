#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOKENHOST_REPO="${TOKENHOST_REPO:-$HOME/dev/tokenhost/tokenhost-builder}"
SCHEMA_PATH="${REPO_ROOT}/dashboard/schema.json"
OUT_DIR="${REPO_ROOT}/dashboard/generated"
HOST="${DASHBOARD_HOST:-127.0.0.1}"
PORT="${DASHBOARD_PORT:-3001}"
CHAIN="${DASHBOARD_CHAIN:-filecoin_calibration}"
PRIVATE_KEY="${DASHBOARD_PRIVATE_KEY:-${PRIVATE_KEY:-}}"

if [[ ! -d "${TOKENHOST_REPO}" ]]; then
  printf 'Token Host Builder repo not found: %s\n' "${TOKENHOST_REPO}" >&2
  exit 1
fi

if [[ -z "${PRIVATE_KEY}" ]]; then
  printf 'Set DASHBOARD_PRIVATE_KEY or PRIVATE_KEY to run dashboard schema deployment against %s.\n' "${CHAIN}" >&2
  exit 1
fi

cd "${TOKENHOST_REPO}"
pnpm th up "${SCHEMA_PATH}" \
  --out "${OUT_DIR}" \
  --chain "${CHAIN}" \
  --private-key "${PRIVATE_KEY}" \
  --host "${HOST}" \
  --port "${PORT}" \
  --no-start-anvil
