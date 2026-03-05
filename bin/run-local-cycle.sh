#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ALERTS_OUTPUT="${ALERTS_OUTPUT:-${REPO_ROOT}/alerts/latest-alerts.json}"

"${REPO_ROOT}/bin/run-benchmark.sh"
latest_run_file="${REPO_ROOT}/runs/latest-run.txt"
if [[ -f "${latest_run_file}" ]]; then
  latest_run_id="$(cat "${latest_run_file}")"
  node "${REPO_ROOT}/scripts/upload-run-artifacts.mjs" \
    --repo-root "${REPO_ROOT}" \
    --run-dir "${REPO_ROOT}/runs/${latest_run_id}" \
    --summary "${REPO_ROOT}/runs/${latest_run_id}/run-summary.json" \
    --validation "${REPO_ROOT}/runs/${latest_run_id}/validation-result.json" \
    --bundle "${REPO_ROOT}/runs/${latest_run_id}/workspace-output.tgz"
fi
node "${REPO_ROOT}/scripts/build-dashboard-feed.mjs" --repo-root "${REPO_ROOT}"
node "${REPO_ROOT}/scripts/check-alerts.mjs" \
  --repo-root "${REPO_ROOT}" \
  --feed "${REPO_ROOT}/dashboard/local-feed.json" \
  --output "${ALERTS_OUTPUT}"
