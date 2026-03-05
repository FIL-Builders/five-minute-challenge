#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${MODE:-fresh-follow-docs}"
MODEL="${MODEL:-gpt-5.3-codex}"
PROMPT_FILE="${PROMPT_FILE:-prompt.md}"
PROMPT_VERSION="${PROMPT_VERSION:-fresh-follow-docs-v1}"
DOCS_URL="${DOCS_URL:-https://docs.filecoin.cloud/getting-started/}"
CODEX_PACKAGE="${CODEX_PACKAGE:-@openai/codex@alpha}"

timestamp="$(date -u +"%Y%m%dT%H%M%SZ")"
suffix="$(hexdump -n 3 -e '/1 "%02x"' /dev/urandom)"
run_id="${timestamp}-${suffix}"
run_dir="${REPO_ROOT}/runs/${run_id}"
workspace="$(mktemp -d "${TMPDIR:-/tmp}/fil-cloud-benchmark-${run_id}-XXXXXX")"

mkdir -p "${run_dir}"
cleanup() {
  if [[ "${KEEP_WORKSPACE:-0}" != "1" ]]; then
    rm -rf "${workspace}"
  fi
}
trap cleanup EXIT

printf '%s\n' "${run_id}" > "${run_dir}/run-id.txt"
cp "${REPO_ROOT}/${PROMPT_FILE}" "${run_dir}/prompt.md"

repo_sha="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
started_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
start_ms="$(node -e 'console.log(Date.now())')"

stdout_log="${run_dir}/stdout.log"
stderr_log="${run_dir}/stderr.log"

set +e
(
  cd "${workspace}"
  export BENCHMARK_RUN_ID="${run_id}"
  export BENCHMARK_MODE="${MODE}"
  export BENCHMARK_PROMPT_VERSION="${PROMPT_VERSION}"
  export BENCHMARK_DOCS_URL="${DOCS_URL}"
  npx --yes "${CODEX_PACKAGE}" --model "${MODEL}" --dangerously-bypass-approvals-and-sandbox exec "$(cat "${REPO_ROOT}/${PROMPT_FILE}")"
) >"${stdout_log}" 2>"${stderr_log}"
agent_exit_code=$?
set -e

ended_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
end_ms="$(node -e 'console.log(Date.now())')"

for path in report.md run-result.json agent.log uploaded-payload.txt downloaded-payload.txt; do
  if [[ -f "${workspace}/${path}" ]]; then
    cp "${workspace}/${path}" "${run_dir}/${path}"
  fi
done

tar \
  --exclude='./node_modules' \
  --exclude='./.git' \
  -czf "${run_dir}/workspace-output.tgz" \
  -C "${workspace}" .

node "${REPO_ROOT}/scripts/finalize-run.mjs" \
  --repo-root "${REPO_ROOT}" \
  --run-dir "${run_dir}" \
  --workspace "${workspace}" \
  --run-id "${run_id}" \
  --mode "${MODE}" \
  --model "${MODEL}" \
  --prompt-version "${PROMPT_VERSION}" \
  --repo-sha "${repo_sha}" \
  --docs-url "${DOCS_URL}" \
  --started-at "${started_at}" \
  --ended-at "${ended_at}" \
  --start-ms "${start_ms}" \
  --end-ms "${end_ms}" \
  --agent-exit-code "${agent_exit_code}"

printf 'Run complete: %s\n' "${run_id}"
printf 'Artifacts: %s\n' "${run_dir}"
