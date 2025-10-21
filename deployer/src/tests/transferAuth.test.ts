import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { 
  PublicKey, 
  Keypair, 
  SystemProgram,
  Connection,
} from "@solana/web3.js";
import { expect } from "chai";
import { Solignition } from "../../../anchor/target/types/solignition";
import * as fs from "fs";

describe("transferAuthorityToBorrower - Existing Setup", () => {
  // Create connection to local validator
  const connection = new Connection(
    process.env.ANCHOR_PROVIDER_URL || "http://127.0.0.1:8899",
    "confirmed"
  );
  
  // Load wallet from file (will be loaded in before() hook)
  let walletKeypair: Keypair;
  
  // Create a wallet wrapper
  const wallet = {
    publicKey: PublicKey.default, // Will be set in before()
    signTransaction: async (tx: any) => tx,
    signAllTransactions: async (txs: any[]) => txs,
  };
  
  const provider = new anchor.AnchorProvider(connection, wallet as any, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Load program using the program ID from your declare_id!
  const programId = new PublicKey("4dWBvsjopo5Z145Xmse3Lx41G1GKpMyWMLc6p4a52T4N");
  const program = new anchor.Program(
    require("../../../anchor/target/idl/solignition.json"),
    provider
  ) as Program<Solignition>;
  
  // Test accounts
  let admin: Keypair;
  let deployer: Keypair;
  
  // PDAs
  let configPDA: PublicKey;
  
  // Seeds
  const PROTOCOL_CONFIG_SEED = Buffer.from("config");
  const LOAN_SEED = Buffer.from("loan");
  
  // Keypair paths
  const DEPLOYER_KEYPAIR_PATH = "../../../projects/testkeys/key.json";
  const ADMIN_KEYPAIR_PATH = "../../../projects/testkeys/key.json";
  
  // TEST PARAMETERS - UPDATE THESE
  const LOAN_ID = 0; // Change to your loan ID
  const BORROWER_PUBKEY = "6c9oJNMkS6JSmoKR1TWrYqjY1NQmYNi5vJivorYgu3CL"; // Change to your borrower

  before(async () => {
    // Load keypairs from files
    const deployerSecretKey = JSON.parse(
      fs.readFileSync(DEPLOYER_KEYPAIR_PATH, "utf-8")
    );
    deployer = Keypair.fromSecretKey(Uint8Array.from(deployerSecretKey));
    
    const adminSecretKey = JSON.parse(
      fs.readFileSync(ADMIN_KEYPAIR_PATH, "utf-8")
    );
    admin = Keypair.fromSecretKey(Uint8Array.from(adminSecretKey));

    // Update wallet with actual keypair
    walletKeypair = deployer;
    wallet.publicKey = deployer.publicKey;

    // Derive config PDA
    [configPDA] = PublicKey.findProgramAddressSync(
      [PROTOCOL_CONFIG_SEED],
      program.programId
    );

    console.log("\n📋 Test Configuration:");
    console.log("Program ID:", program.programId.toString());
    console.log("RPC URL:", connection.rpcEndpoint);
    console.log("Deployer:", deployer.publicKey.toString());
    console.log("Admin:", admin.publicKey.toString());
    console.log("Config PDA:", configPDA.toString());
    console.log("Loan ID:", LOAN_ID);
    console.log("Borrower:", BORROWER_PUBKEY);
  });

  it("Should transfer authority from deployer to borrower", async () => {
    const loanId = new anchor.BN(LOAN_ID);
    const borrowerPubkey = new PublicKey(BORROWER_PUBKEY);

    // Derive loan PDA
    const [loanPDA] = PublicKey.findProgramAddressSync(
      [
        LOAN_SEED,
        loanId.toArrayLike(Buffer, "le", 8),
        borrowerPubkey.toBuffer(),
      ],
      program.programId
    );

    console.log("\n🔍 Fetching loan account...");
    console.log("Loan PDA:", loanPDA.toString());

    // Fetch loan to get deployed program pubkey
    const loan = await program.account.loan.fetch(loanPDA);
    
    console.log("\n📊 Loan Details:");
    console.log("Loan ID:", loan.loanId.toString());
    console.log("Borrower:", loan.borrower.toString());
    console.log("Program Pubkey:", loan.programPubkey.toString());
    console.log("State:", loan.state);
    console.log("Principal:", loan.principal.toString());
    console.log("Interest Paid:", loan.interestPaid?.toString() || "null");
    console.log("Repaid Timestamp:", loan.repaidTs?.toString() || "null");

    // Verify loan is in correct state
    if (!loan.state.hasOwnProperty('repaidPendingTransfer')) {
      console.error("\n❌ Loan is not in RepaidPendingTransfer state!");
      console.error("Current state:", loan.state);
      throw new Error("Loan must be repaid before transferring authority");
    }

    // Verify program is set
    if (loan.programPubkey.equals(PublicKey.default)) {
      throw new Error("Loan does not have a deployed program set");
    }

    // Derive program data address from deployed program
    const BPF_UPGRADEABLE_LOADER = new PublicKey(
      "BPFLoaderUpgradeab1e11111111111111111111111"
    );
    const [programDataAddress] = PublicKey.findProgramAddressSync(
      [loan.programPubkey.toBuffer()],
      BPF_UPGRADEABLE_LOADER
    );

    console.log("\n🔑 Authority Transfer Details:");
    console.log("Deployed Program:", loan.programPubkey.toString());
    console.log("Program Data:", programDataAddress.toString());
    console.log("Current Authority (Deployer):", deployer.publicKey.toString());
    console.log("New Authority (Borrower):", borrowerPubkey.toString());

    // Call transferAuthorityToBorrower
    console.log("\n🔄 Calling transferAuthorityToBorrower...");
    
    const tx = await program.methods
      .transferAuthorityToBorrower(loanId)
      .accountsPartial({
        deployer: deployer.publicKey,
        protocolConfig: configPDA,
        loan: loanPDA,
        borrower: borrowerPubkey,
        programData: programDataAddress,
        bpfUpgradeableLoader: BPF_UPGRADEABLE_LOADER,
        systemProgram: SystemProgram.programId,
      })
      .signers([deployer])
      .rpc();

    console.log("\n✅ Authority transferred successfully!");
    console.log("Transaction:", tx);
    console.log("View on Solana Explorer:");
    console.log(`https://explorer.solana.com/tx/${tx}?cluster=localnet`);

    // Verify loan state changed to Repaid
    const loanAfter = await program.account.loan.fetch(loanPDA);
    console.log("\n📊 Updated Loan State:", loanAfter.state);
    
    expect(loanAfter.state).to.deep.equal({ repaid: {} });
    
    console.log("\n✨ Success! Program authority has been transferred to borrower");
    console.log("The borrower now has full control of the deployed program");
  });

  it("Should verify loan is now fully repaid", async () => {
    const loanId = new anchor.BN(LOAN_ID);
    const borrowerPubkey = new PublicKey(BORROWER_PUBKEY);

    const [loanPDA] = PublicKey.findProgramAddressSync(
      [
        LOAN_SEED,
        loanId.toArrayLike(Buffer, "le", 8),
        borrowerPubkey.toBuffer(),
      ],
      program.programId
    );

    const loan = await program.account.loan.fetch(loanPDA);
    
    console.log("\n📋 Final Loan Status:");
    console.log("State:", loan.state);
    console.log("Principal:", loan.principal.toString(), "lamports");
    console.log("Interest Paid:", loan.interestPaid?.toString() || "0", "lamports");
    console.log("Repaid Timestamp:", new Date((loan.repaidTs?.toNumber() || 0) * 1000).toISOString());
    
    expect(loan.state).to.deep.equal({ repaid: {} });
    expect(loan.repaidTs).to.not.equal(null);
  });

  after(async () => {
    console.log("\n🎉 Test completed!");
  });
});

// Run with: anchor test --skip-local-validator
// Or if you want to specify: anchor test --skip-local-validator -- --grep "transferAuthorityToBorrower"