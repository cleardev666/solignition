/* 
import { useQuery } from '@tanstack/react-query'
import * as anchor from '@coral-xyz/anchor';
import { useSolana } from '@/components/solana/use-solana'
import { SOLIGNITION_PROGRAM_ADDRESS, fetchLoan, fetchMaybeLoan, fetchAllMaybeLoan } from '@project/anchor'
import { getAddressEncoder, getProgramDerivedAddress } from '@solana/kit'
import type { Address } from '@solana/kit'
import type { Loan } from '@project/anchor'
import { useProtocolConfig } from './use-protocol-config'
import {  clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import idl from '../../../../anchor/target/idl/solignition.json';
import { AnchorProvider, Idl as IDL, Program, setProvider } from '@coral-xyz/anchor';
import type { Solignition } from "../../../../anchor/target/types/solignition.ts";

export type LoanAccount = {
  address: Address
  data: Loan
}

// Helper to get RPC URL from cluster
function getRpcUrl(clusterId: string): string {
  switch (clusterId) {
    case 'solana:mainnet-beta':
      return clusterApiUrl('mainnet-beta')
    case 'solana:devnet':
      return clusterApiUrl('devnet')
    case 'solana:testnet':
      return clusterApiUrl('testnet')
    case 'solana:localnet':
      return 'http://127.0.0.1:8899'
    default:
      return 'http://127.0.0.1:8899' // Default fallback
  }
}

export function useLoans(borrower: string) {
  const { client, cluster } = useSolana()
  const configQuery = useProtocolConfig()
  
  return useQuery({
    queryKey: ['loans', { cluster: cluster.id }],
    queryFn: async () => {
      try {
        console.log('Starting to fetch all loans...')
        
        if (!configQuery.data) {
          console.log('Protocol config not loaded yet')
          return []
        }

        const connection = new Connection(getRpcUrl(cluster.id), 'confirmed')
        
        const dummyWallet = {
          publicKey: PublicKey.default,
          signTransaction: async (tx: any) => tx,
          signAllTransactions: async (txs: any[]) => txs,
        }
        
        const provider = new AnchorProvider(connection, dummyWallet as any, {
          commitment: 'confirmed'
        })
        setProvider(provider);
        //console.log('IDL:', idl);
        // Create program with generic type but access typed methods
        const program = new Program(idl as IDL, provider) as Program<Solignition>;
        
        // Access loan account 
        const allLoans = await (program.account as any).loan.all()
        console.log('Total loans fetched:', allLoans[0])

        const maxLoanId = Number(configQuery.data.data.loanCounter)
        console.log('Max loan ID:', maxLoanId)
        const loans: LoanAccount[] = [];
        

        

        // Iterate through all loan IDs
        for (let loanId = 0; loanId < maxLoanId; loanId++) {
          try {
            // Derive loan PDA
            const [loanAddress] = await getProgramDerivedAddress({
              programAddress: SOLIGNITION_PROGRAM_ADDRESS,
              seeds: [
                new TextEncoder().encode('loan'),
                new Uint8Array(new BigUint64Array([BigInt(loanId)]).buffer),
                new PublicKey(borrower).toBuffer(),
              ],
            })

            console.log('Fetching loan', loanId, 'at', loanAddress)

            // Try to fetch the loan
            const loan = await fetchMaybeLoan(client.rpc, loanAddress)

            if (loan && loan.data) {
              console.log('Found loan:', {
                loanId: loan.data.loanId.toString(),
                borrower: loan.data.borrower,
                state: loan.data.state,
                principal: loan.data.principal.toString(),
              })

              loans.push({
                address: loanAddress,
                data: loan.data,
              })
            }
          } catch (error) {
            console.log('Loan', loanId, 'does not exist or error:', error)
          }
        }

        console.log('Total loans found:', loans.length)
        return loans
      } catch (error) {
        console.error('Error fetching loans:', error)
        throw error
      }
    },
    enabled: !!configQuery.data, // Only run when config is loaded
    retry: 1,
  })
}

export function useLoansByBorrower(borrower: string) {
  const loansQuery = useLoans(borrower)

  const filtered = loansQuery.data?.filter(loan => {
    const match = loan.data.borrower === borrower
    console.log('Comparing loan:', {
      loanId: loan.data.loanId.toString(),
      loanBorrower: loan.data.borrower,
      queryBorrower: borrower,
      match,
    })
    return match
  })

  console.log('Filtered loans for borrower:', borrower, 'count:', filtered?.length)

  return {
    ...loansQuery,
    data: filtered,
  }
}

export function useActiveLoans() {
  const loansQuery = useLoans("")

  return {
    ...loansQuery,
    data: loansQuery.data?.filter(loan => loan.data.state === 0), // LoanState.Active
  }
}
*/
import { useQuery } from '@tanstack/react-query'
import { useSolana } from '@/components/solana/use-solana'
import type { Address } from '@solana/kit'
import type { Loan } from '@project/anchor'
import { useProtocolConfig } from './use-protocol-config'
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js"
import idl from '../../../../anchor/target/idl/solignition.json'
import { AnchorProvider, Idl as IDL, Program, setProvider, BN } from '@coral-xyz/anchor'
import type { Solignition } from "../../../../anchor/target/types/solignition.ts"


export type LoanAccount = {
  address: Address
  data: Loan
}

