# Holdfast security audit

Date: 2026-08-09. Scope: Devnet hackathon build. Production and mainnet are excluded.

## 1. Threat actor inventory

Unauthorized wallets, a compromised responder, a malicious detector, replaying clients, RPC providers returning stale or malformed data, alert floods, and an operator who mistakes a commit for containment.

## 2. Assets to protect

Responder identities and approvals, the fixed action hash, pause authority, incident integrity, public receipt accuracy, vault availability, and the credibility of the contained status.

## 3. Trust boundary definition

The browser and detector are untrusted. Anchor account constraints enforce base-layer authority. MagicBlock TEE permissions protect private incident state. Solana receipt and vault accounts are the final public outcome record.

## 4. Authorization expectations

Observers may read public proof without a wallet. Only configured responders may read or approve private incident state. Two distinct responders are required. The detector may open a bound incident but cannot pause the vault.

## 5. Input validation principles

The program binds controller, vault, program, responder set, TEE validator, evidence, incident ID, action hash, expiry, and receipt. The browser validates RPC status, owners, Anchor discriminators, account lengths, receipt status, nonzero execution slot, paused flag, and matching incident IDs.

## 6. Abuse-prone actions and controls

Duplicate, unauthorized, altered, expired, unilateral, and replayed approvals fail without increasing quorum. Incident opening is deduplicated across restarts. Public proof reads are read-only and time out after ten seconds.

## 7. Misuse scenarios and responses

- One responder repeats approval: onchain duplicate rejection.
- Detector reports fabricated withdrawal: vault reconstruction and sequence binding reject it.
- Action target changes: action-hash and account constraints reject it.
- Commit lands but pause fails: receipt remains pending and the UI says unpaused.
- RPC lies or returns malformed data: proof verification fails closed.

## 8. Abuse detection signals

Webhook delivery failures, repeated incident-open attempts, permission denials, duplicate approvals, altered hashes, expiry failures, pending receipts after commitment, and receipt-vault disagreement.

## 9. Blast radius containment strategy

One controller binds one test vault and one fixed pause action. No arbitrary CPI target is accepted. No production funds or mainnet accounts are in scope.

## 10. Security failure behavior

The UI never infers containment from an ER schedule or commitment alone. Stale reads are labelled. Public-proof errors are visible and retryable. Onchain writes are never retried silently.

## 11. Dependency scanning setup

`npm audit` reports 0 critical, 0 high, 6 moderate, and 2 low advisories. `cargo audit` reports RUSTSEC-2026-0235 in `rkyv 0.7.46`, transitively required by MagicBlock SDK 0.16.2, plus three maintenance warnings. MagicBlock 0.16.2 is the newest published crate, so there is no compatible upstream upgrade today.

## 12. SAST tool configuration

Semgrep `auto` scanned 29 source files with 227 applicable rules and reported 0 findings. TypeScript `tsc --noEmit` passes. A literal dangerous-API scan found only local HTTP test URLs and SVG namespaces.

## 13. Secret scanning setup

TruffleHog 3.93.1 scanned 488,928 bytes and reported 0 verified and 0 unverified secrets. The deterministic final gate also rejects key-shaped material in source directories.

## 14. CI/CD security integration

Not configured because no standalone public repository or CI pipeline exists yet. Required before production: type check, tests, Semgrep, TruffleHog, `npm audit --audit-level=high`, and `cargo audit` with an explicit upstream exception policy.

## 15. OWASP Top 10 compliance

Score: 31/40 applicable checks. Strong areas are access control, secure design, integrity, input validation, and fail-closed behavior. Missing production controls are deployed security-header verification, centralized security monitoring, CI enforcement, and a clean Rust dependency audit.

## 16. Security tool summary

Semgrep: pass. TruffleHog: pass. npm audit high/critical gate: pass. cargo audit: fail on one transitive vulnerability. Program abuse suites: pass. Browser proof agreement and disagreement tests: pass.

## 17. Security risk assessment

Decision: GO for a Devnet-only hackathon submission. NO-GO for production or mainnet. The blocking production risk is RUSTSEC-2026-0235 in the current MagicBlock SDK dependency tree. The responder UI is also a local interaction preview, not a production transaction client.

## 18. Kill switches

The operator can stop at observer mode. Approval cannot proceed without a wallet. Quorum cannot proceed with one signer. The action cannot switch targets. Any receipt-vault disagreement prevents the contained state.

## 19. Compliance checklists

SOC 2, GDPR, HIPAA, PCI DSS, and ISO 27001 certification are not claimed. Holdfast stores no user profile or payment data in this prototype. A production deployment would require formal control ownership, retention policy, access review, incident response, and vendor risk assessment.
