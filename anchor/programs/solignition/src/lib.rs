use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    bpf_loader_upgradeable,
    program::{invoke, invoke_signed},
    system_instruction,
};
use anchor_spl::{
    metadata::{
               create_metadata_accounts_v3, mpl_token_metadata::types::DataV2,
               CreateMetadataAccountsV3, Metadata,
             },
              token::{self, Mint, Token, TokenAccount, MintTo, Transfer},
              associated_token::{AssociatedToken}
};

declare_id!("4dWBvsjopo5Z145Xmse3Lx41G1GKpMyWMLc6p4a52T4N");

pub const VAULT_SEED: &[u8] = b"vault";
pub const AUTHORITY_SEED: &[u8] = b"authority";
pub const ADMIN_SEED: &[u8] = b"admin";
pub const TREASURY_SEED: &[u8] = b"treasury";
pub const LOAN_SEED: &[u8] = b"loan";
pub const DEPOSITOR_SEED: &[u8] = b"depositor";
pub const DEPLOYER_SEED: &[u8] = b"deployer";
pub const PROTOCOL_CONFIG_SEED: &[u8] = b"config";
pub const SECONDS_PER_YEAR: u64 = 31_536_000;

/// Solana Developer Lending Protocol
/// 
/// This protocol enables SOL lending for developer program deployments with:
/// - Trustless upgrade authority management
/// - Automated loan recovery and repayment
/// - Fair yield distribution to depositors
/// - Secure fee collection and distribution
/// 
/// Recovery Flow for Expired Loans:
/// 1. Call `recover_loan` when loan expires to mark it recovered
/// 2. Off-chain deployer can close the program account
/// 3. Call `return_reclaimed_sol` to return recovered SOL to vault

#[program]
pub mod solignition {
    use super::*;

    /// Initialize the protocol with admin and configuration
    pub fn initialize(
        ctx: Context<Initialize>,
        admin_fee_split_bps: u16,  // % of admin fee to depositors vs treasury
        default_interest_rate_bps: u16,
        default_admin_fee_bps: u16,
    ) -> Result<()> {
        let config = &mut ctx.accounts.protocol_config;
        config.admin = ctx.accounts.admin.key();
        config.treasury = ctx.accounts.treasury.key();
        config.deployer = ctx.accounts.deployer.key();
        config.bump = ctx.bumps.protocol_config;
        config.admin_fee_split_bps = admin_fee_split_bps;
        config.default_interest_rate_bps = default_interest_rate_bps;
        config.default_admin_fee_bps = default_admin_fee_bps;
        config.total_deposits = 0;
        config.total_loans_outstanding = 0;
        config.is_paused = false;
        config.loan_counter = 0;
        
        
        emit_cpi!(ProtocolInitialized {
            admin: ctx.accounts.admin.key(),
            treasury: ctx.accounts.treasury.key(),
        });
        
        Ok(())
    }

    /// Deposit SOL into the vault
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(!ctx.accounts.protocol_config.is_paused, ErrorCode::ProtocolPaused);
        require!(amount > 0, ErrorCode::InvalidAmount);

