import {
  Connection,
  Keypair,
  sendAndConfirmTransaction,
  Transaction,
  SystemProgram,
  PublicKey,
  LAMPORTS_PER_SOL,
  BpfLoader,
  BPF_LOADER_PROGRAM_ID
} from "@solana/web3.js";
import * as fs from "fs";

// Connection to Solana devnet
const connection = new Connection("https://api.devnet.solana.com", "confirmed");

// Load your wallet
const secret = JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/id.json", "utf-8"));
const payer = Keypair.fromSecretKey(Uint8Array.from(secret));

// Load your compiled program
const programData = fs.readFileSync("../../../multiPoolVault/anchor/target/deploy/multi_pool_vault.so");//"../../anchor/target/deploy/solignition.so"

(async () => {
  console.log("Deploying program...");

  // Deploy as an upgradeable program
  const programKeypair = Keypair.generate();
  const programId = await BpfLoader.load(
    connection,
    payer,
    programKeypair,
    programData,
    BPF_LOADER_PROGRAM_ID
  );

  console.log("✅ Program deployed!");
  console.log("Program ID:", programId);
})();