import { useMutation, useQueryClient } from '@tanstack/react-query'
import { UiWalletAccount, useWalletUiSigner } from '@wallet-ui/react'
import { useWalletUiSignAndSend } from '@wallet-ui/react-gill'
import { getRepayLoanInstructionAsync, SOLIGNITION_PROGRAM_ADDRESS } from '@project/anchor'
import { address, getProgramDerivedAddress } from '@solana/kit'
import { toastTx } from '@/components/toast-tx'
import { useSolana } from '@/components/solana/use-solana'
import type { Address } from '@solana/kit'
import { toast } from 'sonner'
import { Connection, PublicKey } from '@solana/web3.js'
import { useProtocolConfig } from './use-protocol-config'
const DEPLOYER_API_URL = import.meta.env.VITE_DEPLOYER_API_URL || 'http://localhost:3000'

interface NotifyRepaidResponse {
  success: boolean
  message: string
  signature: string
  status?: string
  loanId?: string
  auth?: string
}


export function useRepayLoanMutation({ account }: { account: UiWalletAccount }) {
  const { cluster } = useSolana()
  const queryClient = useQueryClient()
  const signer = useWalletUiSigner({ account })
  const signAndSend = useWalletUiSignAndSend()
  const protocolConfigQuery = useProtocolConfig()
  



  

  return useMutation({
    mutationFn: async ({ loanAddress, programData, loanId }: { loanAddress: Address; programData: Address, loanId: BigInt }) => {
      
      // Derive protocol config PDA
      const [protocolConfig] = await getProgramDerivedAddress({
        programAddress: SOLIGNITION_PROGRAM_ADDRESS,
        seeds: [new TextEncoder().encode('config')],
      })

      const [vault] = await getProgramDerivedAddress({
      programAddress: SOLIGNITION_PROGRAM_ADDRESS,
      seeds: [new TextEncoder().encode('vault')], // Matches VAULT_SEED
      })

      const [authorityPda] = await getProgramDerivedAddress({
      programAddress: SOLIGNITION_PROGRAM_ADDRESS,
      seeds: [new TextEncoder().encode('authority')], // Matches AUTHORITY_SEED
      })

        // Convert your addresses to PublicKey objects for the v1 Connection API
const protocolConfigPubkey = new PublicKey(protocolConfig)
const vaultPubkey = new PublicKey(vault)
const authorityPdaPubkey = new PublicKey(authorityPda)
const loanAddressPubkey = new PublicKey(loanAddress)
const programDataPubkey = new PublicKey(programData)

      const connection = new Connection('http://127.0.0.1:8899')

// 1. Check if all accounts exist
const [protocolConfigInfo, vaultInfo, authorityInfo, loanInfo, programDataInfo] = await Promise.all([
  connection.getAccountInfo(protocolConfigPubkey),
  connection.getAccountInfo(vaultPubkey),
  connection.getAccountInfo(authorityPdaPubkey),
  connection.getAccountInfo(loanAddressPubkey),
  connection.getAccountInfo(programDataPubkey),
])

console.log('Account existence:')
console.log('  Protocol Config:', protocolConfigInfo !== null)
console.log('  Vault:', vaultInfo !== null)
console.log('  Authority PDA:', authorityInfo !== null)
console.log('  Loan:', loanInfo !== null)
console.log('  Program Data:', programDataInfo !== null)

// 2. Fetch and decode the protocol config to get loan_counter
if (protocolConfigInfo) {
  // You'll need to decode this properly, but let's check the data
  console.log('Protocol Config data length:', protocolConfigInfo.data.length)
  // The loan_counter should be in the account data - you need to decode it properly
}

      console.log('Protocol Config:', protocolConfig)
      console.log('Vault:', vault)
      console.log('Authority PDA:', authorityPda)
      console.log('Loan Address:', loanAddress)
      console.log('Program Data:', programData)
      let signature = null;
      try {
        const instruction = await getRepayLoanInstructionAsync({
        program: SOLIGNITION_PROGRAM_ADDRESS,
        borrower: signer,
        loan: loanAddress,
        protocolConfig,
       // programData,
        vault,
       // deployer: protocolConfigQuery.data?.data.deployer,
        loanId 
        })
      
        signature = await signAndSend(instruction, signer);

      } catch (error) {
        console.error('Error repaying loan:', error)
      }

      // Step 3: Notify the deployer the loan was repaid
            toast.info('Notifying deployer service...', {
              description: 'Triggering auth transfer',
            })
      
            try {
              const notifyResponse = await fetch(`${DEPLOYER_API_URL}/notify-repaid`, {
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
                toast.warning('Loan repaid but auth transfer failed', {
                  description: 'Please contact support if you dont have ownership of your program',
                })
              } else {
                const notifyData: NotifyRepaidResponse = await notifyResponse.json()
                //logger.info('Deployer notified successfully', { notifyData })
                toast.warning('Loan repaid but auth transfer failed', {
                  description: 'Please contact support if you dont have ownership of your program',
                })
              }
            } catch (notifyError) {
              //logger.error('Error notifying deployer', { notifyError })
              toast.warning('Repaid but could not notify deployer for auth transfer', {
                description: 'still can be processed automatically',
              })
            }
            return signature;

    },
    onSuccess: async (signature) => {
      toastTx(signature, 'Loan repaid successfully')
      await queryClient.invalidateQueries({
        queryKey: ['loans', { cluster: cluster.id }],
      })
      await queryClient.invalidateQueries({
        queryKey: ['protocol-config', { cluster: cluster.id }],
      })
    },
    onError: (error: Error) => {
          toast.error('Failed to repay loan', {
            description: error.message,
          })
        },
  })
}