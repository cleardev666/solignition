/*import {
  Blockhash,
  createSolanaClient,
  createTransaction,
  generateKeyPairSigner,
  Instruction,
  isSolanaError,
  KeyPairSigner,
  signTransactionMessageWithSigners,
} from 'gill'
import {
  fetchSolignition,
  getCloseInstruction,
  getDecrementInstruction,
  getIncrementInstruction,
  getInitializeInstruction,
  getSetInstruction,
} from '../src'
import { loadKeypairSignerFromFile } from 'gill/node'

const { rpc, sendAndConfirmTransaction } = createSolanaClient({ urlOrMoniker: process.env.ANCHOR_PROVIDER_URL! })

describe('solignition', () => {
  let payer: KeyPairSigner
  let solignition: KeyPairSigner

  beforeAll(async () => {
    solignition = await generateKeyPairSigner()
    payer = await loadKeypairSignerFromFile(process.env.ANCHOR_WALLET!)
  })

  it('Initialize Solignition', async () => {
    // ARRANGE
    expect.assertions(1)
    const ix = getInitializeInstruction({ payer: payer, solignition: solignition })

    // ACT
    await sendAndConfirm({ ix, payer })

    // ASSER
    const currentSolignition = await fetchSolignition(rpc, solignition.address)
    expect(currentSolignition.data.count).toEqual(0)
  })

  it('Increment Solignition', async () => {
    // ARRANGE
    expect.assertions(1)
    const ix = getIncrementInstruction({
      solignition: solignition.address,
    })

    // ACT
    await sendAndConfirm({ ix, payer })

    // ASSERT
    const currentCount = await fetchSolignition(rpc, solignition.address)
    expect(currentCount.data.count).toEqual(1)
  })

  it('Increment Solignition Again', async () => {
    // ARRANGE
    expect.assertions(1)
    const ix = getIncrementInstruction({ solignition: solignition.address })

    // ACT
    await sendAndConfirm({ ix, payer })

    // ASSERT
    const currentCount = await fetchSolignition(rpc, solignition.address)
    expect(currentCount.data.count).toEqual(2)
  })

  it('Decrement Solignition', async () => {
    // ARRANGE
    expect.assertions(1)
    const ix = getDecrementInstruction({
      solignition: solignition.address,
    })

    // ACT
    await sendAndConfirm({ ix, payer })

    // ASSERT
    const currentCount = await fetchSolignition(rpc, solignition.address)
    expect(currentCount.data.count).toEqual(1)
  })

  it('Set solignition value', async () => {
    // ARRANGE
    expect.assertions(1)
    const ix = getSetInstruction({ solignition: solignition.address, value: 42 })

    // ACT
    await sendAndConfirm({ ix, payer })

    // ASSERT
    const currentCount = await fetchSolignition(rpc, solignition.address)
    expect(currentCount.data.count).toEqual(42)
  })

  it('Set close the solignition account', async () => {
    // ARRANGE
    expect.assertions(1)
    const ix = getCloseInstruction({
      payer: payer,
      solignition: solignition.address,
    })

    // ACT
    await sendAndConfirm({ ix, payer })

    // ASSERT
    try {
      await fetchSolignition(rpc, solignition.address)
    } catch (e) {
      if (!isSolanaError(e)) {
        throw new Error(`Unexpected error: ${e}`)
      }
      expect(e.message).toEqual(`Account not found at address: ${solignition.address}`)
    }
  })
})

// Helper function to keep the tests DRY
let latestBlockhash: Awaited<ReturnType<typeof getLatestBlockhash>> | undefined
async function getLatestBlockhash(): Promise<Readonly<{ blockhash: Blockhash; lastValidBlockHeight: bigint }>> {
  if (latestBlockhash) {
    return latestBlockhash
  }
  return await rpc
    .getLatestBlockhash()
    .send()
    .then(({ value }) => value)
}
async function sendAndConfirm({ ix, payer }: { ix: Instruction; payer: KeyPairSigner }) {
  const tx = createTransaction({
    feePayer: payer,
    instructions: [ix],
    version: 'legacy',
    latestBlockhash: await getLatestBlockhash(),
  })
  const signedTransaction = await signTransactionMessageWithSigners(tx)
  return await sendAndConfirmTransaction(signedTransaction)
}
 */