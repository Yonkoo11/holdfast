use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::{
    access_control::{
        instructions::CreateEphemeralPermissionCpi,
        structs::{
            EphemeralMembersArgs, EphemeralPermission, Member, PERMISSION_SEED, TX_BALANCES_FLAG,
            TX_LOGS_FLAG, TX_MESSAGE_FLAG,
        },
    },
    anchor::{action, commit, delegate, ephemeral},
    consts::{EPHEMERAL_VAULT_ID, MAGIC_PROGRAM_ID, PERMISSION_PROGRAM_ID},
    cpi::DelegateConfig,
    ephem::{CallHandler, MagicIntentBundleBuilder},
    ActionArgs, ShortAccountMeta,
};

declare_id!("EjU7sFMStj15r1NVrzgVbRJBdjUTUGbgyzHvFzEaaZuz");

pub const CONTROLLER_SEED: &[u8] = b"controller";
pub const INCIDENT_SEED: &[u8] = b"incident";
pub const RECEIPT_SEED: &[u8] = b"receipt";
pub const ACTION_AUTHORITY_SEED: &[u8] = b"action-authority";
pub const RESPONDER_COUNT: usize = 3;
pub const QUORUM: u8 = 2;
pub const BREACH_BPS: u64 = 2_000;
pub const TEE_VALIDATOR: Pubkey = pubkey!("MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo");

#[ephemeral]
#[program]
pub mod holdfast {
    use super::*;

    pub fn initialize_controller(
        ctx: Context<InitializeController>,
        detector: Pubkey,
        responders: [Pubkey; RESPONDER_COUNT],
    ) -> Result<()> {
        require!(all_unique(&responders), HoldfastError::DuplicateResponder);
        require!(
            !responders.contains(&Pubkey::default()),
            HoldfastError::InvalidResponder
        );

        let controller = &mut ctx.accounts.controller;
        controller.admin = ctx.accounts.admin.key();
        controller.detector = detector;
        controller.responders = responders;
        controller.vault = ctx.accounts.vault.key();
        controller.vault_program = test_vault::ID;
        controller.next_incident_id = 1;
        controller.last_withdrawal_sequence = 0;
        controller.action_authority_bump = ctx.bumps.action_authority;
        Ok(())
    }

