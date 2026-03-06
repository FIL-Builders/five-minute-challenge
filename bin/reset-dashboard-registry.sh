#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"${REPO_ROOT}/bin/up-dashboard-app.sh"
"${REPO_ROOT}/bin/republish-dashboard-history.sh"
