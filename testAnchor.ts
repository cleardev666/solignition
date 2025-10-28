// test-anchor-all.ts
import * as anchor from '@coral-xyz/anchor';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Program, AnchorProvider, setProvider } from '@coral-xyz/anchor';

// Import IDL and types
import idl from './anchor/target/idl/solignition.json' with { type: 'json' };
import type { Solignition } from './anchor/target/types/solignition.ts';

const PROGRAM_ID = '4dWBvsjopo5Z145Xmse3Lx41G1GKpMyWMLc6p4a52T4N'; // Replace with your actual program ID
const RPC_URL = 'http://127.0.0.1:8899';

async function testAnchorAll() {
  try {
    console.log('🔍 Testing Anchor .all() method...\n');
    
    const connection = new Connection(RPC_URL, 'confirmed');
    console.log('✅ Connected to:', RPC_URL);
    
    const wallet = {
      publicKey: Keypair.generate().publicKey,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any[]) => txs,
    };
    
    const provider = new AnchorProvider(connection, wallet as any, {
      commitment: 'confirmed',
    });
    setProvider(provider);
    console.log('✅ Provider created');
    
    // Try with typed program
    const program = new Program<Solignition>(
      idl as Solignition,
      new PublicKey(PROGRAM_ID),
      provider
    );
    
    console.log('✅ Program initialized');
    console.log('   Program ID:', program.programId.toString());
    
    console.log('\n🔎 Fetching all loan accounts...');
    const loans = await program.account.loan.all();
    
    console.log(`\n✅ SUCCESS! Fetched ${loans.length} loans\n`);
    
    loans.forEach(({ publicKey, account }, index) => {
      console.log(`Loan ${index + 1}:`);
      console.log('  Address:', publicKey.toString());
      console.log('  Loan ID:', account.loanId.toString());
      console.log('  Borrower:', account.borrower.toString());
      console.log('  Principal:', account.principal.toString());
      console.log('  State:', account.state);
      console.log('');
    });
    
    return loans;
    
  } catch (error) {
    console.error('\n❌ ERROR:', (error as Error).message);
    console.error('\nFull error:');
    console.error(error);
    throw error;
  }
}

testAnchorAll()
  .then(() => {
    console.log('✅ Test completed successfully!');
    process.exit(0);
  })
  .catch(() => {
    console.error('❌ Test failed!');
    process.exit(1);
  });