        // Transfer SOL from depositor to vault
        let ix = system_instruction::transfer(
            &ctx.accounts.depositor.key(),
            &ctx.accounts.vault.key(),
            amount,
        );
        invoke(
            &ix,
            &[
                ctx.accounts.depositor.to_account_info(),
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Update or create depositor record
        let depositor_record = &mut ctx.accounts.depositor_record;
        depositor_record.owner = ctx.accounts.depositor.key();
        depositor_record.deposited_amount += amount;
        depositor_record.share_amount += amount; // 1:1 initially, can be adjusted for yield
        depositor_record.last_update_ts = Clock::get()?.unix_timestamp;
        depositor_record.bump = ctx.bumps.depositor_record;

        // Update protocol totals
        ctx.accounts.protocol_config.total_deposits += amount;

        emit_cpi!(Deposited {
            depositor: ctx.accounts.depositor.key(),
            amount,
            total_deposits: ctx.accounts.protocol_config.total_deposits,
        });

        Ok(())
    }

    /// Withdraw SOL from the vault
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(!ctx.accounts.protocol_config.is_paused, ErrorCode::ProtocolPaused);

        let depositor_record = &ctx.accounts.depositor_record;
        require!(amount <= depositor_record.share_amount, ErrorCode::InsufficientBalance);
        
        // Calculate available liquidity (total deposits - outstanding loans)
        let available = ctx.accounts.protocol_config.total_deposits
            .saturating_sub(ctx.accounts.protocol_config.total_loans_outstanding);
        require!(amount <= available, ErrorCode::InsufficientLiquidity);

        // Transfer SOL from vault to depositor
        let vault_seeds = &[VAULT_SEED, &[ctx.bumps.vault]];
        let signer = &[&vault_seeds[..]];
        
       // **ctx.accounts.vault.try_borrow_mut_lamports()? -= amount;
       // **ctx.accounts.depositor.try_borrow_mut_lamports()? += amount;

        /* Transfer tokens from user to escrow token account
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.depositor.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            cpi_accounts
        );
        token::transfer(cpi_ctx, amount)?;*/

        let ix = system_instruction::transfer(
        &ctx.accounts.vault.key(),
        &ctx.accounts.depositor.key(),
        amount,
        );
        invoke_signed(
            &ix,
            &[
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.depositor.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer,
        )?;



        // Update depositor record
        let depositor_record = &mut ctx.accounts.depositor_record;
        depositor_record.share_amount = depositor_record.share_amount.saturating_sub(amount);
        depositor_record.deposited_amount = depositor_record.deposited_amount.saturating_sub(amount);
        depositor_record.last_update_ts = Clock::get()?.unix_timestamp;

        // Update protocol totals
        ctx.accounts.protocol_config.total_deposits -= amount;

        emit_cpi!(Withdrawn {
            depositor: ctx.accounts.depositor.key(),
            amount,
            remaining_balance: depositor_record.share_amount,
        });

        Ok(())
    }

    /// Request a loan and pay upfront admin fee
    pub fn request_loan(
        ctx: Context<RequestLoan>,
        principal: u64,
        duration: i64,
        interest_rate_bps: u16,
        admin_fee_bps: u16,
    ) -> Result<()> {
        require!(!ctx.accounts.protocol_config.is_paused, ErrorCode::ProtocolPaused);
        require!(principal > 0, ErrorCode::InvalidAmount);
        require!(duration > 0, ErrorCode::InvalidDuration);
        require!(interest_rate_bps <= 10000, ErrorCode::InvalidInterestRate);
        require!(admin_fee_bps <= 10000, ErrorCode::InvalidAdminFee);

        //require!(ctx.accounts.protocol_config.loan_counter == , ErrorCode::InvalidLoanCounter);

        // Calculate upfront admin fee
        let admin_fee = (principal as u128)
            .checked_mul(admin_fee_bps as u128)
            .unwrap()
            .checked_div(10_000)
            .unwrap() as u64;

        // Check vault has sufficient liquidity
        let available = ctx.accounts.protocol_config.total_deposits
            .saturating_sub(ctx.accounts.protocol_config.total_loans_outstanding);
        require!(principal <= available, ErrorCode::InsufficientLiquidity);

        // Pay admin fee directly to admin PDA
        if admin_fee > 0 {
            let ix = system_instruction::transfer(
                &ctx.accounts.borrower.key(),
                &ctx.accounts.admin_pda.key(),
                admin_fee,
            );
            invoke(
                &ix,
                &[
                    ctx.accounts.borrower.to_account_info(),
                    ctx.accounts.admin_pda.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
            )?;
        }

        // Transfer principal from vault to deployer
        // The deployer will handle program deployment off-chain
        // Any unused or reclaimed SOL can be returned via return_reclaimed_sol
        let vault_seeds = &[VAULT_SEED, &[ctx.bumps.vault]];
        let signer = &[&vault_seeds[..]];
        
        //**ctx.accounts.vault.try_borrow_mut_lamports()? -= principal;
        //**ctx.accounts.deployer_pda.try_borrow_mut_lamports()? += principal;

        let ix = system_instruction::transfer(
        &ctx.accounts.vault.key(),
        &ctx.accounts.deployer.key(),
        principal,
         );
        invoke_signed(
            &ix,
            &[
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.deployer.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            signer,
        )?;
        
        // Create loan record
        let loan = &mut ctx.accounts.loan;
        loan.loan_id = ctx.accounts.protocol_config.loan_counter;
        loan.borrower = ctx.accounts.borrower.key();
        loan.program_pubkey = Pubkey::default(); // Will be set after deployment
        loan.principal = principal;
        loan.duration = duration;
        loan.interest_rate_bps = interest_rate_bps;
        loan.admin_fee_bps = admin_fee_bps;
        loan.admin_fee_paid = admin_fee;
        loan.start_ts = Clock::get()?.unix_timestamp;
        loan.state = LoanState::Pending;
       // loan.authority_pda = ctx.accounts.authority_pda.key();
        loan.repaid_ts = Some(0);
        loan.recovered_ts = Some(0);
        loan.interest_paid = Some(0);
        loan.reclaimed_amount = Some(0);
        loan.reclaimed_ts = Some(0);
        loan.bump = ctx.bumps.loan;

        // Update protocol state
        ctx.accounts.protocol_config.total_loans_outstanding += principal;
        ctx.accounts.protocol_config.loan_counter += 1;

        emit_cpi!(LoanRequested {
            borrower: ctx.accounts.borrower.key(),
            loan_id: loan.loan_id,
            principal,
            duration,
            interest_rate_bps,
            admin_fee,
        });

        Ok(())
    }

    /// Set the deployed program pubkey after off-chain deployment
    pub fn set_deployed_program(
        ctx: Context<SetDeployedProgram>,
        loan_id: u64,
        program_pubkey: Pubkey,
    ) -> Result<()> {
        require!(ctx.accounts.admin.key() == ctx.accounts.protocol_config.admin, ErrorCode::Unauthorized);
        require!(ctx.accounts.loan.loan_id == loan_id, ErrorCode::InvalidLoanId);
        require!(ctx.accounts.loan.program_pubkey == Pubkey::default(), ErrorCode::ProgramAlreadySet);
        
        ctx.accounts.loan.program_pubkey = program_pubkey;
        ctx.accounts.loan.state = LoanState::Active;

        emit_cpi!(LoanDeployed {
            loan_id,
            program_pubkey,
        });
        
        Ok(())
    }


    /* 
    /// Repay loan and transfer program authority old version
    pub fn repay_loan(ctx: Context<RepayLoan>, loan_id: u64) -> Result<()> {
        require!(!ctx.accounts.protocol_config.is_paused, ErrorCode::ProtocolPaused);
        
        let loan = &ctx.accounts.loan;
        require!(loan.state == LoanState::Active, ErrorCode::LoanNotActive);
        require!(loan.borrower == ctx.accounts.borrower.key(), ErrorCode::UnauthorizedBorrower);

        let clock = Clock::get()?;
        let elapsed = (clock.unix_timestamp - loan.start_ts) as u64;
        
        // Calculate interest
        let interest = calculate_interest(
            loan.principal,
            loan.interest_rate_bps,
            elapsed,
        );
        
        let total_due = loan.principal + interest;

        // Transfer repayment from borrower to vault
        let ix = system_instruction::transfer(
            &ctx.accounts.borrower.key(),
            &ctx.accounts.vault.key(),
            total_due,
        );
        invoke(
            &ix,
            &[
                ctx.accounts.borrower.to_account_info(),
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Transfer upgrade authority from protocol PDA to borrower
        if loan.program_pubkey != Pubkey::default() {
           /*  let authority_seeds = &[AUTHORITY_SEED, &[ctx.bumps.authority_pda]];
            let signer = &[&authority_seeds[..]];
            
            // CPI to BPF upgradeable loader to transfer authority
            let ix = bpf_loader_upgradeable::set_upgrade_authority(
                &loan.program_pubkey,
                &ctx.accounts.authority_pda.key(),
                Some(&ctx.accounts.borrower.key()),
            );
            
            invoke_signed(
                &ix,
                &[
                    ctx.accounts.program_data.to_account_info(),
                    ctx.accounts.authority_pda.to_account_info(),
                    ctx.accounts.borrower.to_account_info(),
                ],
                signer,
            )?;*/
            
        // CPI to BPF upgradeable loader to transfer authority
        let ix = bpf_loader_upgradeable::set_upgrade_authority(
            &loan.program_pubkey,
            &ctx.accounts.deployer.key(),
            Some(&ctx.accounts.borrower.key()),
        );
        
        invoke(
            &ix,
            &[
                ctx.accounts.program_data.to_account_info(),
                ctx.accounts.deployer.to_account_info(),
                ctx.accounts.borrower.to_account_info(),
            ],
        )?;

            emit_cpi!(AuthorityTransferred {
                program_pubkey: loan.program_pubkey,
                new_authority: ctx.accounts.borrower.key(),
            });
        }

        // Distribute interest to depositors (100% of interest goes to depositors)
        distribute_yield(&mut ctx.accounts.protocol_config, interest);

        // Update loan state
        let loan = &mut ctx.accounts.loan;
        loan.state = LoanState::Repaid;
        loan.repaid_ts = Some(clock.unix_timestamp);
        loan.interest_paid = Some(interest);

        // Update protocol state
        ctx.accounts.protocol_config.total_loans_outstanding -= loan.principal;

        emit_cpi!(LoanRepaid {
            loan_id: loan.loan_id,
            total_repaid: total_due,
            interest_paid: interest,
        });

        Ok(())
    }*/


    pub fn repay_loan(ctx: Context<RepayLoan>, loan_id: u64) -> Result<()> {
    require!(!ctx.accounts.protocol_config.is_paused, ErrorCode::ProtocolPaused);
    
    let loan = &ctx.accounts.loan;
    require!(loan.state == LoanState::Active, ErrorCode::LoanNotActive);
    require!(loan.borrower == ctx.accounts.borrower.key(), ErrorCode::UnauthorizedBorrower);
    require!(loan.loan_id == loan_id, ErrorCode::InvalidLoanId);

    let clock = Clock::get()?;
    let elapsed = (clock.unix_timestamp - loan.start_ts) as u64;
    
    // Calculate interest
    let interest = calculate_interest(
        loan.principal,
        loan.interest_rate_bps,
        elapsed,
    );
    
    let total_due = loan.principal + interest;

    // Transfer repayment from borrower to vault
    let ix = system_instruction::transfer(
        &ctx.accounts.borrower.key(),
        &ctx.accounts.vault.key(),
        total_due,
    );
    invoke(
        &ix,
        &[
            ctx.accounts.borrower.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    // Distribute interest to depositors
    distribute_yield(&mut ctx.accounts.protocol_config, interest);

    // Update loan state - marked as paid but authority not yet transferred
    let loan = &mut ctx.accounts.loan;
    loan.state = LoanState::RepaidPendingTransfer;
    loan.repaid_ts = Some(clock.unix_timestamp);
    loan.interest_paid = Some(interest);

    // Update protocol state
    ctx.accounts.protocol_config.total_loans_outstanding -= loan.principal;

    emit_cpi!(LoanRepaid {
        loan_id: loan.loan_id,
        total_repaid: total_due,
        interest_paid: interest,
    });

    Ok(())
}
//only called by deployer
pub fn transfer_authority_to_borrower(
    ctx: Context<TransferAuthorityToBorrower>,
    loan_id: u64,
) -> Result<()> {
    let loan = &ctx.accounts.loan;
    
    require!(
        loan.state == LoanState::RepaidPendingTransfer,
        ErrorCode::LoanNotRepaid
    );
    require!(loan.loan_id == loan_id, ErrorCode::InvalidLoanId);
    require!(loan.program_pubkey != Pubkey::default(), ErrorCode::InvalidProgram);

    // Transfer upgrade authority from deployer to borrower
    let ix = bpf_loader_upgradeable::set_upgrade_authority(
        &loan.program_pubkey,
        &ctx.accounts.deployer.key(),
        Some(&loan.borrower),
    );
    
    invoke(
        &ix,
        &[
            ctx.accounts.program_data.to_account_info(),
            ctx.accounts.deployer.to_account_info(),
            ctx.accounts.borrower.to_account_info(),
            ctx.accounts.bpf_upgradeable_loader.to_account_info(),
        ],
    )?;

    // Update loan state to fully repaid
    let loan = &mut ctx.accounts.loan;
    loan.state = LoanState::Repaid;

    emit_cpi!(AuthorityTransferred {
        program_pubkey: loan.program_pubkey,
        new_authority: loan.borrower,
    });

    Ok(())
}

    /// Recover expired loan
    pub fn recover_loan(ctx: Context<RecoverLoan>) -> Result<()> {
        require!(!ctx.accounts.protocol_config.is_paused, ErrorCode::ProtocolPaused);
        
        let loan = &ctx.accounts.loan;
        require!(loan.state == LoanState::Active || loan.state == LoanState::Pending, ErrorCode::LoanNotActive);
        
        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp >= loan.start_ts + loan.duration,
            ErrorCode::LoanNotExpired
        );

        // Note: The protocol maintains upgrade authority of the expired program
        // The off-chain deployer can close the program account and return SOL via return_reclaimed_sol
        
        // Principal is already gone (used for deployment)
        // Admin fee was already collected upfront
        
        // Split admin fee between depositors and treasury based on config
        let depositor_share = (loan.admin_fee_paid as u128)
            .checked_mul(ctx.accounts.protocol_config.admin_fee_split_bps as u128)
            .unwrap()
            .checked_div(10_000)
            .unwrap() as u64;
        
        let treasury_share = loan.admin_fee_paid - depositor_share;
        
        // Transfer treasury share from admin PDA to treasury
        if treasury_share > 0 {
            let admin_seeds = &[ADMIN_SEED, &[ctx.bumps.admin_pda]];
            let signer = &[&admin_seeds[..]];
            
          //  **ctx.accounts.admin_pda.try_borrow_mut_lamports()? -= treasury_share;
          //  **ctx.accounts.treasury.try_borrow_mut_lamports()? += treasury_share;

            let ix = system_instruction::transfer(
            &ctx.accounts.admin_pda.key(),
            &ctx.accounts.treasury.key(),
            treasury_share,
            );
            invoke(
                        &ix,
                &[
                ctx.accounts.admin_pda.to_account_info(),
                ctx.accounts.treasury.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                 ],
            )?;
           }
        
        // Distribute depositor share as yield
        if depositor_share > 0 {
            distribute_yield(&mut ctx.accounts.protocol_config, depositor_share);
        }

        // Update loan state
        let loan = &mut ctx.accounts.loan;
        loan.state = LoanState::Recovered;
        loan.recovered_ts = Some(clock.unix_timestamp);

        // Update protocol state (principal already deducted at origination)
        ctx.accounts.protocol_config.total_loans_outstanding -= loan.principal;

        emit_cpi!(LoanRecovered {
            loan_id: loan.loan_id,
            admin_fee_distributed: loan.admin_fee_paid,
            depositor_share,
            treasury_share,
        });

        Ok(())
    }

    /// Admin function to pause/unpause protocol
    pub fn set_paused(ctx: Context<AdminAction>, is_paused: bool) -> Result<()> {
        ctx.accounts.protocol_config.is_paused = is_paused;
        
        emit!(ProtocolPausedChanged {
            is_paused,
        });
        
        Ok(())
    }
/* 
    /// Reclaim program authority for recovered loans (enables closing program accounts)
    pub fn reclaim_program_authority(ctx: Context<ReclaimProgramAuthority>) -> Result<()> {
        let loan = &ctx.accounts.loan;
        
        // Ensure loan has been recovered
        require!(loan.state == LoanState::Recovered, ErrorCode::LoanNotRecovered);
        require!(loan.program_pubkey != Pubkey::default(), ErrorCode::InvalidProgram);
        
        // The protocol already holds the authority (it was never transferred in recovery)
        // This instruction is for explicit actions like closing the program account
        
        emit_cpi!(AuthorityReclaimed {
            loan_id: loan.loan_id,
            program_pubkey: loan.program_pubkey,
            authority: ctx.accounts.authority_pda.key(),
        });
        
        Ok(())
    }
*/
    /// Return reclaimed SOL from expired/recovered loans back to vault
    pub fn return_reclaimed_sol(ctx: Context<ReturnReclaimedSol>, amount: u64) -> Result<()> {
        let loan = &ctx.accounts.loan;
        
        // Ensure loan has been recovered
        require!(loan.state == LoanState::Recovered ||
                 loan.state == LoanState::Pending , ErrorCode::LoanNotRecovered);
        
        // Ensure caller is authorized (admin or deployer)
        require!(
            ctx.accounts.caller.key() == ctx.accounts.protocol_config.admin || 
            ctx.accounts.caller.key() == ctx.accounts.protocol_config.deployer,
            ErrorCode::Unauthorized
        );
        
        // Transfer SOL from deployer back to vault
        let ix = system_instruction::transfer(
            &ctx.accounts.deployer_pda.key(),
            &ctx.accounts.vault.key(),
            amount,
        );
        invoke(
            &ix,
            &[
                ctx.accounts.deployer_pda.to_account_info(),
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
        
        // Update loan record to track reclaimed amount
        let loan = &mut ctx.accounts.loan;
        loan.reclaimed_amount = Some(loan.reclaimed_amount.unwrap_or(0) + amount);
        loan.reclaimed_ts = Some(Clock::get()?.unix_timestamp);
        
        emit_cpi!(SolReclaimed {
            loan_id: loan.loan_id,
            amount,
            total_reclaimed: loan.reclaimed_amount.unwrap_or(0),
        });
        
        Ok(())
    }

    /// Admin function to update configuration
    pub fn update_config(
        ctx: Context<AdminAction>,
        admin_fee_split_bps: Option<u16>,
        default_interest_rate_bps: Option<u16>,
        default_admin_fee_bps: Option<u16>,
        deployer: Option<Pubkey>,
        treasury: Option<Pubkey>,
    ) -> Result<()> {
        let config = &mut ctx.accounts.protocol_config;
        
        if let Some(split) = admin_fee_split_bps {
            require!(split <= 10000, ErrorCode::InvalidParameter);
            config.admin_fee_split_bps = split;
        }
        
        if let Some(rate) = default_interest_rate_bps {
            require!(rate <= 10000, ErrorCode::InvalidParameter);
            config.default_interest_rate_bps = rate;
        }
        
        if let Some(fee) = default_admin_fee_bps {
            require!(fee <= 10000, ErrorCode::InvalidParameter);
            config.default_admin_fee_bps = fee;
        }
        
        if let Some(deployer) = deployer {
            config.deployer = deployer;
        }
        
        if let Some(treasury) = treasury {
            config.treasury = treasury;
        }
        
        emit_cpi!(ConfigUpdated {
            admin_fee_split_bps: config.admin_fee_split_bps,
            default_interest_rate_bps: config.default_interest_rate_bps,
            default_admin_fee_bps: config.default_admin_fee_bps,
        });
        
        Ok(())
    }
}

/// Helper function to calculate interest
fn calculate_interest(principal: u64, rate_bps: u16, elapsed_seconds: u64) -> u64 {
    let interest = (principal as u128)
        .checked_mul(rate_bps as u128)
        .unwrap()
        .checked_mul(elapsed_seconds as u128)
        .unwrap()
        .checked_div(10_000u128 * SECONDS_PER_YEAR as u128)
        .unwrap();
    
    interest as u64
}

/// Helper function to distribute yield to depositors
fn distribute_yield(config: &mut ProtocolConfig, amount: u64) {
    if config.total_deposits > 0 && amount > 0 {
        // This increases the value per share for all depositors
        // In a real implementation, you'd update a yield_per_share variable
        // that gets factored into withdrawal calculations
        config.total_yield_distributed += amount;
    }
}

// ===== CONTEXTS =====
#[event_cpi]
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    
    #[account(
        init,
        payer = admin,
        space = 8 + ProtocolConfig::SIZE,
        seeds = [PROTOCOL_CONFIG_SEED],
        bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
    
    /// CHECK: Vault PDA for storing deposits
    #[account(
        seeds = [VAULT_SEED],
        bump
    )]
    pub vault: AccountInfo<'info>,
    
    /// CHECK: Authority PDA for program upgrade authority
    #[account(
        seeds = [AUTHORITY_SEED],
        bump
    )]
    pub authority_pda: AccountInfo<'info>,
    
    /// CHECK: Admin fee collection PDA
    #[account(
        seeds = [ADMIN_SEED],
        bump
    )]
    pub admin_pda: AccountInfo<'info>,
    
    /// CHECK: Treasury PDA
    #[account(
        seeds = [TREASURY_SEED],
        bump
    )]
    pub treasury: AccountInfo<'info>,

    /// CHECK: Deployer that receives funds for deployment
    pub deployer: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

