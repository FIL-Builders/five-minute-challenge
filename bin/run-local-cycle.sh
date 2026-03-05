#!/usr/bin/env bash
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ALERTS_OUTPUT="${ALERTS_OUTPUT:-${REPO_ROOT}/alerts/latest-alerts.json}"
CYCLE_STATUS_TMP="$(mktemp)"

benchmark_status=0
upload_status=0
publish_status=0
feed_status=0
alerts_status=0
latest_run_id=""
cycle_status_path=""

record_status() {
  node -e '
const fs = require("fs");
const file = process.argv[1];
const key = process.argv[2];
const value = Number(process.argv[3]);
let data = {};
if (fs.existsSync(file)) {
  try {
    const raw = fs.readFileSync(file, "utf8").trim();
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }
}
data[key] = value;
fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
' "${CYCLE_STATUS_TMP}" "$1" "$2"
}

write_cycle_status() {
  if [[ -z "${cycle_status_path}" ]]; then
    cycle_status_path="${REPO_ROOT}/alerts/latest-cycle-status.json"
  fi

  node -e '
const fs = require("fs");
const file = process.argv[1];
const out = process.argv[2];
const latestRunId = process.argv[3] || null;
let data = {};
if (fs.existsSync(file)) {
  try {
    const raw = fs.readFileSync(file, "utf8").trim();
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }
}
data.generatedAt = new Date().toISOString();
data.latestRunId = latestRunId;
data.success = Object.entries(data)
  .filter(([key]) => key.endsWith("_status"))
  .every(([, value]) => Number(value) === 0);
fs.writeFileSync(out, `${JSON.stringify(data, null, 2)}\n`);
' "${CYCLE_STATUS_TMP}" "${cycle_status_path}" "${latest_run_id}"
}

"${REPO_ROOT}/bin/run-benchmark.sh" || benchmark_status=$?
record_status benchmark_status "${benchmark_status}"
latest_run_file="${REPO_ROOT}/runs/latest-run.txt"
if [[ -f "${latest_run_file}" ]]; then
  latest_run_id="$(cat "${latest_run_file}")"
  cycle_status_path="${REPO_ROOT}/runs/${latest_run_id}/cycle-status.json"
  node "${REPO_ROOT}/scripts/upload-run-artifacts.mjs" \
    --repo-root "${REPO_ROOT}" \
    --run-dir "${REPO_ROOT}/runs/${latest_run_id}" \
    --summary "${REPO_ROOT}/runs/${latest_run_id}/run-summary.json" \
    --validation "${REPO_ROOT}/runs/${latest_run_id}/validation-result.json" \
    --bundle "${REPO_ROOT}/runs/${latest_run_id}/workspace-output.tgz" || upload_status=$?
  record_status upload_status "${upload_status}"
  if [[ "${PUBLISH_DASHBOARD_APP:-0}" == "1" ]]; then
    node "${REPO_ROOT}/scripts/publish-dashboard-records.mjs" \
      --repo-root "${REPO_ROOT}" \
      --run-dir "${REPO_ROOT}/runs/${latest_run_id}" || publish_status=$?
  fi
  record_status publish_status "${publish_status}"
fi
node "${REPO_ROOT}/scripts/build-dashboard-feed.mjs" --repo-root "${REPO_ROOT}" || feed_status=$?
record_status feed_status "${feed_status}"
node "${REPO_ROOT}/scripts/check-alerts.mjs" \
  --repo-root "${REPO_ROOT}" \
  --feed "${REPO_ROOT}/dashboard/local-feed.json" \
  --output "${ALERTS_OUTPUT}" || alerts_status=$?
record_status alerts_status "${alerts_status}"

write_cycle_status
rm -f "${CYCLE_STATUS_TMP}"

if (( benchmark_status != 0 || upload_status != 0 || publish_status != 0 || feed_status != 0 )); then
  exit 1
fi

if (( alerts_status != 0 )); then
  exit "${alerts_status}"
fi
