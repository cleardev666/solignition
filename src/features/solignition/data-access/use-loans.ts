import { useQuery } from '@tanstack/react-query'
import { useSolana } from '@/components/solana/use-solana'
import { SOLIGNITION_PROGRAM_ADDRESS, decodeLoan, LOAN_DISCRIMINATOR } from '@project/anchor'
import { getBase58Encoder } from '@solana/kit'
import type { Address } from '@solana/kit'
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
      // Encode discriminator as base58 for the filter
      const base58Encoder = getBase58Encoder()
      const discriminatorBase58 = base58Encoder.encode(LOAN_DISCRIMINATOR)

      const accounts = await client.rpc.getProgramAccounts(
        SOLIGNITION_PROGRAM_ADDRESS,
        {
          encoding: 'base64',
          filters: [
            {
              memcmp: {
                offset: 0,
                bytes: discriminatorBase58,
              },
            },
          ],
        }
      ).send()

      console.log(`Found ${accounts.length} loan accounts`)

      return accounts.map(({ account, pubkey }) => {
        const decoded = decodeLoan({
          address: pubkey,
          data: account.data,
        })
        
        console.log('Loan:', {
          address: pubkey,
          loanId: decoded.data.loanId.toString(),
          borrower: decoded.data.borrower,
          state: decoded.data.state,
        })

        return {
          address: pubkey,
          data: decoded.data,
        }
      }) as LoanAccount[]
    },
    refetchInterval: 10000, // Refetch every 10 seconds
  })
}

export function useLoansByBorrower(borrower?: Address) {
  const loansQuery = useLoans()

  return {
    ...loansQuery,
    data: loansQuery.data?.filter(loan => loan.data.borrower === borrower),
  }
}

export function useActiveLoans() {
  const loansQuery = useLoans()

  return {
    ...loansQuery,
    data: loansQuery.data?.filter(loan => loan.data.state === 0), // LoanState.Active
  }
}