    pub fn open_incident(
        ctx: Context<OpenIncident>,
        evidence_hash: [u8; 32],
        observed_tvl: u64,
        withdrawal_amount: u64,
        withdrawal_sequence: u64,
        ttl_slots: u64,
    ) -> Result<()> {
        require!(evidence_hash != [0; 32], HoldfastError::InvalidEvidence);
        require!(ttl_slots > 0, HoldfastError::InvalidExpiry);
        require!(
            is_breach(withdrawal_amount, observed_tvl),
            HoldfastError::ThresholdNotBreached
        );
        let vault = &ctx.accounts.vault;
        require!(!vault.paused, HoldfastError::VaultAlreadyPaused);
        require!(
            vault.withdrawal_seq == withdrawal_sequence
                && vault.last_withdrawal == withdrawal_amount,
            HoldfastError::WithdrawalEvidenceMismatch
        );
        require!(
            vault.total_assets.checked_add(withdrawal_amount) == Some(observed_tvl),
            HoldfastError::WithdrawalEvidenceMismatch
        );

        let controller = &mut ctx.accounts.controller;
        require!(
            withdrawal_sequence > controller.last_withdrawal_sequence,
            HoldfastError::WithdrawalAlreadyObserved
        );
        controller.last_withdrawal_sequence = withdrawal_sequence;
        let id = controller.next_incident_id;
        controller.next_incident_id = id.checked_add(1).ok_or(HoldfastError::ArithmeticOverflow)?;
        let now = Clock::get()?.slot;

        let incident = &mut ctx.accounts.incident;
        incident.controller = controller.key();
        incident.id = id;
        incident.vault = controller.vault;
        incident.responders = controller.responders;
        incident.evidence_hash = evidence_hash;
        incident.action_hash = pause_action_hash(controller.key(), controller.vault, id);
        incident.observed_tvl = observed_tvl;
        incident.withdrawal_amount = withdrawal_amount;
        incident.withdrawal_sequence = withdrawal_sequence;
        incident.created_slot = now;
        incident.expires_slot = now
            .checked_add(ttl_slots)
            .ok_or(HoldfastError::ArithmeticOverflow)?;
        incident.approval_bitmap = 0;
        incident.approval_count = 0;
        incident.status = IncidentStatus::Pending;
        let incident_key = incident.key();
        let action_hash = incident.action_hash;

        // The delegated incident PDA pays for its ER-local permission account.
        // Fund that rent on base before delegation so no responder or backend
        // needs privileged funding authority inside the TEE.
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.detector.to_account_info(),
                    to: ctx.accounts.incident.to_account_info(),
                },
            ),
            ephemeral_rollups_sdk::ephemeral_accounts::rent(EphemeralPermission::size_of(
                RESPONDER_COUNT,
            ) as u32),
        )?;

        let receipt = &mut ctx.accounts.receipt;
        receipt.incident = incident_key;
        receipt.incident_id = id;
        receipt.controller = controller.key();
        receipt.vault = controller.vault;
        receipt.action_hash = action_hash;
        receipt.status = ReceiptStatus::Pending;
        receipt.executed_slot = 0;

        emit!(IncidentOpened {
            incident: incident_key,
            id,
            evidence_hash,
            withdrawal_amount,
            observed_tvl,
        });
        Ok(())
    }

    pub fn delegate_incident(ctx: Context<DelegateIncident>, id: u64) -> Result<()> {
        // Deserialize and validate before the CPI changes account ownership. Using an
        // UncheckedAccount here is intentional: Anchor must not serialize the account
        // again after the Delegation Program takes ownership.
        let incident_data = ctx.accounts.incident.try_borrow_data()?;
        let incident = Incident::try_deserialize(&mut &incident_data[..])?;
        require_keys_eq!(
            incident.controller,
            ctx.accounts.controller.key(),
            HoldfastError::IncidentMismatch
        );
        require!(incident.id == id, HoldfastError::IncidentMismatch);
        drop(incident_data);

        let controller_key = ctx.accounts.controller.key();
        let id_bytes = id.to_le_bytes();
        ctx.accounts.delegate_incident(
            &ctx.accounts.payer,
            &[INCIDENT_SEED, controller_key.as_ref(), &id_bytes],
            DelegateConfig {
                validator: Some(ctx.accounts.validator.key()),
                ..Default::default()
            },
        )?;
        Ok(())
    }

    pub fn init_private_permission(ctx: Context<PrivatePermission>) -> Result<()> {
        if ctx.accounts.permission.lamports() > 0 {
            return Ok(());
        }
        let incident = &ctx.accounts.incident;
        let id = incident.id.to_le_bytes();
        let controller_key = incident.controller;
        let signer_seeds: &[&[u8]] = &[
            INCIDENT_SEED,
            controller_key.as_ref(),
            &id,
            &[ctx.bumps.incident],
        ];
        let flags = TX_LOGS_FLAG | TX_MESSAGE_FLAG | TX_BALANCES_FLAG;
        let members = ctx
            .accounts
            .incident
            .responders
            .iter()
            .map(|pubkey| Member {
                flags,
                pubkey: *pubkey,
            })
            .collect();

        CreateEphemeralPermissionCpi {
            payer: ctx.accounts.incident.to_account_info(),
            permissioned_account: ctx.accounts.incident.to_account_info(),
            permission: ctx.accounts.permission.to_account_info(),
            vault: ctx.accounts.ephemeral_vault.to_account_info(),
            magic_program: ctx.accounts.magic_program.to_account_info(),
            permission_program: ctx.accounts.permission_program.to_account_info(),
            args: EphemeralMembersArgs {
                is_private: true,
                members,
            },
        }
        .invoke_signed(&[signer_seeds])?;
        Ok(())
    }

    pub fn approve(ctx: Context<Approve>, action_hash: [u8; 32]) -> Result<()> {
        let incident = &mut ctx.accounts.incident;
        apply_approval(
            incident,
            ctx.accounts.responder.key(),
            action_hash,
            Clock::get()?.slot,
        )
    }

    pub fn commit_and_pause(ctx: Context<CommitAndPause>) -> Result<()> {
        let incident = &ctx.accounts.incident;
        validate_commit(incident, Clock::get()?.slot)?;
        let (receipt, _) =
            Pubkey::find_program_address(&[RECEIPT_SEED, incident.key().as_ref()], &crate::ID);
        let (action_authority, _) = Pubkey::find_program_address(
            &[ACTION_AUTHORITY_SEED, incident.controller.as_ref()],
            &crate::ID,
        );

        let instruction_data =
            anchor_lang::InstructionData::data(&crate::instruction::ExecutePause {
                incident_id: incident.id,
            });
        let action = CallHandler {
            destination_program: crate::ID,
            accounts: vec![
                short_meta(incident.controller, false),
                short_meta(receipt, true),
                short_meta(incident.vault, true),
                short_meta(action_authority, false),
                short_meta(test_vault::ID, false),
            ],
            args: ActionArgs::new(instruction_data),
            escrow_authority: ctx.accounts.payer.to_account_info(),
            compute_units: 250_000,
        };

        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit(&[ctx.accounts.incident.to_account_info()])
        .add_post_commit_actions([action])
        .build_and_invoke()?;
        Ok(())
    }

    pub fn execute_pause(ctx: Context<ExecutePause>, incident_id: u64) -> Result<()> {
        // Magic Actions prepend the committed account to callback accounts. It is
        // still delegated on base, so bind its key but never deserialize it here.
        validate_execution(
            &ctx.accounts.receipt,
            ctx.accounts.incident.key(),
            incident_id,
        )?;

        let controller_key = ctx.accounts.controller.key();
        let signer_seeds: &[&[u8]] = &[
            ACTION_AUTHORITY_SEED,
            controller_key.as_ref(),
            &[ctx.accounts.controller.action_authority_bump],
        ];
        test_vault::cpi::pause(
            CpiContext::new_with_signer(
                ctx.accounts.vault_program.to_account_info(),
                test_vault::cpi::accounts::Pause {
                    vault: ctx.accounts.vault.to_account_info(),
                    pause_authority: ctx.accounts.action_authority.to_account_info(),
                },
                &[signer_seeds],
            ),
            incident_id,
        )?;

        let receipt = &mut ctx.accounts.receipt;
        mark_executed(receipt, Clock::get()?.slot);
        emit!(PauseExecuted {
            incident: receipt.incident,
            receipt: receipt.key(),
            vault: ctx.accounts.vault.key(),
            incident_id,
        });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeController<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + Controller::INIT_SPACE,
        seeds = [CONTROLLER_SEED, vault.key().as_ref()],
        bump
    )]
    pub controller: Account<'info, Controller>,
    /// CHECK: Bound to the test-vault program and verified again in every action.
    pub vault: UncheckedAccount<'info>,
    /// CHECK: PDA becomes the test vault's pause authority; it never stores data.
    #[account(seeds = [ACTION_AUTHORITY_SEED, controller.key().as_ref()], bump)]
    pub action_authority: UncheckedAccount<'info>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(evidence_hash: [u8; 32], observed_tvl: u64, withdrawal_amount: u64, withdrawal_sequence: u64)]