#[event_cpi]
#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    
    #[account(
        init_if_needed,
        payer = depositor,
        space = 8 + DepositorRecord::SIZE,
        seeds = [DEPOSITOR_SEED, depositor.key().as_ref()],
        bump
    )]
    pub depositor_record: Account<'info, DepositorRecord>,
    
    #[account(
        mut,
        seeds = [PROTOCOL_CONFIG_SEED],
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
    
    /// CHECK: Vault PDA
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump
    )]
    pub vault: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

#[event_cpi]
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,
    
    #[account(
        mut,
        seeds = [DEPOSITOR_SEED, depositor.key().as_ref()],
        bump = depositor_record.bump,
        constraint = depositor_record.owner == depositor.key() @ ErrorCode::UnauthorizedDepositor
    )]
    pub depositor_record: Account<'info, DepositorRecord>,
    
    #[account(
        mut,
        seeds = [PROTOCOL_CONFIG_SEED],
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
    
    /// CHECK: Vault PDA
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump
    )]
    pub vault: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

#[event_cpi]
#[derive(Accounts)]
//#[instruction(loan_id: u64)]
pub struct RequestLoan<'info> {
    #[account(mut)]
    pub borrower: Signer<'info>,
    
    #[account(
        init,
        payer = borrower,
        space = 8 + Loan::SIZE,
        seeds = [LOAN_SEED, protocol_config.loan_counter.to_le_bytes().as_ref(), &borrower.key().to_bytes()],
        bump
    )]
    pub loan: Account<'info, Loan>,
    
    #[account(
        mut,
        seeds = [PROTOCOL_CONFIG_SEED],
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
    
    /// CHECK: Vault PDA
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump
    )]
    pub vault: AccountInfo<'info>,
    
    /// CHECK: Authority PDA for program control
    #[account(
        seeds = [AUTHORITY_SEED],
        bump
    )]
    pub authority_pda: AccountInfo<'info>,
    
    /// CHECK: Admin fee collection PDA
    #[account(
        mut,
        seeds = [ADMIN_SEED],
        bump
    )]
    pub admin_pda: AccountInfo<'info>,
    
    
    /// CHECK: Deployer wallet - receives funds for deployment
    #[account(
        mut,
        constraint = deployer.key() == protocol_config.deployer @ ErrorCode::Unauthorized
    )]
    pub deployer: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

