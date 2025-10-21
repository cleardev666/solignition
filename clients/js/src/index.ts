/**
 * Main entry point for the Solignition client
 * Exports all generated code and adds custom helper functions
 */
export * from './generated'

import type { Address } from '@solana/kit'
import type { Loan, ProtocolConfig, DepositorRecord } from './generated'

// Type aliases for easier use in your frontend
export type LoanAccount = {
  address: Address
  data: Loan
}

export type ProtocolConfigAccount = {
  address: Address
  data: ProtocolConfig
}

export type DepositorRecordAccount = {
  address: Address
  data: DepositorRecord
}

// Re-export commonly used items for convenience
export { SOLIGNITION_PROGRAM_ADDRESS } from './generated'
export type { 
  Loan, 
  ProtocolConfig, 
  DepositorRecord,
  LoanState 
} from './generated'

// Helper function to check loan state
export function isActiveLoan(loan: Loan): boolean {
  return loan.state === 0 // LoanState.Active
}

export function isRepaidLoan(loan: Loan): boolean {
  return loan.state === 1 // LoanState.Repaid
}

export function isRecoveredLoan(loan: Loan): boolean {
  return loan.state === 2 // LoanState.Recovered
}

export function isPendingLoan(loan: Loan): boolean {
  return loan.state === 3 // LoanState.Pending
}

export function isRepaidPendingTransferLoan(loan: Loan): boolean {
  return loan.state === 4 // LoanState.RepaidPendingTransfer
}

// Helper to calculate total repayment amount
export function calculateTotalRepayment(loan: Loan): bigint {
  const interest = (loan.principal * BigInt(loan.interestRateBps)) / 10000n
  return loan.principal + interest
}