pub struct OpenIncident<'info> {
    #[account(mut, has_one = detector, has_one = vault)]
    pub controller: Account<'info, Controller>,
    #[account(address = controller.vault, owner = test_vault::ID)]
    pub vault: Account<'info, test_vault::Vault>,
    #[account(
        init,
        payer = detector,
        space = 8 + Incident::INIT_SPACE,
        seeds = [INCIDENT_SEED, controller.key().as_ref(), &controller.next_incident_id.to_le_bytes()],
        bump
    )]
    pub incident: Account<'info, Incident>,
    #[account(
        init,
        payer = detector,
        space = 8 + ActionReceipt::INIT_SPACE,
        seeds = [RECEIPT_SEED, incident.key().as_ref()],
        bump
    )]
    pub receipt: Account<'info, ActionReceipt>,
    #[account(mut)]
    pub detector: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
#[instruction(id: u64)]
pub struct DelegateIncident<'info> {
    pub controller: Account<'info, Controller>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        del,
        seeds = [INCIDENT_SEED, controller.key().as_ref(), &id.to_le_bytes()],
        bump,
        owner = crate::id()
    )]
    /// CHECK: Deserialized and controller/id-bound in the handler before delegation;
    /// unchecked prevents Anchor from serializing after ownership transfers.
    pub incident: UncheckedAccount<'info>,
    /// CHECK: Fixed devnet TEE validator; the Delegation Program validates it too.
    #[account(address = TEE_VALIDATOR)]
    pub validator: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct PrivatePermission<'info> {
    #[account(
        mut,
        seeds = [INCIDENT_SEED, incident.controller.as_ref(), &incident.id.to_le_bytes()],
        bump
    )]
    pub incident: Account<'info, Incident>,
    /// CHECK: Seeds and owning program constrain the ER-local permission PDA.
    #[account(
        mut,
        seeds = [PERMISSION_SEED, incident.key().as_ref()],
        bump,
        seeds::program = PERMISSION_PROGRAM_ID
    )]
    pub permission: UncheckedAccount<'info>,
    /// CHECK: Fixed MagicBlock Permission Program.
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
    /// CHECK: Fixed MagicBlock ephemeral rent vault.
    #[account(mut, address = EPHEMERAL_VAULT_ID)]
    pub ephemeral_vault: UncheckedAccount<'info>,
    /// CHECK: Fixed MagicBlock program.
    #[account(address = MAGIC_PROGRAM_ID)]
    pub magic_program: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct Approve<'info> {
    #[account(
        mut,
        seeds = [INCIDENT_SEED, incident.controller.as_ref(), &incident.id.to_le_bytes()],
        bump
    )]
    pub incident: Account<'info, Incident>,
    pub responder: Signer<'info>,
}

