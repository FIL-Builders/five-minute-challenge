#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
latest_run_file="${REPO_ROOT}/runs/latest-run.txt"

if [[ ! -f "${latest_run_file}" ]]; then
  printf 'No latest run marker found at %s\n' "${latest_run_file}" >&2
  exit 1
fi

latest_run_id="$(cat "${latest_run_file}")"
run_dir="${REPO_ROOT}/runs/${latest_run_id}"

node "${REPO_ROOT}/scripts/upload-run-artifacts.mjs" \
  --repo-root "${REPO_ROOT}" \
  --run-dir "${run_dir}" \
  --summary "${run_dir}/run-summary.json" \
  --validation "${run_dir}/validation-result.json" \
  --bundle "${run_dir}/workspace-output.tgz"
