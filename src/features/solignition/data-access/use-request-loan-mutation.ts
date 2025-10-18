import { useMutation, useQueryClient } from '@tanstack/react-query'
import { UiWalletAccount, useWalletUiSigner } from '@wallet-ui/react'
import { useWalletUiSignAndSend } from '@wallet-ui/react-gill'
import { getRequestLoanInstructionAsync, SOLIGNITION_PROGRAM_ADDRESS } from '@project/anchor'
import { getProgramDerivedAddress } from '@solana/kit'
import { toastTx } from '@/components/toast-tx'
import { useSolana } from '@/components/solana/use-solana'
import { useProtocolConfig } from './use-protocol-config'

type RequestLoanParams = {
  principal: bigint
  duration: bigint
  interestRateBps: number
  adminFeeBps: number
  file: File
}

export function useRequestLoanMutation({ account }: { account: UiWalletAccount }) {
  const { cluster } = useSolana()
  const queryClient = useQueryClient()
  const signer = useWalletUiSigner({ account })
  const signAndSend = useWalletUiSignAndSend()
  const protocolConfigQuery = useProtocolConfig()

  return useMutation({
    mutationFn: async (params: RequestLoanParams) => {
      if (!protocolConfigQuery.data) {
        throw new Error('Protocol config not loaded')
      }

      const loanId = protocolConfigQuery.data.data.loanCounter

      // Derive protocol config PDA
      const [protocolConfig] = await getProgramDerivedAddress({
        programAddress: SOLIGNITION_PROGRAM_ADDRESS,
        seeds: [new TextEncoder().encode('config')],
      })

      // Derive deployer PDA
      const [deployerPda] = await getProgramDerivedAddress({
        programAddress: SOLIGNITION_PROGRAM_ADDRESS,
        seeds: [new TextEncoder().encode('deployer')],
      })

      const instruction = await getRequestLoanInstructionAsync({
        borrower: signer,
        protocolConfig,
        deployerPda,
        loanId,
        principal: params.principal,
        duration: params.duration,
        interestRateBps: params.interestRateBps,
        adminFeeBps: params.adminFeeBps,
      })

      return await signAndSend(instruction, signer)
    },
    onSuccess: async (signature) => {
      toastTx(signature, 'Loan requested successfully')
      await queryClient.invalidateQueries({
        queryKey: ['loans', { cluster: cluster.id }],
      })
      await queryClient.invalidateQueries({
        queryKey: ['protocol-config', { cluster: cluster.id }],
      })
    },
  })
}