#[event_cpi]
#[derive(Accounts)]
#[instruction(loan_id: u64)]
pub struct SetDeployedProgram<'info> {
    pub admin: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PROTOCOL_CONFIG_SEED],
        has_one = admin @ ErrorCode::Unauthorized,
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
    
    #[account(
        mut,
        seeds = [LOAN_SEED, loan_id.to_le_bytes().as_ref(), &loan.borrower.to_bytes()],
        bump = loan.bump
    )]
    pub loan: Account<'info, Loan>,
}

#[event_cpi]
#[derive(Accounts)]
#[instruction(loan_id: u64)]
pub struct RepayLoan<'info> {
    #[account(mut)]
    pub borrower: Signer<'info>,
    
    #[account(
        mut,
        has_one = borrower @ ErrorCode::UnauthorizedBorrower,
        seeds = [LOAN_SEED, loan_id.to_le_bytes().as_ref(), &borrower.key().to_bytes()],
        bump = loan.bump
    )]
    pub loan: Account<'info, Loan>,
    
    #[account(
        mut,
        seeds = [PROTOCOL_CONFIG_SEED],
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
    
    /// CHECK: Vault PDA
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump
    )]
    pub vault: AccountInfo<'info>,
    /* 
    /// CHECK: Authority PDA that currently controls the program
    #[account(
        seeds = [AUTHORITY_SEED],
        bump
    )]
    pub authority_pda: AccountInfo<'info>,
    /// CHECK: Deployer wallet that currently controls the program upgrade authority
    #[account(
        constraint = deployer.key() == protocol_config.deployer @ ErrorCode::Unauthorized
    )]
    pub deployer: Signer<'info>,  // Must sign to transfer authority
    
    /// CHECK: Program data account for the deployed program
    pub program_data: AccountInfo<'info>,*/
    
    pub system_program: Program<'info, System>,
}

