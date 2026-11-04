#!/usr/bin/env bash
# Single entry point the agent is allowed to call for running checks.
# Usage: run-tests.sh <frontend|backend> <typecheck|test|coverage> [test-file ...]
#   test-file paths are relative to the repository root.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
pkg="${1:-}"; action="${2:-}"; shift 2 || true

case "$pkg" in frontend|backend) ;; *) echo "error: package must be 'frontend' or 'backend'" >&2; exit 2 ;; esac
case "$action" in typecheck|test|coverage) ;; *) echo "error: action must be typecheck, test or coverage" >&2; exit 2 ;; esac

files=()
for f in "$@"; do
  # Only existing test files inside the package; reject anything that could be an option or escape.
  if [[ ! "$f" =~ ^${pkg}/[A-Za-z0-9_./-]+\.test\.tsx?$ || "$f" == *..* ]]; then
    echo "error: not an allowed test path: $f" >&2; exit 2
  fi
  [[ -f "$repo_root/$f" ]] || { echo "error: file not found: $f" >&2; exit 2; }
  files+=("${f#"$pkg"/}")
done

cd "$repo_root/$pkg"
export CI=true NO_COLOR=1
case "$action" in
  typecheck) exec npm run --silent typecheck ;;
  test)      exec ./node_modules/.bin/vitest run --reporter=dot "${files[@]}" ;;
  coverage)  exec ./node_modules/.bin/vitest run --coverage --coverage.reporter=text-summary --coverage.reporter=json-summary "${files[@]}" ;;
esac
