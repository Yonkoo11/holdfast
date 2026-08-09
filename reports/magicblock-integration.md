# MagicBlock integration evidence

Status: live-proven on MagicBlock/Solana devnet.

## Pinned surface

- Rust `ephemeral-rollups-sdk` 0.16.2; TypeScript client SDK 0.14.3
- Anchor compatibility feature for Anchor 0.32.1
- Access-control feature for ER-local permissions
- Devnet TEE validator `MTEW...3xzo`

## Implemented path

1. `open_incident` reads the real test-vault account, matches its withdrawal
   amount and sequence, reconstructs pre-withdrawal TVL, and accepts only a
   strict breach above 20%.
2. `delegate_incident` can target only the configured MagicBlock TEE validator.
3. `init_private_permission` creates one private ER-local permission whose only
   members are the controller's three responders.
4. `approve` accepts each responder once, rejects altered action hashes, and
   changes the incident to approved at two signatures.
5. `commit_and_pause` commits the incident and schedules exactly one Magic
   Action. The base action calls `execute_pause`, which signs a constrained CPI
   into the separate test-vault program.
6. A base-layer action receipt distinguishes an approved/committed incident
   from a pause that actually executed and blocks replay.

## Live evidence

- Holdfast program: `EjU7sFMStj15r1NVrzgVbRJBdjUTUGbgyzHvFzEaaZuz`
- Test vault program: `H9pEwKaL9JwCjYj1ZgmVbZ6AAHHRyXMd4HZfSi1GZaBy`
- Private-read result: incident `77WPx1EeNsrbGShtSgjSU1TLi1gfYXrsGHwkdZTa52tC`;
  permission transaction `5CArkiD7SzQxxPGTJSxBVChtk4Sqfd5izeP7WydXYHbZpGsVmQsuUKBE9j9wubXRHqNjWaihiAeeiaCR2QBAXgbH`.
  An authorized token-bound responder read the incident and a separately
  authenticated outsider received no incident account.
- Successful action: two responder approvals
  `3M143o2TqfJ5HKmsVpXmvH2gdhzkwSmeHC9dX3jhy3ryvCntLYeV1cLptXQmkmmQaEk3Mi5U6ErijsfSGVNF4sEF`
  and `2orZLpAS7gPTKtJBKR946QdK56Q92VQpxu3qBSWTM3cvrFpk3v88XiRf69VnZAawApLxVdgGbeKkut7AaM4SpVpn`;
  ER schedule `3aWpBCNvV1wENfaBb81PNBPHx6RdS6RqkjBHhoXECX6sKpE5hZK4THdTU5xJu4ghzXM2941vW7EFLNeMs5we24sD`;
  base commitment `RuwPBAyPh5ESzqJASP1oKRNLGCwhuok1b2jaLta3NLFKBYmmVy13yeWPH1q9KZoSf2ZqbJxvwAW6ynXi3Wm1mcA`.
  The receipt reached `Executed` and the vault was paused.

## Observed failed action semantics

MagicBlock's v0.16.2 developer reference says an attempted base transaction
applies its commit and actions atomically, but the committor may remove failed
BaseActions and retry the remaining commit strategy. Therefore an ER scheduling
signature or a successful later commit is not containment evidence.

Holdfast treats `receipt.status == Executed` plus `vault.paused == true` as the
success condition. A committed approved incident with a pending receipt is an
explicit reconciliation state, not a success.

The devnet spike deliberately initialized a vault with the wrong pause
authority. It recorded:

- ER schedule `DJLrZjB4MrR2xyViGxiADjoV1KWnYLL2Y7fp43BEGEZL9vhL4CCyasWWGCKDkrekoHYifvbRSkRqBehtnbHmyri`
- base commitment `BvizyEqbRfhkdw5KBDVkz1D6SkgAAiC466aVTzw5XjKYAvcfHeSqAaYYTXb91tjFys98Ss6LbqnKwM73MKGkJy6`
- incident `BeHmHxPkM5ztAJ2WyrR23Pd8LusqZK9MMCFsk6yh3Xhv`
- unchanged `Pending` receipt
- unpaused vault

This demonstrates the committor's observable recovery behavior: the incident
commit lands even when the attached action cannot satisfy the target program's
authority check. Holdfast does not report containment until both durable state
conditions are true.

## Current verification

- `cargo check --workspace`: pass
- Focused Rust suites: pass, 3 test-vault tests and 10 Holdfast tests
- `npm run test:detector`: pass, 10 tests
- `npm run test:operator-model`: pass, 4 tests
- Phase 1, Phase 2, and Phase 3 gates: pass, 2/2 each
- Anchor/SBF build: pass for both programs
- Devnet privacy test: pass
- Devnet Magic Action success test: pass
- Devnet Magic Action failed-safe test: pass
