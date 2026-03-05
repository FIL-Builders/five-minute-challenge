#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
latest_run_file="${REPO_ROOT}/runs/latest-run.txt"

if [[ ! -f "${latest_run_file}" ]]; then
  printf 'No latest run marker found at %s\n' "${latest_run_file}" >&2
  exit 1
fi

latest_run_id="$(cat "${latest_run_file}")"
node "${REPO_ROOT}/scripts/publish-dashboard-records.mjs" \
  --repo-root "${REPO_ROOT}" \
  --run-dir "${REPO_ROOT}/runs/${latest_run_id}"
