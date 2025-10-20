import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as anchor from '@coral-xyz/anchor';
import { UiWalletAccount, useWalletUiSigner } from '@wallet-ui/react'
import { useWalletUiSignAndSend } from '@wallet-ui/react-gill'
import { getRequestLoanInstructionAsync, SOLIGNITION_PROGRAM_ADDRESS } from '@project/anchor'
import { getProgramDerivedAddress } from '@solana/kit'
import { toastTx } from '@/components/toast-tx'
import { useSolana } from '@/components/solana/use-solana'
import { useProtocolConfig } from './use-protocol-config'
import { toast } from 'sonner'

const DEPLOYER_API_URL = import.meta.env.VITE_DEPLOYER_API_URL || 'http://localhost:3000'

type RequestLoanParams = {
  principal: bigint
  duration: bigint
  interestRateBps: number
  adminFeeBps: number
  file: File
}

interface UploadResponse {
  success: boolean
  fileId: string
  estimatedCost: number
  binaryHash: string
  message: string
}

interface NotifyLoanResponse {
  success: boolean
  message: string
  signature: string
  fileId?: string
  status?: string
  loanId?: string
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

       // Step 1: Upload the file to the deployer
      toast.info('Uploading program file...', {
        description: 'Please wait while we upload your program file',
      })

      const formData = new FormData()
      formData.append('file', params.file)
      formData.append('borrower', account.address)
      

      const uploadResponse = await fetch(`${DEPLOYER_API_URL}/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json()
        throw new Error(errorData.error || 'Failed to upload program file')
      }

      const uploadData: UploadResponse = await uploadResponse.json()
      
      toast.success('Program file uploaded', {
        description: `Estimated deployment cost: ${uploadData.estimatedCost} SOL`,
      })

      // Step 2: Request the loan on-chain
      toast.info('Requesting loan...', {
        description: 'Please approve the transaction in your wallet',
      })

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
      });

        const [loanPda] = await getProgramDerivedAddress({
        programAddress: SOLIGNITION_PROGRAM_ADDRESS,
        seeds: [new TextEncoder().encode('loan'),(new anchor.BN(loanId)).toArrayLike(Buffer, "le", 8)],
      });
      

      const instruction = await getRequestLoanInstructionAsync({
        program: SOLIGNITION_PROGRAM_ADDRESS,
        borrower: signer,
        protocolConfig,
        deployerPda,
        loan: loanPda,
        principal: params.principal,
        duration: params.duration,
        interestRateBps: params.interestRateBps,
        adminFeeBps: params.adminFeeBps,
      })

      const signature = await signAndSend(instruction, signer);

       // Step 3: Notify the deployer about the loan request
      toast.info('Notifying deployment service...', {
        description: 'Triggering automatic deployment',
      })

      try {
        const notifyResponse = await fetch(`${DEPLOYER_API_URL}/notify-loan`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            signature,
            borrower: account.address,
            loanId: loanId.toString(),
          }),
        })

        if (!notifyResponse.ok) {
          const errorData = await notifyResponse.json()
         // toast.error('Failed to notify deployer', { errorData })
          toast.warning('Loan created but deployment notification failed', {
            description: 'Please contact support if your program is not deployed',
          })
        } else {
          const notifyData: NotifyLoanResponse = await notifyResponse.json()
          //logger.info('Deployer notified successfully', { notifyData })
        }
      } catch (notifyError) {
        //logger.error('Error notifying deployer', { notifyError })
        toast.warning('Loan created but could not notify deployer', {
          description: 'The deployment may still be processed automatically',
        })
      }

      return signature
    },
    onSuccess: async (signature) => {
      toastTx(signature, 'Loan requested successfully')
      toast.info('Deployment in progress', {
        description: 'Your program will be deployed automatically once the loan is approved',
      })
      await queryClient.invalidateQueries({
        queryKey: ['loans', { cluster: cluster.id }],
      })
      await queryClient.invalidateQueries({
        queryKey: ['protocol-config', { cluster: cluster.id }],
      })
    },
    onError: (error: Error) => {
      toast.error('Failed to request loan', {
        description: error.message,
      })
    },
  })
}