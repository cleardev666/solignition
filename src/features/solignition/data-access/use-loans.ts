/*import { useQuery } from '@tanstack/react-query'
import { useSolana } from '@/components/solana/use-solana'
import { SOLIGNITION_PROGRAM_ADDRESS, decodeLoan, identifySolignitionAccount, SolignitionAccount } from '@project/anchor'
import { getBase64Decoder, type Address } from '@solana/kit'
import type { Loan } from '@project/anchor'

export type LoanAccount = {
  address: Address
  data: Loan
}

export function useLoans() {
  const { client, cluster } = useSolana()

  return useQuery({
    queryKey: ['loans', { cluster: cluster.id }],
    queryFn: async () => {
      try {
        console.log('Starting to fetch all program accounts...')
        
        // Fetch ALL accounts for the program without filters
        const accounts = await client.rpc.getProgramAccounts(
          SOLIGNITION_PROGRAM_ADDRESS,
          {
            encoding: 'base64',
          }
        ).send()

        console.log('Found total accounts:', accounts.length)

        // Filter and decode only loan accounts
        const loans: LoanAccount[] = []
        const base64Decoder = getBase64Decoder()
        
        for (const { account, pubkey } of accounts) {
          try {

            // Decode base64 data to Uint8Array
            const accountData = base64Decoder.decode(account.data[0])
            
            // Log the first 8 bytes (discriminator) of each account
            const discriminator = Array.from(accountData.slice(0, 8))
            console.log('Account', pubkey, 'discriminator (bytes):', discriminator)
            console.log('Account', pubkey, 'expected loan discriminator: [20, 195, 70, 117, 165, 227, 182, 1]')
            
            // Try to identify the account type
            const accountType = identifySolignitionAccount(accountData)

            console.log('Account type for', pubkey, ':', accountType, '(0=DepositorRecord, 1=Loan, 2=ProtocolConfig)')
            
            // Only process if it's a Loan account
            if (accountType === SolignitionAccount.Loan) {
              const decoded = decodeLoan({
                address: pubkey,
                data: account.data,
              })
              
              console.log('Decoded loan:', {
                address: pubkey,
                loanId: decoded.data.loanId.toString(),
                borrower: decoded.data.borrower,
                state: decoded.data.state,
                principal: decoded.data.principal.toString(),
              })
              
              loans.push({
                address: pubkey,
                data: decoded.data,
              })
            }
          } catch (error) {
            console.log('Skipping account', pubkey, '- not a loan or decode error:', error)
          }
        }

        console.log('Total loan accounts found:', loans.length)
        return loans
      } catch (error) {
        console.error('Error fetching loans:', error)
        throw error
      }
    },
    retry: 1,
  })
}

export function useLoansByBorrower(borrower?: Address) {
  const loansQuery = useLoans()

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
  const loansQuery = useLoans()

  return {
    ...loansQuery,
    data: loansQuery.data?.filter(loan => loan.data.state === 0), // LoanState.Active
  }
}*/

import { useQuery } from '@tanstack/react-query'
import { useSolana } from '@/components/solana/use-solana'
import { SOLIGNITION_PROGRAM_ADDRESS, fetchLoan, fetchMaybeLoan } from '@project/anchor'
import { getAddressEncoder, getProgramDerivedAddress } from '@solana/kit'
import type { Address } from '@solana/kit'
import type { Loan } from '@project/anchor'
import { useProtocolConfig } from './use-protocol-config'
import {  PublicKey } from "@solana/web3.js";

export type LoanAccount = {
  address: Address
  data: Loan
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

        const maxLoanId = Number(configQuery.data.data.loanCounter)
        console.log('Max loan ID:', maxLoanId)

        const loans: LoanAccount[] = []

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