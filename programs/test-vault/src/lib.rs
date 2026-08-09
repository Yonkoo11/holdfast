use anchor_lang::prelude::*;

declare_id!("H9pEwKaL9JwCjYj1ZgmVbZ6AAHHRyXMd4HZfSi1GZaBy");

pub const VAULT_SEED: &[u8] = b"vault";

#[program]
pub mod test_vault {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        total_assets: u64,
        pause_authority: Pubkey,
    ) -> Result<()> {
        require!(total_assets > 0, VaultError::EmptyVault);
        let vault = &mut ctx.accounts.vault;
        vault.authority = ctx.accounts.authority.key();
        vault.pause_authority = pause_authority;
        vault.total_assets = total_assets;
        vault.last_withdrawal = 0;
        vault.withdrawal_seq = 0;
        vault.paused = false;
        vault.last_pause_incident = 0;
        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.total_assets = remaining_assets(vault.paused, vault.total_assets, amount)?;
        vault.last_withdrawal = amount;
        vault.withdrawal_seq = vault
            .withdrawal_seq
            .checked_add(1)
            .ok_or(VaultError::ArithmeticOverflow)?;
        emit!(WithdrawalObserved {
            vault: vault.key(),
            sequence: vault.withdrawal_seq,
            amount,
            remaining_assets: vault.total_assets,
        });
        Ok(())
    }

    pub fn pause(ctx: Context<Pause>, incident_id: u64) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        validate_pause(vault.paused, vault.last_pause_incident, incident_id)?;
        vault.paused = true;
        vault.last_pause_incident = incident_id;
        emit!(VaultPaused {
            vault: vault.key(),
            incident_id,
        });
        Ok(())
    }
}

fn remaining_assets(paused: bool, total_assets: u64, amount: u64) -> Result<u64> {
    require!(!paused, VaultError::VaultPaused);
    require!(amount > 0, VaultError::InvalidAmount);
    require!(amount <= total_assets, VaultError::InsufficientAssets);
    total_assets
        .checked_sub(amount)
        .ok_or_else(|| error!(VaultError::ArithmeticOverflow))
}

fn validate_pause(paused: bool, last_incident: u64, incident_id: u64) -> Result<()> {
    require!(!paused, VaultError::AlreadyPaused);
    require!(incident_id > last_incident, VaultError::IncidentReplay);
    Ok(())
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Vault::INIT_SPACE,
        seeds = [VAULT_SEED, authority.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut, has_one = authority)]
    pub vault: Account<'info, Vault>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct Pause<'info> {
    #[account(mut, has_one = pause_authority)]
    pub vault: Account<'info, Vault>,
    pub pause_authority: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub authority: Pubkey,
    pub pause_authority: Pubkey,
    pub total_assets: u64,
    pub last_withdrawal: u64,
    pub withdrawal_seq: u64,
    pub last_pause_incident: u64,
    pub paused: bool,
}

#[event]
pub struct WithdrawalObserved {
    pub vault: Pubkey,
    pub sequence: u64,
    pub amount: u64,
    pub remaining_assets: u64,
}

#[event]
pub struct VaultPaused {
    pub vault: Pubkey,
    pub incident_id: u64,
}

#[error_code]
pub enum VaultError {
    #[msg("vault must start with assets")]
    EmptyVault,
    #[msg("withdrawal amount must be positive")]
    InvalidAmount,
    #[msg("vault does not contain enough assets")]
    InsufficientAssets,
    #[msg("vault is paused")]
    VaultPaused,
    #[msg("vault is already paused")]
    AlreadyPaused,
    #[msg("incident id was already consumed")]
    IncidentReplay,
    #[msg("vault arithmetic overflow")]
    ArithmeticOverflow,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn withdrawal_applies_only_to_live_funded_vaults() {
        assert_eq!(remaining_assets(false, 1_000, 201).unwrap(), 799);
        assert!(remaining_assets(false, 1_000, 0).is_err());
        assert!(remaining_assets(false, 1_000, 1_001).is_err());
        assert!(remaining_assets(true, 1_000, 201).is_err());
    }

    #[test]
    fn pause_requires_a_fresh_incident() {
        assert!(validate_pause(false, 7, 8).is_ok());
        assert!(validate_pause(false, 7, 7).is_err());
        assert!(validate_pause(false, 7, 6).is_err());
        assert!(validate_pause(true, 7, 8).is_err());
    }
}