function getRpcUrl(clusterId: string): string {
  switch (clusterId) {
    case 'solana:mainnet-beta':
      return clusterApiUrl('mainnet-beta')
    case 'solana:devnet':
      return clusterApiUrl('devnet')
    case 'solana:testnet':
      return clusterApiUrl('testnet')
    case 'solana:localnet':
      return 'http://127.0.0.1:8899'
    default:
      return 'http://127.0.0.1:8899'
  }
}

// Helper to parse state from Anchor format
function parseState(state: any): number {
  if (typeof state === 'number') return state
  if (state.active !== undefined) return 0
  if (state.repaid !== undefined) return 1
  if (state.recovered !== undefined) return 2
  if (state.pending !== undefined) return 3
  if (state.repaidPendingTransfer !== undefined) return 4
  return 0
}

// Helper to convert BN to bigint
function bnToBigInt(bn: any): bigint {
  if (!bn) return 0n
  if (typeof bn === 'bigint') return bn
  if (typeof bn === 'number') return BigInt(bn)
  if (typeof bn === 'string') return BigInt(bn)
  if (bn instanceof BN || bn._bn) {
    return BigInt(bn.toString())
  }
  return 0n
}

// Helper to convert PublicKey to string
function publicKeyToString(pubkey: any): string {
  if (typeof pubkey === 'string') return pubkey
  if (pubkey?.toString) return pubkey.toString()
  if (pubkey?._bn) return new PublicKey(pubkey).toString()
  return pubkey
}

// Helper to normalize loan data from Anchor format
function normalizeLoanData(rawData: any): Loan {
  return {
    ...rawData,
    loanId: bnToBigInt(rawData.loanId),
    borrower: publicKeyToString(rawData.borrower),
    programPubkey: publicKeyToString(rawData.programPubkey),
    authorityPda: publicKeyToString(rawData.authorityPda),
    principal: bnToBigInt(rawData.principal), // Already in lamports
    duration: bnToBigInt(rawData.duration),
    adminFeePaid: bnToBigInt(rawData.adminFeePaid),
    startTs: bnToBigInt(rawData.startTs),
    state: parseState(rawData.state),
    repaidTs: rawData.repaidTs && bnToBigInt(rawData.repaidTs) !== 0n
      ? { value: bnToBigInt(rawData.repaidTs) } 
      : null,
    recoveredTs: bnToBigInt(rawData.recoveredTs),
    interestPaid: bnToBigInt(rawData.interestPaid),
    reclaimedAmount: bnToBigInt(rawData.reclaimedAmount),
    reclaimedTs: bnToBigInt(rawData.reclaimedTs),
  } as Loan
}

/**
 * Hook to fetch loans
 * @param borrower - Optional borrower address to filter loans. Pass as string.
 */
export function useLoans(borrower?: string) {
  const { client, cluster } = useSolana()
  const configQuery = useProtocolConfig()
  
  return useQuery({
    queryKey: ['loans', { cluster: cluster.id, borrower }],
    queryFn: async () => {
      try {
        console.log('Fetching loans...', borrower ? `for borrower: ${borrower}` : 'all loans')
        
        if (!configQuery.data) {
          console.log('Protocol config not loaded yet')
          return []
        }

        const connection = new Connection(getRpcUrl(cluster.id), 'confirmed')
        
        const dummyWallet = {
          publicKey: PublicKey.default,
          signTransaction: async (tx: any) => tx,
          signAllTransactions: async (txs: any[]) => txs,
        }
        
        const provider = new AnchorProvider(connection, dummyWallet as any, {
          commitment: 'confirmed'
        })
        setProvider(provider)
        
        const program = new Program(idl as IDL, provider) as Program<Solignition>
        
        // Fetch all loan accounts
        const allLoans = await (program.account as any).loan.all()
        console.log('Total loans fetched:', allLoans.length)

        const loans: LoanAccount[] = allLoans.map((accountInfo: any) => {
          const normalizedData = normalizeLoanData(accountInfo.account)
          
          console.log('Processed loan:', {
            address: accountInfo.publicKey.toString(),
            borrower: normalizedData.borrower,
            loanId: normalizedData.loanId.toString(),
            state: normalizedData.state,
            principal: normalizedData.principal.toString() + ' lamports',
          })
          
          return {
            address: accountInfo.publicKey.toString() as Address,
            data: normalizedData,
          }
        })

        // Filter by borrower if specified
        const filteredLoans = borrower
          ? loans.filter(loan => {
              const loanBorrower = loan.data.borrower
              const match = loanBorrower === borrower
              console.log('Comparing:', {
                loanBorrower,
                queryBorrower: borrower,
                match,
              })
              return match
            })
          : loans

        console.log('Loans returned:', filteredLoans.length, borrower ? `(filtered for ${borrower})` : '(all)')
        
        return filteredLoans
      } catch (error) {
        console.error('Error fetching loans:', error)
        throw error
      }
    },
    enabled: !!configQuery.data,
    retry: 1,
  })
}

/**
 * Hook to fetch active loans
 */
export function useActiveLoans(borrower?: string) {
  const loansQuery = useLoans(borrower)

  return {
    ...loansQuery,
    data: loansQuery.data?.filter(loan => loan.data.state === 0), // LoanState.Active
  }
}