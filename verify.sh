#!/usr/bin/env bash
# Holdfast done predicates. This file starts red on purpose.
# Never weaken a predicate to match a broken build.

set -uo pipefail
cd "$(dirname "$0")"

FILTER="${1:-}"
pass=0
fail=0

check() {
  local tag="$1" desc="$2"
  shift 2
  if [ -n "$FILTER" ] && [ "$tag" != "$FILTER" ]; then return 0; fi
  if "$@" >/dev/null 2>&1; then
    printf '  PASS  [%s] %s\n' "$tag" "$desc"
    pass=$((pass + 1))
  else
    printf '  FAIL  [%s] %s\n' "$tag" "$desc"
    fail=$((fail + 1))
  fi
}

checksh() {
  local tag="$1" desc="$2" cmd="$3"
  check "$tag" "$desc" sh -c "$cmd"
}

echo "== Holdfast verify =="

check phase-0 "TEE permission and privacy spike passes" npm run test:spike:privacy
check phase-0 "cross-program Magic Action spike passes" npm run test:spike:action
check phase-0 "failed Magic Action remains visibly unresolved" npm run test:spike:action-failure
checksh phase-0 "observed failure semantics are recorded" 'test -s reports/magicblock-integration.md && grep -qi "failed action" reports/magicblock-integration.md'

check phase-1 "vault behavior passes" npm run test:vault
check phase-1 "detector opens one incident and alerts under ten seconds" npm run test:detector

check phase-2 "private quorum and permission tests pass" npm run test:quorum
check phase-2 "approval abuse cases pass" npm run test:approval-abuse

check phase-3 "commit and containment path passes" npm run test:containment
check phase-3 "action idempotency and failure cases pass" npm run test:action-failures

check phase-4 "operator browser flow passes" npm run test:e2e
check phase-4 "operator application builds" npm run build

checksh final "all automated tests pass" 'test -s package.json && npm test'
check final "clean production build passes" npm run build
checksh final "public docs contain setup and trust model" 'test -s README.md && grep -qiE "^#+ (setup|reproduce|quick start)" README.md && grep -qi "trust model" README.md'
checksh final "public artifacts exist" 'test -s LICENSE && test -s CONTRIBUTING.md && test -s SECURITY.md'
checksh final "source tree exists and contains no key-shaped secrets" 'test -d programs && test -d services && test -d app && ! grep -RqsE "(0x[a-fA-F0-9]{64}|BEGIN [A-Z ]*PRIVATE KEY|PRIVATE_KEY[[:space:]]*=[[:space:]]*[^$])" programs services app'

echo
printf 'passed %d, failed %d\n' "$pass" "$fail"

cat <<'MANUAL'

manual:
  [ ] Brand mark is legible at 16px and does not look like a generic shield.
  [ ] The operator screen makes evidence, quorum, and outcome obvious without narration.
  [ ] Unauthorized RPC inspection does not reveal private approval details.
  [ ] Explorer state agrees with the UI after containment.
  [ ] Demo copy sounds like a security operator wrote it.
MANUAL

[ "$fail" -eq 0 ] || exit 1
