#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${MODE:-fresh-follow-docs}"
MODEL="${MODEL:-gpt-5.3-codex}"
DOCS_URL="${DOCS_URL:-https://docs.filecoin.cloud/getting-started/}"
CODEX_PACKAGE="${CODEX_PACKAGE:-@openai/codex@alpha}"

default_prompt_version() {
  case "$1" in
    fresh-follow-docs) printf '%s\n' "fresh-follow-docs-v1" ;;
    scripted-regression) printf '%s\n' "scripted-regression-v1" ;;
    *) printf 'Unsupported MODE: %s\n' "$1" >&2; exit 1 ;;
  esac
}

PROMPT_VERSION="${PROMPT_VERSION:-$(default_prompt_version "${MODE}")}"
PROMPT_FILE="${PROMPT_FILE:-prompts/${PROMPT_VERSION}.md}"

if [[ ! -f "${REPO_ROOT}/${PROMPT_FILE}" ]]; then
  printf 'Prompt file not found: %s\n' "${REPO_ROOT}/${PROMPT_FILE}" >&2
  exit 1
fi

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
printf '%s\n' "${run_id}" > "${REPO_ROOT}/runs/latest-run.txt"
cp "${REPO_ROOT}/${PROMPT_FILE}" "${run_dir}/prompt.md"
printf '%s\n' "${PROMPT_VERSION}" > "${run_dir}/prompt-version.txt"
printf '%s\n' "${MODE}" > "${run_dir}/mode.txt"

docs_snapshot_hash=""
if curl -LfsS "${DOCS_URL}" -o "${run_dir}/docs-snapshot.html"; then
  docs_snapshot_hash="$(sha256sum "${run_dir}/docs-snapshot.html" | awk '{print $1}')"
  printf '%s\n' "${docs_snapshot_hash}" > "${run_dir}/docs-snapshot.sha256"
else
  printf 'warning: failed to capture docs snapshot from %s\n' "${DOCS_URL}" > "${run_dir}/docs-snapshot-error.txt"
fi

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
  export BENCHMARK_DOCS_SNAPSHOT_HASH="${docs_snapshot_hash}"
  unset PRIVATE_KEY
  unset DASHBOARD_PRIVATE_KEY
  unset ARTIFACT_PUBLISH_PRIVATE_KEY
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
  --docs-snapshot-hash "${docs_snapshot_hash}" \
  --started-at "${started_at}" \
  --ended-at "${ended_at}" \
  --start-ms "${start_ms}" \
  --end-ms "${end_ms}" \
  --agent-exit-code "${agent_exit_code}"

printf 'Run complete: %s\n' "${run_id}"
printf 'Artifacts: %s\n' "${run_dir}"
