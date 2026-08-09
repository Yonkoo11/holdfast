# Security policy

Holdfast is a devnet prototype and has not received a production security
audit. Do not use it to control mainnet programs or real funds.

## Reporting

Report vulnerabilities privately to the repository owner before public
disclosure. Include the affected path, prerequisites, impact, and a minimal
reproduction. Do not test accounts you do not control.

## Security boundaries

- The detector may open an incident but cannot pause the vault.
- Two distinct configured responders must approve the stored action hash.
- Approvals expire and are private only under the documented MagicBlock trust assumptions.
- The callback is constrained to the configured vault, program, authority PDA, receipt, and incident ID.
- Success requires an executed receipt and paused vault; a commit alone is not success.

Keep wallet files, private keys, RPC credentials, webhook secrets, `.env*`, and
detector state outside version control. Use a dedicated low-balance devnet
wallet for live spikes. No repository script is authorized for mainnet use.

The JSON delivery store contains incident metadata. Keep it operator-readable
only on an encrypted volume and outside any public web root.