#[commit]
#[derive(Accounts)]
pub struct CommitAndPause<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [INCIDENT_SEED, incident.controller.as_ref(), &incident.id.to_le_bytes()],
        bump
    )]
    pub incident: Account<'info, Incident>,
    /// CHECK: Needed by the Magic Action dispatcher.
    #[account(address = crate::ID)]
    pub program_id: UncheckedAccount<'info>,
}

#[action]
#[derive(Accounts)]
pub struct ExecutePause<'info> {
    /// CHECK: Magic Actions prepend the committed incident; its key is bound to
    /// the durable receipt in the handler and its private data is never read.
    pub incident: UncheckedAccount<'info>,
    #[account(has_one = vault, constraint = controller.vault_program == test_vault::ID @ HoldfastError::WrongVaultProgram)]
    pub controller: Account<'info, Controller>,
    #[account(
        mut,
        seeds = [RECEIPT_SEED, receipt.incident.as_ref()],
        bump,
        has_one = controller,
        has_one = vault
    )]
    pub receipt: Account<'info, ActionReceipt>,
    #[account(mut, address = controller.vault)]
    pub vault: Account<'info, test_vault::Vault>,
    /// CHECK: PDA signer for the constrained test-vault CPI.
    #[account(seeds = [ACTION_AUTHORITY_SEED, controller.key().as_ref()], bump = controller.action_authority_bump)]
    pub action_authority: UncheckedAccount<'info>,
    pub vault_program: Program<'info, test_vault::program::TestVault>,
}