#[event_cpi]
#[derive(Accounts)]
#[instruction(loan_id: u64)]
pub struct TransferAuthorityToBorrower<'info> {
    /// CHECK: Deployer wallet that currently controls the program upgrade authority
    #[account(
        constraint = deployer.key() == protocol_config.deployer @ ErrorCode::Unauthorized
    )]
    pub deployer: Signer<'info>,
    
    #[account(
        seeds = [PROTOCOL_CONFIG_SEED],
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
    
    #[account(
        mut,
        seeds = [LOAN_SEED, loan_id.to_le_bytes().as_ref(), &loan.borrower.to_bytes()],
        bump = loan.bump
    )]
    pub loan: Account<'info, Loan>,
    
    /// CHECK: Borrower who will receive authority
    #[account(mut)]
    pub borrower: AccountInfo<'info>,
    
    /// CHECK: Program data account for the deployed program
    #[account(mut)] 
    pub program_data: AccountInfo<'info>,

    /// CHECK: BPF Upgradeable Loader program
    #[account(address = bpf_loader_upgradeable::ID)]
    pub bpf_upgradeable_loader: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

#[event_cpi]
#[derive(Accounts)]
pub struct RecoverLoan<'info> {
    pub admin: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PROTOCOL_CONFIG_SEED],
        has_one = admin @ ErrorCode::Unauthorized,
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
    
    #[account(
        mut,
        seeds = [LOAN_SEED, protocol_config.loan_counter.to_le_bytes().as_ref(), &loan.borrower.to_bytes()],
        bump = loan.bump
    )]
    pub loan: Account<'info, Loan>,

    /// CHECK: Deployer wallet that currently controls the program
    #[account(
        constraint = deployer.key() == protocol_config.deployer @ ErrorCode::Unauthorized
    )]
    pub deployer: Signer<'info>,  // Must sign to transfer authority
    
    /// CHECK: Admin fee PDA
    #[account(
        mut,
        seeds = [ADMIN_SEED],
        bump
    )]
    pub admin_pda: AccountInfo<'info>,
    
    /// CHECK: Treasury PDA
    #[account(mut)]
    pub treasury: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

#[event_cpi]
#[derive(Accounts)]
pub struct ReclaimProgramAuthority<'info> {
    pub admin: Signer<'info>,
    
    #[account(
        seeds = [PROTOCOL_CONFIG_SEED],
        has_one = admin @ ErrorCode::Unauthorized,
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
    
    #[account(
        constraint = loan.state == LoanState::Recovered @ ErrorCode::LoanNotRecovered,
        seeds = [LOAN_SEED, protocol_config.loan_counter.to_le_bytes().as_ref(), &loan.borrower.to_bytes()],
        bump = loan.bump
    )]
    pub loan: Account<'info, Loan>,
    
    /// CHECK: Authority PDA that controls the program
    #[account(
        seeds = [AUTHORITY_SEED],
        bump
    )]
    pub authority_pda: AccountInfo<'info>,
}

