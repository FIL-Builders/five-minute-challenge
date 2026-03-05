#!/usr/bin/env bash
set -euo pipefail

# Local manual scheduler entry point.
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/bin/run-benchmark.sh"
