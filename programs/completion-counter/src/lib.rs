//! Campaign-scoped verified-completion counter for the ARG Merchant Quest demo.
//!
//! One small PDA per campaign holds `completed` as a little-endian u64. The
//! program can hand that PDA to a MagicBlock Ephemeral Rollup (delegate), accept
//! the verified-completion increment there, and let the client commit the state
//! back to Solana.
//!
//! Instructions (first data byte):
//!   0 = initialize  — reset the count to zero
//!   1 = increment   — add one verified completion
//!   2 = delegate    — create the delegate buffer, assign the PDA to the
//!                     delegation program and CPI the delegate instruction
//!   4 = commit      — schedule an ER commit of the counter to Solana
//!
//! Counter PDA seeds:  ["counter", sha256(campaign_id)]
//! Buffer PDA seeds:   ["buffer", counter]
//!
//! The program holds no funds and stores no player data.

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    hash::hash,
    instruction::{AccountMeta, Instruction},
    msg,
    program::invoke_signed,
    program_error::ProgramError,
    pubkey::Pubkey,
    sysvar::rent::Rent,
    sysvar::Sysvar,
};

use solana_system_interface::instruction as system_instruction;

entrypoint!(process_instruction);

pub const INSTRUCTION_INITIALIZE: u8 = 0;
pub const INSTRUCTION_INCREMENT: u8 = 1;
pub const INSTRUCTION_DELEGATE: u8 = 2;
pub const INSTRUCTION_CREATE: u8 = 3;
pub const INSTRUCTION_COMMIT: u8 = 4;
pub const COUNTER_LEN: usize = 8;
pub const COUNTER_SEED: &[u8] = b"counter";
pub const BUFFER_SEED: &[u8] = b"buffer";
const DELEGATION_PROGRAM_ID: &str = "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh";

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    data: &[u8],
) -> ProgramResult {
    match data.first().copied() {
        Some(INSTRUCTION_INITIALIZE) | Some(INSTRUCTION_INCREMENT) => {
            let account = accounts.first().ok_or(ProgramError::NotEnoughAccountKeys)?;
            if account.owner != program_id {
                return Err(ProgramError::IncorrectProgramId);
            }
            let mut bytes = account.try_borrow_mut_data()?;
            if bytes.len() < COUNTER_LEN {
                return Err(ProgramError::AccountDataTooSmall);
            }
            let current = read_count(&bytes)?;
            let next = if data[0] == INSTRUCTION_INCREMENT {
                current.checked_add(1).ok_or(ProgramError::InvalidArgument)?
            } else {
                0
            };
            bytes[..COUNTER_LEN].copy_from_slice(&next.to_le_bytes());
            msg!("completion counter is now {}", next);
            Ok(())
        }
        Some(INSTRUCTION_DELEGATE) => process_delegate(program_id, accounts, data),
        Some(INSTRUCTION_COMMIT) => process_commit(program_id, accounts),
        Some(INSTRUCTION_CREATE) => process_create(program_id, accounts, data),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

fn read_count(bytes: &[u8]) -> Result<u64, ProgramError> {
    let mut current = [0u8; COUNTER_LEN];
    current.copy_from_slice(&bytes[..COUNTER_LEN]);
    Ok(u64::from_le_bytes(current))
}

/// data: [3, seed_len u8, seed bytes, counter_bump u8]
/// accounts: payer, counter PDA, system program
fn process_create(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    if data.len() < 3 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let seed_len = data[1] as usize;
    if data.len() != 2 + seed_len + 1 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let campaign_seed = &data[2..2 + seed_len];
    let bump = data[2 + seed_len];

    let iter = &mut accounts.iter();
    let payer = next_account_info(iter)?;
    let counter = next_account_info(iter)?;
    let system_program = next_account_info(iter)?;

    if !payer.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let counter_seeds: &[&[u8]] = &[COUNTER_SEED, campaign_seed, &[bump]];
    let expected = Pubkey::create_program_address(counter_seeds, program_id)?;
    if expected != *counter.key {
        return Err(ProgramError::InvalidSeeds);
    }
    if counter.lamports() > 0 {
        return Ok(());
    }

    let rent = Rent::get()?.minimum_balance(COUNTER_LEN);
    invoke_signed(
        &system_instruction::create_account(
            payer.key,
            counter.key,
            rent,
            COUNTER_LEN as u64,
            program_id,
        ),
        &[payer.clone(), counter.clone(), system_program.clone()],
        &[counter_seeds],
    )?;

    let mut bytes = counter.try_borrow_mut_data()?;
    bytes[..COUNTER_LEN].fill(0);
    msg!("completion counter created");
    Ok(())
}

/// data: [2, seed_len u8, seed bytes, counter_bump u8, buffer_bump u8]
fn process_delegate(program_id: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    if data.len() < 3 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let seed_len = data[1] as usize;
    if data.len() < 2 + seed_len + 2 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let campaign_seed = &data[2..2 + seed_len];
    let counter_bump = data[2 + seed_len];
    let buffer_bump = data[3 + seed_len];

    let iter = &mut accounts.iter();
    let payer = next_account_info(iter)?;
    let counter = next_account_info(iter)?;
    let buffer = next_account_info(iter)?;
    let delegation_record = next_account_info(iter)?;
    let delegation_metadata = next_account_info(iter)?;
    let delegation_program = next_account_info(iter)?;
    let system_program = next_account_info(iter)?;
    // The delegation CPI needs the owner program account in its account list,
    // so the caller passes this program's own account too.
    let owner_program_account = next_account_info(iter)?;
    if owner_program_account.key != program_id {
        return Err(ProgramError::IncorrectProgramId);
    }

    if !payer.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if delegation_program.key.to_string() != DELEGATION_PROGRAM_ID {
        return Err(ProgramError::IncorrectProgramId);
    }

    // Derive and verify both PDAs so an arbitrary account cannot be delegated.
    let (expected_counter, _) = Pubkey::find_program_address(
        &[COUNTER_SEED, campaign_seed],
        program_id,
    );
    let counter_seeds: &[&[u8]] = &[COUNTER_SEED, campaign_seed, &[counter_bump]];
    let counter_from_seeds = Pubkey::create_program_address(counter_seeds, program_id)?;
    if expected_counter != *counter.key || counter_from_seeds != *counter.key {
        return Err(ProgramError::InvalidSeeds);
    }
    if counter.owner != program_id {
        return Err(ProgramError::IncorrectProgramId);
    }

    let buffer_seeds: &[&[u8]] = &[BUFFER_SEED, counter.key.as_ref(), &[buffer_bump]];
    let expected_buffer = Pubkey::create_program_address(buffer_seeds, program_id)?;
    if expected_buffer != *buffer.key {
        return Err(ProgramError::InvalidSeeds);
    }

    // 1. The delegation program copies data from an owner-program buffer PDA,
    //    so make sure an empty one exists.
    if buffer.lamports() == 0 {
        let rent = Rent::get()?.minimum_balance(0);
        invoke_signed(
            &system_instruction::create_account(payer.key, buffer.key, rent, 0, program_id),
            &[payer.clone(), buffer.clone()],
            &[buffer_seeds],
        )?;
    }

    // 2. Hand ownership of the counter to the delegation program. Only the owner
    //    program may change an account's owner, and it does so directly (the
    //    system program refuses to reassign an account it does not own).
    counter.assign(delegation_program.key);

    // 3. Legacy fast delegate: 8 zero bytes, commit frequency, seeds, validator.
    //    The seeds must be the full PDA seed list (["counter", campaign]), because
    //    the delegation program re-derives the address from them.
    let mut delegate_data = Vec::with_capacity(8 + 4 + 4 + 4 + COUNTER_SEED.len() + 4 + seed_len + 33);
    delegate_data.extend_from_slice(&[0u8; 8]);
    delegate_data.extend_from_slice(&u32::MAX.to_le_bytes()); // no auto-commit
    delegate_data.extend_from_slice(&2u32.to_le_bytes()); // two seeds
    delegate_data.extend_from_slice(&(COUNTER_SEED.len() as u32).to_le_bytes());
    delegate_data.extend_from_slice(COUNTER_SEED);
    delegate_data.extend_from_slice(&(seed_len as u32).to_le_bytes());
    delegate_data.extend_from_slice(campaign_seed);
    delegate_data.push(0); // no pinned validator: use the delegation default

    let delegate_ix = Instruction {
        program_id: *delegation_program.key,
        accounts: vec![
            AccountMeta::new(*payer.key, true),
            AccountMeta::new(*counter.key, true),
            AccountMeta::new_readonly(*program_id, false),
            AccountMeta::new(*buffer.key, false),
            AccountMeta::new(*delegation_record.key, false),
            AccountMeta::new(*delegation_metadata.key, false),
            AccountMeta::new_readonly(*system_program.key, false),
        ],
        data: delegate_data,
    };

    invoke_signed(
        &delegate_ix,
        &[
            payer.clone(),
            counter.clone(),
            owner_program_account.clone(),
            buffer.clone(),
            delegation_record.clone(),
            delegation_metadata.clone(),
            system_program.clone(),
        ],
        &[counter_seeds],
    )?;

    msg!("completion counter delegated for campaign seed");
    Ok(())
}

/// data: [4]
/// accounts: payer (signer, writable), counter (writable), magic context, magic program
fn process_commit(program_id: &Pubkey, accounts: &[AccountInfo]) -> ProgramResult {
    use ephemeral_rollups_sdk::ephem::{FoldableIntentBuilder, MagicIntentBundleBuilder};

    let iter = &mut accounts.iter();
    let payer = next_account_info(iter)?;
    let counter = next_account_info(iter)?;
    let magic_context = next_account_info(iter)?;
    let magic_program = next_account_info(iter)?;

    if !payer.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if counter.owner != program_id {
        return Err(ProgramError::IncorrectProgramId);
    }

    MagicIntentBundleBuilder::new(
        payer.clone(),
        magic_context.clone(),
        magic_program.clone(),
    )
    .commit(&[counter.clone()])
    .build_and_invoke()?;

    msg!("completion counter commit scheduled");
    Ok(())
}

/// Helper for off-chain clients: the counter PDA for a campaign id.
pub fn counter_address(program_id: &Pubkey, campaign_id: &str) -> (Pubkey, u8) {
    let digest = hash(campaign_id.as_bytes());
    Pubkey::find_program_address(&[COUNTER_SEED, digest.as_ref()], program_id)
}