#[event_cpi]
#[derive(Accounts)]
pub struct ReturnReclaimedSol<'info> {
    pub caller: Signer<'info>,
    
    #[account(
        seeds = [PROTOCOL_CONFIG_SEED],
        bump = protocol_config.bump,
        constraint = caller.key() == protocol_config.admin || caller.key() == protocol_config.deployer @ ErrorCode::Unauthorized
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
    
    #[account(
        mut,
        seeds = [LOAN_SEED, protocol_config.loan_counter.to_le_bytes().as_ref(), &loan.borrower.to_bytes()],
        bump = loan.bump
    )]
    pub loan: Account<'info, Loan>,
    
    /// CHECK: Vault PDA
    #[account(
        mut,
        seeds = [VAULT_SEED],
        bump
    )]
    pub vault: AccountInfo<'info>,
    
    /// CHECK: Deployer PDA that holds reclaimed SOL
    #[account(mut)]
    pub deployer_pda: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

#[event_cpi]
#[derive(Accounts)]
pub struct AdminAction<'info> {
    pub admin: Signer<'info>,
    
    #[account(
        mut,
        seeds = [PROTOCOL_CONFIG_SEED],
        has_one = admin @ ErrorCode::Unauthorized,
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
}

// ===== STATE STRUCTS =====

#[account]
pub struct ProtocolConfig {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub deployer: Pubkey,
    pub admin_fee_split_bps: u16,      // % to depositors vs treasury
    pub default_interest_rate_bps: u16,
    pub default_admin_fee_bps: u16,
    pub total_deposits: u64,
    pub total_loans_outstanding: u64,
    pub total_yield_distributed: u64,
    pub loan_counter: u64,
    pub is_paused: bool,
    pub bump: u8,
}

impl ProtocolConfig {
    pub const SIZE: usize = 32 + 32 + 32 + 2 + 2 + 2 + 8 + 8 + 8 + 8 + 1 + 8;
}

#[account]
pub struct DepositorRecord {
    pub owner: Pubkey,
    pub deposited_amount: u64,
    pub share_amount: u64,      // Can differ from deposited due to yield
    pub last_update_ts: i64,
    pub bump: u8,
}

impl DepositorRecord {
    pub const SIZE: usize = 32 + 8 + 8 + 8 + 8;
}

#[account]
pub struct Loan {
    pub loan_id: u64,
    pub borrower: Pubkey,
    pub program_pubkey: Pubkey,  // Set after deployment
    pub principal: u64,
    pub duration: i64,
    pub interest_rate_bps: u16,
    pub admin_fee_bps: u16,
    pub admin_fee_paid: u64,
    pub start_ts: i64,
    pub state: LoanState,
    pub authority_pda: Pubkey,
    pub repaid_ts: Option<i64>,
    pub recovered_ts: Option<i64>,
    pub interest_paid: Option<u64>,
    pub reclaimed_amount: Option<u64>,
    pub reclaimed_ts: Option<i64>,
    pub bump: u8,
}

impl Loan {
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 8 + 2 + 2 + 8 + 8 + 1 + 32 + 9 + 9 + 9 + 9 + 9 + 8;
}

#[account]
pub struct BorrowerLoanRecord{
    pub borrower: Pubkey,
    pub loan_id: u64,
    pub requested_lamports: u64,
    pub repayed: bool,
    pub expire_ts: i64,
    pub deployed_program: Pubkey,
    pub bump: u8,
}

#[derive(Debug)]
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum LoanState {
    Active,
    Repaid,
    Recovered,
    Pending,
    RepaidPendingTransfer,
}

// ===== EVENTS =====

#[event]
pub struct ProtocolInitialized {
    pub admin: Pubkey,
    pub treasury: Pubkey,
}

#[event]
pub struct Deposited {
    pub depositor: Pubkey,
    pub amount: u64,
    pub total_deposits: u64,
}

#[event]
pub struct Withdrawn {
    pub depositor: Pubkey,
    pub amount: u64,
    pub remaining_balance: u64,
}

#[event]
pub struct LoanRequested {
    pub borrower: Pubkey,
    pub loan_id: u64,
    pub principal: u64,
    pub duration: i64,
    pub interest_rate_bps: u16,
    pub admin_fee: u64,
}

#[event]
pub struct LoanDeployed {
    pub loan_id: u64,
    pub program_pubkey: Pubkey,
}

#[event]
pub struct LoanRepaid {
    pub loan_id: u64,
    pub total_repaid: u64,
    pub interest_paid: u64,
}

#[event]
pub struct LoanRecovered {
    pub loan_id: u64,
    pub admin_fee_distributed: u64,
    pub depositor_share: u64,
    pub treasury_share: u64,
}

#[event]
pub struct AuthorityTransferred {
    pub program_pubkey: Pubkey,
    pub new_authority: Pubkey,
}

#[event]
pub struct AuthorityReclaimed {
    pub loan_id: u64,
    pub program_pubkey: Pubkey,
    pub authority: Pubkey,
}

#[event]
pub struct SolReclaimed {
    pub loan_id: u64,
    pub amount: u64,
    pub total_reclaimed: u64,
}

#[event]
pub struct ProtocolPausedChanged {
    pub is_paused: bool,
}

#[event]
pub struct ConfigUpdated {
    pub admin_fee_split_bps: u16,
    pub default_interest_rate_bps: u16,
    pub default_admin_fee_bps: u16,
}

// ===== ERRORS =====

#[error_code]
pub enum ErrorCode {
    #[msg("Protocol is currently paused")]
    ProtocolPaused,
    #[msg("Invalid amount provided")]
    InvalidAmount,
    #[msg("Insufficient balance")]
    InsufficientBalance,
    #[msg("Insufficient liquidity in vault")]
    InsufficientLiquidity,
    #[msg("Invalid duration")]
    InvalidDuration,
    #[msg("Invalid interest rate")]
    InvalidInterestRate,
    #[msg("Invalid admin fee")]
    InvalidAdminFee,
    #[msg("Loan is not active")]
    LoanNotActive,
    #[msg("Unauthorized borrower")]
    UnauthorizedBorrower,
    #[msg("Loan has not expired yet")]
    LoanNotExpired,
    #[msg("Loan has not been recovered")]
    LoanNotRecovered,
    #[msg("Loan has not been repaid")]
    LoanNotRepaid,
    #[msg("Unauthorized action")]
    Unauthorized,
    #[msg("Invalid parameter")]
    InvalidParameter,
    #[msg("Unauthorized depositor")]
    UnauthorizedDepositor,
    #[msg("Invalid loan ID")]
    InvalidLoanId,
    #[msg("Program already set for this loan")]
    ProgramAlreadySet,
    #[msg("Invalid program pubkey")]
    InvalidProgram,
}

