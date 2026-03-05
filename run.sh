#!/usr/bin/env bash
set -euo pipefail

# Temporary manual entry point for prompt iteration.
# The long-term benchmark harness should replace this with a fresh-workspace runner
# that captures canonical outer timing and writes to runs/<run-id>/.
npx --yes @openai/codex@alpha --model gpt-5.3-codex --dangerously-bypass-approvals-and-sandbox exec "$(cat prompt.md)"
