#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOKENHOST_REPO="${TOKENHOST_REPO:-$HOME/dev/tokenhost/tokenhost-builder}"
SCHEMA_PATH="${REPO_ROOT}/dashboard/schema.json"
OUT_DIR="${REPO_ROOT}/dashboard/generated"

if [[ ! -d "${TOKENHOST_REPO}" ]]; then
  printf 'Token Host Builder repo not found: %s\n' "${TOKENHOST_REPO}" >&2
  exit 1
fi

if [[ ! -f "${OUT_DIR}/compiled/App.json" ]]; then
  printf 'Missing %s. Run npm run dashboard:generate or npm run dashboard:up first.\n' "${OUT_DIR}/compiled/App.json" >&2
  exit 1
fi

cd "${TOKENHOST_REPO}"
pnpm th ui sync "${SCHEMA_PATH}" --out "${OUT_DIR}" --with-tests