#[cfg(test)]
mod tests {
    use super::*;

    // ===== CALCULATE INTEREST TESTS =====

    #[test]
    fn test_calculate_interest_zero_principal() {
        let principal = 0;
        let rate_bps = 500; // 5%
        let elapsed = 31_536_000; // 1 year
        
        let interest = calculate_interest(principal, rate_bps, elapsed);
        assert_eq!(interest, 0);
    }

    #[test]
    fn test_calculate_interest_zero_rate() {
        let principal = 1_000_000_000; // 1 SOL
        let rate_bps = 0;
        let elapsed = 31_536_000; // 1 year
        
        let interest = calculate_interest(principal, rate_bps, elapsed);
        assert_eq!(interest, 0);
    }

    #[test]
    fn test_calculate_interest_zero_time() {
        let principal = 1_000_000_000; // 1 SOL
        let rate_bps = 500; // 5%
        let elapsed = 0;
        
        let interest = calculate_interest(principal, rate_bps, elapsed);
        assert_eq!(interest, 0);
    }

    #[test]
    fn test_calculate_interest_one_year_simple() {
        let principal = 1_000_000_000; // 1 SOL (1 billion lamports)
        let rate_bps = 500; // 5%
        let elapsed = 31_536_000; // 1 year in seconds
        
        // Expected: 1 SOL * 5% * 1 year = 0.05 SOL = 50_000_000 lamports
        let interest = calculate_interest(principal, rate_bps, elapsed);
        assert_eq!(interest, 50_000_000);
    }

    #[test]
    fn test_calculate_interest_half_year() {
        let principal = 1_000_000_000; // 1 SOL
        let rate_bps = 1000; // 10%
        let elapsed = 15_768_000; // 0.5 year in seconds
        
        // Expected: 1 SOL * 10% * 0.5 year = 0.05 SOL = 50_000_000 lamports
        let interest = calculate_interest(principal, rate_bps, elapsed);
        assert_eq!(interest, 50_000_000);
    }

    #[test]
    fn test_calculate_interest_one_month() {
        let principal = 10_000_000_000; // 10 SOL
        let rate_bps = 1200; // 12% annual
        let elapsed = 2_628_000; // ~1 month (1/12 year)
        
        // Expected: 10 SOL * 12% * (1/12) = 0.1 SOL = 100_000_000 lamports
        let interest = calculate_interest(principal, rate_bps, elapsed);
        assert_eq!(interest, 100_000_000);
    }

    #[test]
    fn test_calculate_interest_one_day() {
        let principal = 1_000_000_000; // 1 SOL
        let rate_bps = 730; // 7.3% annual
        let elapsed = 86_400; // 1 day in seconds
        
        // Expected: 1 SOL * 7.3% * (1/365) ≈ 200_000 lamports
        let interest = calculate_interest(principal, rate_bps, elapsed);
        assert_eq!(interest, 200_000);
    }

    #[test]
    fn test_calculate_interest_large_principal() {
        let principal = 100_000_000_000; // 100 SOL
        let rate_bps = 800; // 8%
        let elapsed = 31_536_000; // 1 year
        
        // Expected: 100 SOL * 8% * 1 year = 8 SOL = 8_000_000_000 lamports
        let interest = calculate_interest(principal, rate_bps, elapsed);
        assert_eq!(interest, 8_000_000_000);
    }

    #[test]
    fn test_calculate_interest_max_rate() {
        let principal = 1_000_000_000; // 1 SOL
        let rate_bps = 10000; // 100%
        let elapsed = 31_536_000; // 1 year
        
        // Expected: 1 SOL * 100% * 1 year = 1 SOL = 1_000_000_000 lamports
        let interest = calculate_interest(principal, rate_bps, elapsed);
        assert_eq!(interest, 1_000_000_000);
    }

    #[test]
    fn test_calculate_interest_small_amounts() {
        let principal = 1_000_000; // 0.001 SOL
        let rate_bps = 500; // 5%
        let elapsed = 31_536_000; // 1 year
        
        // Expected: 0.001 SOL * 5% * 1 year = 0.00005 SOL = 50_000 lamports
        let interest = calculate_interest(principal, rate_bps, elapsed);
        assert_eq!(interest, 50_000);
    }

    #[test]
    fn test_calculate_interest_multiple_years() {
        let principal = 5_000_000_000; // 5 SOL
        let rate_bps = 600; // 6%
        let elapsed = 63_072_000; // 2 years
        
        // Expected: 5 SOL * 6% * 2 years = 0.6 SOL = 600_000_000 lamports
        let interest = calculate_interest(principal, rate_bps, elapsed);
        assert_eq!(interest, 600_000_000);
    }

    #[test]
    fn test_calculate_interest_fractional_bps() {
        let principal = 10_000_000_000; // 10 SOL
        let rate_bps = 123; // 1.23%
        let elapsed = 31_536_000; // 1 year
        
        // Expected: 10 SOL * 1.23% * 1 year = 0.123 SOL = 123_000_000 lamports
        let interest = calculate_interest(principal, rate_bps, elapsed);
        assert_eq!(interest, 123_000_000);
    }

    #[test]
    fn test_calculate_interest_very_short_duration() {
        let principal = 1_000_000_000; // 1 SOL
        let rate_bps = 500; // 5%
        let elapsed = 3600; // 1 hour
        
        // Expected: very small interest for 1 hour
        let interest = calculate_interest(principal, rate_bps, elapsed);
        assert!(interest < 10_000); // Should be less than 0.00001 SOL
    }

    // ===== DISTRIBUTE YIELD TESTS =====

