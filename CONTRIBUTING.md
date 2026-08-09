# Contributing

Holdfast's main invariant is simple: neither the detector nor one responder can
pause the vault. Changes that weaken evidence binding, responder uniqueness,
expiry, action binding, receipt idempotency, or target constraints are invalid.

## Development checks

```bash
npm install
cargo fmt --all --check
npx tsc --noEmit
npm test
./verify.sh phase-1
./verify.sh phase-2
./verify.sh phase-3
```

Do not run live devnet spikes as an ordinary local check: they fund accounts
and submit transactions. Every behavior change should include a regression
test. Failure tests must assert unchanged durable state, not only that a call
threw.