#[account]
#[derive(InitSpace)]
pub struct Controller {
    pub admin: Pubkey,
    pub detector: Pubkey,
    pub responders: [Pubkey; RESPONDER_COUNT],
    pub vault: Pubkey,
    pub vault_program: Pubkey,
    pub next_incident_id: u64,
    pub last_withdrawal_sequence: u64,
    pub action_authority_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Incident {
    pub controller: Pubkey,
    pub id: u64,
    pub vault: Pubkey,
    pub responders: [Pubkey; RESPONDER_COUNT],
    pub evidence_hash: [u8; 32],
    pub action_hash: [u8; 32],
    pub observed_tvl: u64,
    pub withdrawal_amount: u64,
    pub withdrawal_sequence: u64,
    pub created_slot: u64,
    pub expires_slot: u64,
    pub approval_bitmap: u8,
    pub approval_count: u8,
    pub status: IncidentStatus,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq)]
pub enum IncidentStatus {
    Pending,
    Approved,
}

#[account]
#[derive(InitSpace)]
pub struct ActionReceipt {
    pub incident: Pubkey,
    pub incident_id: u64,
    pub controller: Pubkey,
    pub vault: Pubkey,
    pub action_hash: [u8; 32],
    pub status: ReceiptStatus,
    pub executed_slot: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, PartialEq, Eq)]
pub enum ReceiptStatus {
    Pending,
    Executed,
}

#[event]
pub struct IncidentOpened {
    pub incident: Pubkey,
    pub id: u64,
    pub evidence_hash: [u8; 32],
    pub withdrawal_amount: u64,
    pub observed_tvl: u64,
}

#[event]
pub struct PauseExecuted {
    pub incident: Pubkey,
    pub receipt: Pubkey,
    pub vault: Pubkey,
    pub incident_id: u64,
}

fn all_unique(keys: &[Pubkey; RESPONDER_COUNT]) -> bool {
    keys[0] != keys[1] && keys[0] != keys[2] && keys[1] != keys[2]
}

fn responder_index(keys: &[Pubkey; RESPONDER_COUNT], signer: &Pubkey) -> Option<u8> {
    keys.iter().position(|key| key == signer).map(|i| i as u8)
}

fn apply_approval(
    incident: &mut Incident,
    signer: Pubkey,
    action_hash: [u8; 32],
    current_slot: u64,
) -> Result<()> {
    require!(
        incident.status == IncidentStatus::Pending,
        HoldfastError::IncidentNotPending
    );
    require!(
        current_slot <= incident.expires_slot,
        HoldfastError::IncidentExpired
    );
    require!(
        action_hash == incident.action_hash,
        HoldfastError::ActionChanged
    );

    let index = responder_index(&incident.responders, &signer)
        .ok_or(HoldfastError::UnauthorizedResponder)?;
    let bit = 1u8 << index;
    require!(
        incident.approval_bitmap & bit == 0,
        HoldfastError::DuplicateApproval
    );

    incident.approval_bitmap |= bit;
    incident.approval_count = incident
        .approval_count
        .checked_add(1)
        .ok_or(HoldfastError::ArithmeticOverflow)?;
    if incident.approval_count >= QUORUM {
        incident.status = IncidentStatus::Approved;
    }
    Ok(())
}

fn validate_commit(incident: &Incident, current_slot: u64) -> Result<()> {
    require!(
        incident.status == IncidentStatus::Approved,
        HoldfastError::QuorumNotReached
    );
    require!(
        current_slot <= incident.expires_slot,
        HoldfastError::IncidentExpired
    );
    Ok(())
}

fn validate_execution(
    receipt: &ActionReceipt,
    incident_key: Pubkey,
    incident_id: u64,
) -> Result<()> {
    require_keys_eq!(
        incident_key,
        receipt.incident,
        HoldfastError::IncidentMismatch
    );
    require!(
        receipt.incident_id == incident_id,
        HoldfastError::IncidentMismatch
    );
    require!(
        receipt.status == ReceiptStatus::Pending,
        HoldfastError::ActionReplay
    );
    Ok(())
}