    #[test]
    fn test_distribute_yield_zero_deposits() {
        let mut config = ProtocolConfig {
            admin: Pubkey::default(),
            treasury: Pubkey::default(),
            deployer: Pubkey::default(),
            admin_fee_split_bps: 5000,
            default_interest_rate_bps: 500,
            default_admin_fee_bps: 100,
            total_deposits: 0,
            total_loans_outstanding: 0,
            total_yield_distributed: 0,
            loan_counter: 0,
            is_paused: false,
            bump: 0,
        };

        let initial_yield = config.total_yield_distributed;
        distribute_yield(&mut config, 1_000_000);
        
        // Should not increase yield when no deposits
        assert_eq!(config.total_yield_distributed, initial_yield);
    }

    #[test]
    fn test_distribute_yield_zero_amount() {
        let mut config = ProtocolConfig {
            admin: Pubkey::default(),
            treasury: Pubkey::default(),
            deployer: Pubkey::default(),
            admin_fee_split_bps: 5000,
            default_interest_rate_bps: 500,
            default_admin_fee_bps: 100,
            total_deposits: 10_000_000_000,
            total_loans_outstanding: 0,
            total_yield_distributed: 0,
            loan_counter: 0,
            is_paused: false,
            bump: 0,
        };

        let initial_yield = config.total_yield_distributed;
        distribute_yield(&mut config, 0);
        
        // Should not change when amount is zero
        assert_eq!(config.total_yield_distributed, initial_yield);
    }

    #[test]
    fn test_distribute_yield_normal_case() {
        let mut config = ProtocolConfig {
            admin: Pubkey::default(),
            treasury: Pubkey::default(),
            deployer: Pubkey::default(),
            admin_fee_split_bps: 5000,
            default_interest_rate_bps: 500,
            default_admin_fee_bps: 100,
            total_deposits: 10_000_000_000, // 10 SOL
            total_loans_outstanding: 5_000_000_000,
            total_yield_distributed: 0,
            loan_counter: 1,
            is_paused: false,
            bump: 0,
        };

        let yield_amount = 500_000_000; // 0.5 SOL
        distribute_yield(&mut config, yield_amount);
        
        assert_eq!(config.total_yield_distributed, yield_amount);
    }

    #[test]
    fn test_distribute_yield_multiple_distributions() {
        let mut config = ProtocolConfig {
            admin: Pubkey::default(),
            treasury: Pubkey::default(),
            deployer: Pubkey::default(),
            admin_fee_split_bps: 5000,
            default_interest_rate_bps: 500,
            default_admin_fee_bps: 100,
            total_deposits: 20_000_000_000, // 20 SOL
            total_loans_outstanding: 10_000_000_000,
            total_yield_distributed: 0,
            loan_counter: 2,
            is_paused: false,
            bump: 0,
        };

        // First distribution
        distribute_yield(&mut config, 100_000_000);
        assert_eq!(config.total_yield_distributed, 100_000_000);

        // Second distribution
        distribute_yield(&mut config, 200_000_000);
        assert_eq!(config.total_yield_distributed, 300_000_000);

        // Third distribution
        distribute_yield(&mut config, 150_000_000);
        assert_eq!(config.total_yield_distributed, 450_000_000);
    }

    #[test]
    fn test_distribute_yield_large_amount() {
        let mut config = ProtocolConfig {
            admin: Pubkey::default(),
            treasury: Pubkey::default(),
            deployer: Pubkey::default(),
            admin_fee_split_bps: 5000,
            default_interest_rate_bps: 500,
            default_admin_fee_bps: 100,
            total_deposits: 100_000_000_000, // 100 SOL
            total_loans_outstanding: 50_000_000_000,
            total_yield_distributed: 0,
            loan_counter: 5,
            is_paused: false,
            bump: 0,
        };

        let yield_amount = 10_000_000_000; // 10 SOL
        distribute_yield(&mut config, yield_amount);
        
        assert_eq!(config.total_yield_distributed, yield_amount);
    }

    #[test]
    fn test_distribute_yield_small_deposits_large_yield() {
        let mut config = ProtocolConfig {
            admin: Pubkey::default(),
            treasury: Pubkey::default(),
            deployer: Pubkey::default(),
            admin_fee_split_bps: 5000,
            default_interest_rate_bps: 500,
            default_admin_fee_bps: 100,
            total_deposits: 1_000_000, // 0.001 SOL
            total_loans_outstanding: 0,
            total_yield_distributed: 0,
            loan_counter: 0,
            is_paused: false,
            bump: 0,
        };

        let yield_amount = 10_000_000_000; // 10 SOL (yield exceeds deposits)
        distribute_yield(&mut config, yield_amount);
        
        // Should still work, just means high APY
        assert_eq!(config.total_yield_distributed, yield_amount);
    }

    // ===== EDGE CASE TESTS =====

    #[test]
    fn test_calculate_interest_overflow_protection() {
        // Test with very large values to ensure no overflow
        let principal = u64::MAX / 100; // Large but safe principal
        let rate_bps = 100; // 1%
        let elapsed = 31_536_000; // 1 year
        
        // Should not panic
        let interest = calculate_interest(principal, rate_bps, elapsed);
        assert!(interest > 0);
    }

    #[test]
    fn test_calculate_interest_precision() {
        // Test that small interest amounts are calculated correctly
        let principal = 1_000; // Very small amount
        let rate_bps = 1; // 0.01%
        let elapsed = 31_536_000; // 1 year
        
        // Expected: 1000 * 0.0001 * 1 = 0 (rounds down due to integer math)
        let interest = calculate_interest(principal, rate_bps, elapsed);
        assert_eq!(interest, 0);
    }

    #[test]
    fn test_loan_state_equality() {
        assert_eq!(LoanState::Active, LoanState::Active);
        assert_eq!(LoanState::Repaid, LoanState::Repaid);
        assert_eq!(LoanState::Recovered, LoanState::Recovered);
        assert_ne!(LoanState::Active, LoanState::Repaid);
        assert_ne!(LoanState::Repaid, LoanState::Recovered);
        assert_ne!(LoanState::Active, LoanState::Recovered);
    }

    #[test]
    fn test_protocol_config_size() {
        // Verify the SIZE constant matches actual struct size requirements
        assert!(ProtocolConfig::SIZE >= 32 * 3 + 2 * 3 + 8 * 4 + 1);
    }

    #[test]
    fn test_depositor_record_size() {
        // Verify the SIZE constant matches actual struct size requirements
        assert!(DepositorRecord::SIZE >= 32 + 8 * 3);
    }

    #[test]
    fn test_loan_size() {
        // Verify the SIZE constant matches actual struct size requirements
        assert!(Loan::SIZE >= 32 * 3 + 8 * 4 + 2 * 2 + 1 + 9 * 5);
    }
}