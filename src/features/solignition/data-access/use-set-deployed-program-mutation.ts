import { useMutation, useQueryClient } from '@tanstack/react-query'
import { UiWalletAccount, useWalletUiSigner } from '@wallet-ui/react'
import { useWalletUiSignAndSend } from '@wallet-ui/react-gill'
import { getSetDeployedProgramInstruction, SOLIGNITION_PROGRAM_ADDRESS } from '@project/anchor'
import { getProgramDerivedAddress } from '@solana/kit'
import { toastTx } from '@/components/toast-tx'
import { useSolana } from '@/components/solana/use-solana'
import type { Address } from '@solana/kit'
import {  PublicKey } from "@solana/web3.js";

export function useSetDeployedProgramMutation({ account }: { account: UiWalletAccount }) {
  const { cluster } = useSolana()
  const queryClient = useQueryClient()
  const signer = useWalletUiSigner({ account })
  const signAndSend = useWalletUiSignAndSend()

  return useMutation({
    mutationFn: async ({ loanId, programPubkey }: { loanId: bigint; programPubkey: Address }) => {
      // Derive protocol config PDA
      const [protocolConfig] = await getProgramDerivedAddress({
        programAddress: SOLIGNITION_PROGRAM_ADDRESS,
        seeds: [new TextEncoder().encode('config')],
      })

      // Derive loan PDA
      const [loanAddress] = await getProgramDerivedAddress({
        programAddress: SOLIGNITION_PROGRAM_ADDRESS,
        seeds: [new TextEncoder().encode('loan'), new Uint8Array(new BigUint64Array([loanId]).buffer), new PublicKey(signer.address).toBuffer()],
      })

      const instruction = getSetDeployedProgramInstruction({
        admin: signer,
        protocolConfig,
        loan: loanAddress,
        loanId,
        programPubkey,
      })

      return await signAndSend(instruction, signer)
    },
    onSuccess: async (signature) => {
      toastTx(signature, 'Program deployment recorded successfully')
      await queryClient.invalidateQueries({
        queryKey: ['loans', { cluster: cluster.id }],
      })
    },
  })
}