fn mark_executed(receipt: &mut ActionReceipt, executed_slot: u64) {
    receipt.status = ReceiptStatus::Executed;
    receipt.executed_slot = executed_slot;
}

fn is_breach(withdrawal: u64, tvl: u64) -> bool {
    tvl > 0 && (withdrawal as u128) * 10_000 > (tvl as u128) * (BREACH_BPS as u128)
}

fn pause_action_hash(controller: Pubkey, vault: Pubkey, incident_id: u64) -> [u8; 32] {
    solana_sha256_hasher::hashv(&[
        b"holdfast:pause:v1",
        controller.as_ref(),
        vault.as_ref(),
        &incident_id.to_le_bytes(),
        test_vault::ID.as_ref(),
    ])
    .to_bytes()
}

fn short_meta(pubkey: Pubkey, is_writable: bool) -> ShortAccountMeta {
    ShortAccountMeta {
        pubkey: pubkey.to_bytes().into(),
        is_writable,
    }
}

#[error_code]
pub enum HoldfastError {
    #[msg("responders must be unique")]
    DuplicateResponder,
    #[msg("responder cannot be the zero address")]
    InvalidResponder,
    #[msg("evidence hash cannot be empty")]
    InvalidEvidence,
    #[msg("incident expiry must be in the future")]
    InvalidExpiry,
    #[msg("withdrawal did not exceed 20% of observed TVL")]
    ThresholdNotBreached,
    #[msg("submitted withdrawal evidence does not match the vault account")]
    WithdrawalEvidenceMismatch,
    #[msg("this vault withdrawal already opened an incident")]
    WithdrawalAlreadyObserved,
    #[msg("a paused vault cannot open a new containment incident")]
    VaultAlreadyPaused,
    #[msg("incident arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("signer is not an authorized responder")]
    UnauthorizedResponder,
    #[msg("responder already approved this incident")]
    DuplicateApproval,
    #[msg("incident is no longer pending")]
    IncidentNotPending,
    #[msg("incident approval window expired")]
    IncidentExpired,
    #[msg("approval targets a different action")]
    ActionChanged,
    #[msg("two unique approvals are required")]
    QuorumNotReached,
    #[msg("pause action was already executed")]
    ActionReplay,
    #[msg("action incident id does not match committed evidence")]
    IncidentMismatch,
    #[msg("controller is bound to a different vault program")]
    WrongVaultProgram,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn breach_is_strictly_greater_than_twenty_percent() {
        assert!(!is_breach(20, 100));
        assert!(is_breach(21, 100));
        assert!(!is_breach(1, 0));
        assert!(is_breach(u64::MAX, u64::MAX));
    }

    #[test]
    fn responder_lookup_is_exact() {
        let keys = [
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            Pubkey::new_unique(),
        ];
        assert_eq!(responder_index(&keys, &keys[1]), Some(1));
        assert_eq!(responder_index(&keys, &Pubkey::new_unique()), None);
        assert!(all_unique(&keys));
    }

    #[test]
    fn action_hash_binds_incident_and_target() {
        let controller = Pubkey::new_unique();
        let vault = Pubkey::new_unique();
        assert_ne!(
            pause_action_hash(controller, vault, 1),
            pause_action_hash(controller, vault, 2)
        );
        assert_ne!(
            pause_action_hash(controller, vault, 1),
            pause_action_hash(controller, Pubkey::new_unique(), 1)
        );
    }

    fn pending_incident() -> Incident {
        let controller = Pubkey::new_unique();
        let vault = Pubkey::new_unique();
        Incident {
            controller,
            id: 9,
            vault,
            responders: [
                Pubkey::new_unique(),
                Pubkey::new_unique(),
                Pubkey::new_unique(),
            ],
            evidence_hash: [7; 32],
            action_hash: pause_action_hash(controller, vault, 9),
            observed_tvl: 1_000,
            withdrawal_amount: 250,
            withdrawal_sequence: 3,
            created_slot: 100,
            expires_slot: 200,
            approval_bitmap: 0,
            approval_count: 0,
            status: IncidentStatus::Pending,
        }
    }

