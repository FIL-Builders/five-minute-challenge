#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

node "${REPO_ROOT}/scripts/publish-dashboard-history.mjs" \
  --repo-root "${REPO_ROOT}" \
  --force "1"