    #[test]
    fn quorum_requires_two_unique_responders() {
        let mut incident = pending_incident();
        let action = incident.action_hash;
        let first = incident.responders[0];
        let second = incident.responders[1];

        apply_approval(&mut incident, first, action, 150).unwrap();
        assert_eq!(incident.approval_count, 1);
        assert_eq!(incident.approval_bitmap, 0b001);
        assert!(incident.status == IncidentStatus::Pending);
        assert!(validate_commit(&incident, 150).is_err());

        apply_approval(&mut incident, second, action, 150).unwrap();
        assert_eq!(incident.approval_count, 2);
        assert_eq!(incident.approval_bitmap, 0b011);
        assert!(incident.status == IncidentStatus::Approved);
        validate_commit(&incident, 150).unwrap();
    }

    #[test]
    fn approval_abuse_is_rejected_without_mutating_quorum() {
        let mut incident = pending_incident();
        let action = incident.action_hash;
        let first = incident.responders[0];

        assert!(apply_approval(&mut incident, Pubkey::new_unique(), action, 150).is_err());
        assert!(apply_approval(&mut incident, first, [9; 32], 150).is_err());
        assert!(apply_approval(&mut incident, first, action, 201).is_err());
        assert_eq!(incident.approval_count, 0);
        assert_eq!(incident.approval_bitmap, 0);

        apply_approval(&mut incident, first, action, 150).unwrap();
        assert!(apply_approval(&mut incident, first, action, 150).is_err());
        assert_eq!(incident.approval_count, 1);
        assert_eq!(incident.approval_bitmap, 0b001);
        assert!(incident.status == IncidentStatus::Pending);
    }

    #[test]
    fn approval_abuse_expired_quorum_cannot_commit() {
        let mut incident = pending_incident();
        let action = incident.action_hash;
        let first = incident.responders[0];
        let second = incident.responders[1];
        apply_approval(&mut incident, first, action, 150).unwrap();
        apply_approval(&mut incident, second, action, 150).unwrap();
        assert!(validate_commit(&incident, 201).is_err());
    }

    fn pending_receipt(incident: Pubkey) -> ActionReceipt {
        ActionReceipt {
            incident,
            incident_id: 9,
            controller: Pubkey::new_unique(),
            vault: Pubkey::new_unique(),
            action_hash: [3; 32],
            status: ReceiptStatus::Pending,
            executed_slot: 0,
        }
    }

    #[test]
    fn containment_receipt_records_execution_only_after_valid_callback() {
        let incident = Pubkey::new_unique();
        let mut receipt = pending_receipt(incident);
        validate_execution(&receipt, incident, 9).unwrap();
        assert!(receipt.status == ReceiptStatus::Pending);
        assert_eq!(receipt.executed_slot, 0);

        mark_executed(&mut receipt, 444);
        assert!(receipt.status == ReceiptStatus::Executed);
        assert_eq!(receipt.executed_slot, 444);
    }

    #[test]
    fn action_failure_replay_is_rejected() {
        let incident = Pubkey::new_unique();
        let mut receipt = pending_receipt(incident);
        mark_executed(&mut receipt, 444);
        assert!(validate_execution(&receipt, incident, 9).is_err());
        assert_eq!(receipt.executed_slot, 444);
    }

    #[test]
    fn action_failure_mismatched_callback_is_rejected() {
        let incident = Pubkey::new_unique();
        let receipt = pending_receipt(incident);
        assert!(validate_execution(&receipt, Pubkey::new_unique(), 9).is_err());
        assert!(validate_execution(&receipt, incident, 10).is_err());
        assert!(receipt.status == ReceiptStatus::Pending);
        assert_eq!(receipt.executed_slot, 0);
    }
}
