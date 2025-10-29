import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { Solignition } from "../target/types/solignition";
import { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert, expect } from "chai";
import { createKeyPairFromBytes, createSignerFromKeyPair, getBase58Encoder } from 'gill';
import { loadKeypairSignerFromFile, type KeyPairSigner } from 'gill/node';
import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes';
import * as fs from 'fs';
import { threadCpuUsage } from 'process';
import { setMaxIdleHTTPParsers } from 'http';

describe("solignition", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Solignition as Program<Solignition>;
  const connection = provider.connection;

  // Test accounts
  let admin: Keypair;
  let depositor1: Keypair;
  let depositor2: Keypair;
  let depositor3: Keypair;
  let borrower: Keypair;
  let deployer: Keypair;

  // PDAs
  let protocolConfigPda: PublicKey;
  let vaultPda: PublicKey;
  let authorityPda: PublicKey;
  let adminPda: PublicKey;
  let treasuryPda: PublicKey;
  let depositor1RecordPda: PublicKey;
  let depositor2RecordPda: PublicKey;

  // Constants
  const VAULT_SEED = Buffer.from("vault");
  const AUTHORITY_SEED = Buffer.from("authority");
  const ADMIN_SEED = Buffer.from("admin");
  const TREASURY_SEED = Buffer.from("treasury");
  const LOAN_SEED = Buffer.from("loan");
  const DEPOSITOR_SEED = Buffer.from("depositor");
  const PROTOCOL_CONFIG_SEED = Buffer.from("config");

  before(async () => {
    //test public keypair seed don't use on mainnet
    const keypairBase58 ="5MaiiCavjCmn9Hs1o3eznqDEhRwxo7pXiAYez7keQUviUkauRiTMD8DrESdrNjN8zd9mTmVhRvBJeg5vhyvgrAhG";

   //const keypair = await createKeyPairFromBytes( getBase58Encoder().encode(keypairBase58));
   // const signer = await createSignerFromKeyPair(keypair);
    //const signer = await loadKeypairSignerFromFile();
    const keypairBytes = bs58.decode(keypairBase58);
    const keypair = Keypair.fromSecretKey(keypairBytes);
    //console.log("address:", keypair);
    const decoded = bs58.decode(keypairBase58);
    const keyArray = Array.from(decoded);
    const outputPath = '/root/projects/testkeys/key.json';
     fs.writeFileSync(outputPath, JSON.stringify(keyArray));


    // Generate keypairs
    admin = keypair;
    depositor1 = Keypair.generate();
    depositor2 = Keypair.generate();
    depositor3 = Keypair.generate();
    borrower = Keypair.generate();
    deployer = keypair;

    // Airdrop SOL to test accounts
    const airdropAmount = 100 * LAMPORTS_PER_SOL;
    await connection.confirmTransaction(
      await connection.requestAirdrop(admin.publicKey, airdropAmount)
    );
    await connection.confirmTransaction(
      await connection.requestAirdrop(depositor1.publicKey, airdropAmount)
    );
    await connection.confirmTransaction(
      await connection.requestAirdrop(depositor2.publicKey, airdropAmount)
    );
    await connection.confirmTransaction(
      await connection.requestAirdrop(borrower.publicKey, airdropAmount)
    );

    // Derive PDAs
    [protocolConfigPda] = PublicKey.findProgramAddressSync(
      [PROTOCOL_CONFIG_SEED],
      program.programId
    );

    [vaultPda] = PublicKey.findProgramAddressSync(
      [VAULT_SEED],
      program.programId
    );

    [authorityPda] = PublicKey.findProgramAddressSync(
      [AUTHORITY_SEED],
      program.programId
    );

    [adminPda] = PublicKey.findProgramAddressSync(
      [ADMIN_SEED],
      program.programId
    );

    [treasuryPda] = PublicKey.findProgramAddressSync(
      [TREASURY_SEED],
      program.programId
    );

    [depositor1RecordPda] = PublicKey.findProgramAddressSync(
      [DEPOSITOR_SEED, depositor1.publicKey.toBuffer()],
      program.programId
    );

    [depositor2RecordPda] = PublicKey.findProgramAddressSync(
      [DEPOSITOR_SEED, depositor2.publicKey.toBuffer()],
      program.programId
    );
  });

  describe("initialize", () => {
    it("should initialize the protocol successfully", async () => {
      const adminFeeSplitBps = 5000; // 50% to depositors, 50% to treasury
      const defaultInterestRateBps = 500; // 5%
      const defaultAdminFeeBps = 100; // 1%

      // Set up listener before sending transaction
   // const listenerId = program.addEventListener("ProtocolInitialized", event => {
      // Do something with the event data
   //   console.log("Event Data:", event);
   // });

      const tx = await program.methods
        .initialize(adminFeeSplitBps, defaultInterestRateBps, defaultAdminFeeBps)
        .accounts({
          admin: admin.publicKey,
          protocolConfig: protocolConfigPda,
          vault: vaultPda,
          authorityPda: authorityPda,
          adminPda: adminPda,
          treasury: treasuryPda,
          deployer: deployer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      console.log("Initialize tx:", tx);

      // Fetch and verify protocol config
      const config = await program.account.protocolConfig.fetch(protocolConfigPda);
      assert.ok(config.admin.equals(admin.publicKey));
      assert.ok(config.treasury.equals(treasuryPda));
      assert.ok(config.deployer.equals(deployer.publicKey));
      assert.equal(config.adminFeeSplitBps, adminFeeSplitBps);
      assert.equal(config.defaultInterestRateBps, defaultInterestRateBps);
      assert.equal(config.defaultAdminFeeBps, defaultAdminFeeBps);
      assert.equal(config.totalDeposits.toNumber(), 0);
      assert.equal(config.totalLoansOutstanding.toNumber(), 0);
      assert.equal(config.isPaused, false);

      // Remove listener
      //await program.removeEventListener(listenerId);
    });

    it("should fail to initialize twice", async () => {
      try {
        await program.methods
          .initialize(5000, 500, 100)
          .accounts({
            admin: admin.publicKey,
            protocolConfig: protocolConfigPda,
            vault: vaultPda,
            authorityPda: authorityPda,
            adminPda: adminPda,
            treasury: treasuryPda,
            deployer: deployer.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([admin])
          .rpc();
        assert.fail("Should have thrown error");
      } catch (error) {
        assert.ok(error.toString().includes("already in use"));
      }
    });
  });

  describe("deposit", () => {
    it("should allow depositor to deposit SOL", async () => {
      const depositAmount = new anchor.BN(10 * LAMPORTS_PER_SOL);

      const vaultBalanceBefore = await connection.getBalance(vaultPda);
      const depositorBalanceBefore = await connection.getBalance(depositor1.publicKey);

      const tx = await program.methods
        .deposit(depositAmount)
        .accounts({
          depositor: depositor1.publicKey,
          depositorRecord: depositor1RecordPda,
          protocolConfig: protocolConfigPda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([depositor1])
        .rpc();

      console.log("Deposit tx:", tx);

      // Verify vault balance increased
      const vaultBalanceAfter = await connection.getBalance(vaultPda);
      assert.equal(vaultBalanceAfter - vaultBalanceBefore, depositAmount.toNumber());

      // Verify depositor record
      const depositorRecord = await program.account.depositorRecord.fetch(
        depositor1RecordPda
      );
      assert.ok(depositorRecord.owner.equals(depositor1.publicKey));
      assert.equal(depositorRecord.depositedAmount.toNumber(), depositAmount.toNumber());
      assert.equal(depositorRecord.shareAmount.toNumber(), depositAmount.toNumber());

      // Verify protocol config updated
      const config = await program.account.protocolConfig.fetch(protocolConfigPda);
     // assert.equal(config.totalDeposits.toNumber(), depositAmount.toNumber());
    });

    it("should allow multiple deposits from same depositor", async () => {
      const depositAmount = new anchor.BN(5 * LAMPORTS_PER_SOL);

      await program.methods
        .deposit(depositAmount)
        .accounts({
          depositor: depositor1.publicKey,
          depositorRecord: depositor1RecordPda,
          protocolConfig: protocolConfigPda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([depositor1])
        .rpc();

      // Verify depositor record updated
      const depositorRecord = await program.account.depositorRecord.fetch(
        depositor1RecordPda
      );
      assert.equal(depositorRecord.depositedAmount.toNumber(),15 * LAMPORTS_PER_SOL);
    });

    it("should allow multiple depositors", async () => {
      const depositAmount = new anchor.BN(20 * LAMPORTS_PER_SOL);

      await program.methods
        .deposit(depositAmount)
        .accounts({
          depositor: depositor2.publicKey,
          depositorRecord: depositor2RecordPda,
          protocolConfig: protocolConfigPda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([depositor2])
        .rpc();

      // Verify total deposits
      const config = await program.account.protocolConfig.fetch(protocolConfigPda);
     // assert.equal(config.totalDeposits.toNumber(), 35 * LAMPORTS_PER_SOL);
    });

    it("should fail to deposit zero amount", async () => {
      try {
        await program.methods
          .deposit(new anchor.BN(0))
          .accounts({
            depositor: depositor1.publicKey,
            depositorRecord: depositor1RecordPda,
            protocolConfig: protocolConfigPda,
            vault: vaultPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([depositor1])
          .rpc();
        assert.fail("Should have thrown error");
      } catch (error) {
        assert.ok(error.toString().includes("InvalidAmount"));
      }
    });
  });
/*
  describe("withdraw", () => {
    it("should allow depositor to withdraw SOL", async () => {
      const withdrawAmount = new anchor.BN(5 * LAMPORTS_PER_SOL);

      const vaultBalanceBefore = await connection.getBalance(vaultPda);
      const depositorBalanceBefore = await connection.getBalance(depositor1.publicKey);

      const tx = await program.methods
        .withdraw(withdrawAmount)
        .accounts({
          depositor: depositor1.publicKey,
          depositorRecord: depositor1RecordPda,
          protocolConfig: protocolConfigPda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([depositor1])
        .rpc();

      console.log("Withdraw tx:", tx);

      // Verify vault balance decreased
      const vaultBalanceAfter = await connection.getBalance(vaultPda);
      assert.equal(vaultBalanceBefore - vaultBalanceAfter, withdrawAmount.toNumber());

      // Verify depositor record updated
      const depositorRecord = await program.account.depositorRecord.fetch(
        depositor1RecordPda
      );
      assert.equal(
        depositorRecord.shareAmount.toNumber(),
        10 * LAMPORTS_PER_SOL
      );
    });

    it("should fail to withdraw more than balance", async () => {
      const withdrawAmount = new anchor.BN(100 * LAMPORTS_PER_SOL);

      try {
        await program.methods
          .withdraw(withdrawAmount)
          .accounts({
            depositor: depositor1.publicKey,
            depositorRecord: depositor1RecordPda,
            protocolConfig: protocolConfigPda,
            vault: vaultPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([depositor1])
          .rpc();
        assert.fail("Should have thrown error");
      } catch (error) {
        assert.ok(error.toString().includes("InsufficientBalance"));
      }
    });

    it("should fail if wrong depositor tries to withdraw", async () => {
      try {
        await program.methods
          .withdraw(new anchor.BN(1 * LAMPORTS_PER_SOL))
          .accounts({
            depositor: depositor2.publicKey,
            depositorRecord: depositor1RecordPda,
            protocolConfig: protocolConfigPda,
            vault: vaultPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([depositor2])
          .rpc();
        assert.fail("Should have thrown error");
      } catch (error) {
         // Seeds constraint fails before custom constraint
        // Accept either seeds error or UnauthorizedDepositor
        const errorStr = error.toString();
        const hasError = errorStr.includes("UnauthorizedDepositor") || 
                        errorStr.includes("ConstraintSeeds") ||
                        errorStr.includes("seeds constraint");
        assert.ok(hasError, `Expected seeds or unauthorized error, got: ${errorStr}`);
      }
    });
  });*/

  describe("request_loan", () => {
    let loanId: number;
    let loanPda: PublicKey;


    before( async () => {
      const config0 = await program.account.protocolConfig.fetch(protocolConfigPda);
      //loanId = 1;
      [loanPda] = PublicKey.findProgramAddressSync(
        [LOAN_SEED, new anchor.BN(config0.loanCounter).toArrayLike(Buffer, "le", 8),borrower.publicKey.toBuffer()],
        program.programId
      );
    });

    it("should allow borrower to request a loan", async () => {
      const config0 = await program.account.protocolConfig.fetch(protocolConfigPda);
      console.log("Current loan counter:", config0.loanCounter.toString());
      //loanId = 1;
      [loanPda] = PublicKey.findProgramAddressSync(
        [LOAN_SEED, new anchor.BN(config0.loanCounter).toArrayLike(Buffer, "le", 8),borrower.publicKey.toBuffer() ],
        program.programId
      );
    
      const principal = new anchor.BN(5 * LAMPORTS_PER_SOL);
      const duration = new anchor.BN(30 * 24 * 60 * 60); // 30 days in seconds
      const interestRateBps = 500; // 5%
      const adminFeeBps = 100; // 1%

      const borrowerBalanceBefore = await connection.getBalance(borrower.publicKey);
      const vaultBalanceBefore = await connection.getBalance(vaultPda);

      const tx = await program.methods
        .requestLoan(
          principal,
          duration,
          interestRateBps,
          adminFeeBps
        )
        .accounts({
          borrower: borrower.publicKey,
          loan: loanPda,
          protocolConfig: protocolConfigPda,
          vault: vaultPda,
          //authorityPda: authorityPda,
          adminPda: adminPda,
          deployer: deployer.publicKey,
          //systemProgram: SystemProgram.programId,
        })
        .signers([borrower])
        .rpc();

      console.log("Request loan tx:", tx);

      
      // // Verify protocol config updated
      const config = await program.account.protocolConfig.fetch(protocolConfigPda);
      // Verify loan account created
      const loan = await program.account.loan.fetch(loanPda);
      assert.equal(loan.loanId.toNumber(), (config.loanCounter-1));
      assert.ok(loan.borrower.equals(borrower.publicKey));
      assert.equal(loan.principal.toNumber(), principal.toNumber());
      assert.equal(loan.duration.toNumber(), duration.toNumber());
      assert.equal(loan.interestRateBps, interestRateBps);
      assert.equal(loan.adminFeeBps, adminFeeBps);
      assert.deepEqual(loan.state, { pending: {} });

      // Verify admin fee paid
      const adminFee = principal.toNumber() * adminFeeBps / 10000;
      assert.equal(loan.adminFeePaid.toNumber(), adminFee);

      
     // assert.equal(config.totalLoansOutstanding.toNumber(), principal.toNumber());
    });
/**/
    it("should allow another borrower to request a loan", async () => {
      setTimeout( async () => {
        const config0 = await program.account.protocolConfig.fetch(protocolConfigPda);
      [loanPda] = PublicKey.findProgramAddressSync(
        [LOAN_SEED, new anchor.BN(config0.loanCounter).toArrayLike(Buffer, "le", 8), borrower.publicKey.toBuffer()],
        program.programId
      );
      
      const principal = new anchor.BN(5 * LAMPORTS_PER_SOL);
      const duration = new anchor.BN(30 * 24 * 60 * 60); // 30 days in seconds
      const interestRateBps = 500; // 5%
      const adminFeeBps = 100; // 1%

      const borrowerBalanceBefore = await connection.getBalance(depositor1.publicKey);
      const vaultBalanceBefore = await connection.getBalance(vaultPda);

      const tx = await program.methods
        .requestLoan(
          principal,
          duration,
          interestRateBps,
          adminFeeBps
        )
        .accounts({
          borrower: depositor1.publicKey,
          loan: loanPda,
          protocolConfig: protocolConfigPda,
          vault: vaultPda,
          //authorityPda: authorityPda,
          adminPda: adminPda,
          deployer: deployer.publicKey,
          //systemProgram: SystemProgram.programId,
        })
        .signers([depositor1])
        .rpc();

      console.log("Request loan tx:", tx);

      
      // // Verify protocol config updated
      const config = await program.account.protocolConfig.fetch(protocolConfigPda);
      // Verify loan account created
      const loan = await program.account.loan.fetch(loanPda);
      assert.equal(loan.loanId.toNumber(), (config.loanCounter-1));
      assert.ok(loan.borrower.equals(depositor1.publicKey));
      assert.equal(loan.principal.toNumber(), principal.toNumber());
      assert.equal(loan.duration.toNumber(), duration.toNumber());
      assert.equal(loan.interestRateBps, interestRateBps);
      assert.equal(loan.adminFeeBps, adminFeeBps);
      assert.deepEqual(loan.state, { pending: {} });

      // Verify admin fee paid
      const adminFee = principal.toNumber() * adminFeeBps / 10000;
      assert.equal(loan.adminFeePaid.toNumber(), adminFee);

      
     // assert.equal(config.totalLoansOutstanding.toNumber(), principal.toNumber());
       }, 5000);
      
    });

    it("should fail to request loan with zero principal", async () => {
      const loanId2 = 2;
      const config0 = await program.account.protocolConfig.fetch(protocolConfigPda);
      const [loanPda2] = PublicKey.findProgramAddressSync(
        [LOAN_SEED, new anchor.BN(config0.loanCounter).toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      try {
        await program.methods
          .requestLoan(
            new anchor.BN(0),
            new anchor.BN(30 * 24 * 60 * 60),
            500,
            100
          )
          .accounts({
            borrower: borrower.publicKey,
            loan: loanPda2,
            protocolConfig: protocolConfigPda,
            vault: vaultPda,
            authorityPda: authorityPda,
            adminPda: adminPda,
            deployerPda: deployer.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([borrower])
          .rpc();
        assert.fail("Should have thrown error");
      } catch (error) {
        assert.ok(error.toString().includes("InvalidAmount"));
      }
    });

    it("should fail to request loan exceeding liquidity", async () => {
      const loanId3 = 3;
      const config0 = await program.account.protocolConfig.fetch(protocolConfigPda);
      const [loanPda3] = PublicKey.findProgramAddressSync(
        [LOAN_SEED, new anchor.BN(config0.loanCounter).toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      try {
        await program.methods
          .requestLoan(
            new anchor.BN(100 * LAMPORTS_PER_SOL), // More than available
            new anchor.BN(30 * 24 * 60 * 60),
            500,
            100
          )
          .accounts({
            borrower: borrower.publicKey,
            loan: loanPda3,
            protocolConfig: protocolConfigPda,
            vault: vaultPda,
            authorityPda: authorityPda,
            adminPda: adminPda,
            deployerPda: deployer.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([borrower])
          .rpc();
        assert.fail("Should have thrown error");
      } catch (error) {
        assert.ok(error.toString().includes("InsufficientLiquidity"));
      }
    });
  });
/*
  describe("set_deployed_program", () => {
    let loanId: number;
    let loanPda: PublicKey;
    let programPubkey: PublicKey;

    before(() => {
      loanId = 1;
      [loanPda] = PublicKey.findProgramAddressSync(
        [LOAN_SEED, new anchor.BN(loanId).toArrayLike(Buffer, "le", 8)],
        program.programId
      );
      programPubkey = Keypair.generate().publicKey;
    });

    it("should allow admin to set deployed program pubkey", async () => {
      const tx = await program.methods
        .setDeployedProgram(new anchor.BN(loanId), programPubkey)
        .accounts({
          admin: admin.publicKey,
          protocolConfig: protocolConfigPda,
          loan: loanPda,
        })
        .signers([admin])
        .rpc();

      console.log("Set deployed program tx:", tx);

      // Verify loan updated
      const loan = await program.account.loan.fetch(loanPda);
      assert.ok(loan.programPubkey.equals(programPubkey));
    });

    it("should fail if non-admin tries to set program", async () => {
      const loanId4 = 4;
      const principal = new anchor.BN(2 * LAMPORTS_PER_SOL);
      const [loanPda4] = PublicKey.findProgramAddressSync(
        [LOAN_SEED, new anchor.BN(loanId4).toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      // First create a new loan
      await program.methods
        .requestLoan(
          new anchor.BN(loanId4),
          principal,
          new anchor.BN(30 * 24 * 60 * 60),
          500,
          100
        )
        .accounts({
          borrower: borrower.publicKey,
          loan: loanPda4,
          protocolConfig: protocolConfigPda,
          vault: vaultPda,
          authorityPda: authorityPda,
          adminPda: adminPda,
          deployerPda: deployer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([borrower])
        .rpc();

      try {
        await program.methods
          .setDeployedProgram(new anchor.BN(loanId4), Keypair.generate().publicKey)
          .accounts({
            admin: depositor1.publicKey,
            protocolConfig: protocolConfigPda,
            loan: loanPda4,
          })
          .signers([depositor1])
          .rpc();
        assert.fail("Should have thrown error");
      } catch (error) {
        assert.ok(error.toString().includes("Unauthorized"));
      }
    });
  });

  describe("repay_loan", () => {
    let loanId: number;
    let loanPda: PublicKey;
    let programDataAccount: PublicKey;

    before(() => {
      loanId = 1;
      [loanPda] = PublicKey.findProgramAddressSync(
        [LOAN_SEED, new anchor.BN(loanId).toArrayLike(Buffer, "le", 8)],
        program.programId
      );
      // Mock program data account
      programDataAccount = Keypair.generate().publicKey;
    });

    it("should allow borrower to repay loan", async () => {
      const vaultBalanceBefore = await connection.getBalance(vaultPda);
      const loanBefore = await program.account.loan.fetch(loanPda);

      const tx = await program.methods
        .repayLoan()
        .accounts({
          borrower: borrower.publicKey,
          loan: loanPda,
          protocolConfig: protocolConfigPda,
          vault: vaultPda,
          authorityPda: authorityPda,
          programData: programDataAccount,
          systemProgram: SystemProgram.programId,
        })
        .signers([borrower])
        .rpc();

      console.log("Repay loan tx:", tx);

      // Verify loan state updated
      const loan = await program.account.loan.fetch(loanPda);
      assert.deepEqual(loan.state, { repaid: {} });
      assert.ok(loan.repaidTs !== null);
      assert.ok(loan.interestPaid !== null);

      // Verify protocol config updated
      const config = await program.account.protocolConfig.fetch(protocolConfigPda);
      const expectedOutstanding = 
        7 * LAMPORTS_PER_SOL - loanBefore.principal.toNumber();
      assert.equal(config.totalLoansOutstanding.toNumber(), expectedOutstanding);
    });

    it("should fail to repay already repaid loan", async () => {
      try {
        await program.methods
          .repayLoan()
          .accounts({
            borrower: borrower.publicKey,
            loan: loanPda,
            protocolConfig: protocolConfigPda,
            vault: vaultPda,
            authorityPda: authorityPda,
            programData: programDataAccount,
            systemProgram: SystemProgram.programId,
          })
          .signers([borrower])
          .rpc();
        assert.fail("Should have thrown error");
      } catch (error) {
        assert.ok(error.toString().includes("LoanNotActive"));
      }
    });
  });
 */
  describe("set_paused", () => {
    it("should allow admin to pause protocol", async () => {
      const tx = await program.methods
        .setPaused(true)
        .accounts({
          admin: admin.publicKey,
          protocolConfig: protocolConfigPda,
        })
        .signers([admin])
        .rpc();

      console.log("Set paused tx:", tx);

      const config = await program.account.protocolConfig.fetch(protocolConfigPda);
      assert.equal(config.isPaused, true);
    });

    it("should fail to deposit when paused", async () => {
      try {
        await program.methods
          .deposit(new anchor.BN(1 * LAMPORTS_PER_SOL))
          .accounts({
            depositor: depositor1.publicKey,
            depositorRecord: depositor1RecordPda,
            protocolConfig: protocolConfigPda,
            vault: vaultPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([depositor1])
          .rpc();
        assert.fail("Should have thrown error");
      } catch (error) {
        assert.ok(error.toString().includes("ProtocolPaused"));
      }
    });

    it("should allow admin to unpause protocol", async () => {
      await program.methods
        .setPaused(false)
        .accounts({
          admin: admin.publicKey,
          protocolConfig: protocolConfigPda,
        })
        .signers([admin])
        .rpc();

      const config = await program.account.protocolConfig.fetch(protocolConfigPda);
      assert.equal(config.isPaused, false);
    });

    it("should fail if non-admin tries to pause", async () => {
      try {
        await program.methods
          .setPaused(true)
          .accounts({
            admin: depositor1.publicKey,
            protocolConfig: protocolConfigPda,
          })
          .signers([depositor1])
          .rpc();
        assert.fail("Should have thrown error");
      } catch (error) {
        assert.ok(error.toString().includes("Unauthorized"));
      }
    });
  });
/*
  describe("recover_loan", () => {
    let expiredLoanId: number;
    let expiredLoanPda: PublicKey;

    before(async () => {
      expiredLoanId = 5;
      [expiredLoanPda] = PublicKey.findProgramAddressSync(
        [LOAN_SEED, new anchor.BN(expiredLoanId).toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      // Create a loan with very short duration for testing
      await program.methods
        .requestLoan(
          new anchor.BN(expiredLoanId),
          new anchor.BN(1 * LAMPORTS_PER_SOL),
          new anchor.BN(5), // 1 second duration
          500,
          100
        )
        .accounts({
          borrower: borrower.publicKey,
          loan: expiredLoanPda,
          protocolConfig: protocolConfigPda,
          vault: vaultPda,
          authorityPda: authorityPda,
          adminPda: adminPda,
          deployerPda: deployer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([borrower])
        .rpc();

      // Wait for loan to expire
      await new Promise(resolve => setTimeout(resolve, 2000));
    });

    it("should allow admin to recover expired loan", async () => {
      const configBefore = await program.account.protocolConfig.fetch(protocolConfigPda);

      const tx = await program.methods
        .recoverLoan()
        .accounts({
          admin: admin.publicKey,
          protocolConfig: protocolConfigPda,
          loan: expiredLoanPda,
          adminPda: adminPda,
          treasury: treasuryPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      console.log("Recover loan tx:", tx);

      // Verify loan state updated
      const loan = await program.account.loan.fetch(expiredLoanPda);
      assert.deepEqual(loan.state, { recovered: {} });
      assert.ok(loan.recoveredTs !== null);

      // Verify protocol config updated
      const config = await program.account.protocolConfig.fetch(protocolConfigPda);
      assert.equal(
        config.totalLoansOutstanding.toNumber(),
        configBefore.totalLoansOutstanding.toNumber() - loan.principal.toNumber()
      );
    });

    it("should fail to recover non-expired loan", async () => {
      const loanId6 = 6;
      const [loanPda6] = PublicKey.findProgramAddressSync(
        [LOAN_SEED, new anchor.BN(loanId6).toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      // Create a loan with long duration
      await program.methods
        .requestLoan(
          new anchor.BN(loanId6),
          new anchor.BN(1 * LAMPORTS_PER_SOL),
          new anchor.BN(365 * 24 * 60 * 60), // 1 year
          500,
          100
        )
        .accounts({
          borrower: borrower.publicKey,
          loan: loanPda6,
          protocolConfig: protocolConfigPda,
          vault: vaultPda,
          authorityPda: authorityPda,
          adminPda: adminPda,
          deployerPda: deployer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([borrower])
        .rpc();

      try {
        await program.methods
          .recoverLoan()
          .accounts({
            admin: admin.publicKey,
            protocolConfig: protocolConfigPda,
            loan: loanPda6,
            adminPda: adminPda,
            treasury: treasuryPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([admin])
          .rpc();
        assert.fail("Should have thrown error");
      } catch (error) {
        assert.ok(error.toString().includes("LoanNotExpired"));
      }
    });
  });

  

  describe("return_reclaimed_sol", () => {
    let recoveredLoanId: number;
    let recoveredLoanPda: PublicKey;

    before(() => {
      recoveredLoanId = 5; // The expired loan we recovered earlier
      [recoveredLoanPda] = PublicKey.findProgramAddressSync(
        [LOAN_SEED, new anchor.BN(recoveredLoanId).toArrayLike(Buffer, "le", 8)],
        program.programId
      );
    });

    it("should allow admin to return reclaimed SOL", async () => {
      const reclaimAmount = new anchor.BN(0.5 * LAMPORTS_PER_SOL);
      const vaultBalanceBefore = await connection.getBalance(vaultPda);

      const tx = await program.methods
        .returnReclaimedSol(reclaimAmount)
        .accounts({
          caller: admin.publicKey,
          protocolConfig: protocolConfigPda,
          loan: recoveredLoanPda,
          vault: vaultPda,
          deployerPda: deployer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      console.log("Return reclaimed SOL tx:", tx);

      // Verify loan record updated
      const loan = await program.account.loan.fetch(recoveredLoanPda);
      assert.equal(loan.reclaimedAmount.toNumber(), reclaimAmount.toNumber());
      assert.ok(loan.reclaimedTs !== null);
    });

    it("should fail if loan not recovered", async () => {
      const loanId4 = 4;
      const [loanPda4] = PublicKey.findProgramAddressSync(
        [LOAN_SEED, new anchor.BN(loanId4).toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      try {
        await program.methods
          .returnReclaimedSol(new anchor.BN(1 * LAMPORTS_PER_SOL))
          .accounts({
            caller: admin.publicKey,
            protocolConfig: protocolConfigPda,
            loan: loanPda4,
            vault: vaultPda,
            deployerPda: deployer.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([admin])
          .rpc();
        assert.fail("Should have thrown error");
      } catch (error) {
        assert.ok(error.toString().includes("LoanNotRecovered"));
      }
    });
  });
*/
  describe("update_config", () => {
    it("should allow admin to update configuration", async () => {
      const newAdminFeeSplit = 6000; // 60%
      const newInterestRate = 600; // 6%
      const newAdminFee = 150; // 1.5%

      const tx = await program.methods
        .updateConfig(
          newAdminFeeSplit,
          newInterestRate,
          newAdminFee,
          null,
          null
        )
        .accounts({
          admin: admin.publicKey,
          protocolConfig: protocolConfigPda,
        })
        .signers([admin])
        .rpc();

      console.log("Update config tx:", tx);

      // Verify config updated
      const config = await program.account.protocolConfig.fetch(protocolConfigPda);
      assert.equal(config.adminFeeSplitBps, newAdminFeeSplit);
      assert.equal(config.defaultInterestRateBps, newInterestRate);
      assert.equal(config.defaultAdminFeeBps, newAdminFee);
    });
/*
    it("should allow admin to update deployer address", async () => {
      const newDeployer = Keypair.generate().publicKey;

      await program.methods
        .updateConfig(null, null, null, newDeployer, null)
        .accounts({
          admin: admin.publicKey,
          protocolConfig: protocolConfigPda,
        })
        .signers([admin])
        .rpc();

      const config = await program.account.protocolConfig.fetch(protocolConfigPda);
      assert.ok(config.deployer.equals(newDeployer));
    });
*/
    it("should fail if non-admin tries to update config", async () => {
      try {
        await program.methods
          .updateConfig(5000, null, null, null, null)
          .accounts({
            admin: depositor1.publicKey,
            protocolConfig: protocolConfigPda,
          })
          .signers([depositor1])
          .rpc();
        assert.fail("Should have thrown error");
      } catch (error) {
        assert.ok(error.toString().includes("Unauthorized"));
      }
    });

    it("should fail with invalid parameters", async () => {
      try {
        await program.methods
          .updateConfig(20000, null, null, null, null) // > 10000 bps
          .accounts({
            admin: admin.publicKey,
            protocolConfig: protocolConfigPda,
          })
          .signers([admin])
          .rpc();
        assert.fail("Should have thrown error");
      } catch (error) {
        assert.ok(error.toString().includes("InvalidParameter"));
      }
    });
  });
/* 
  describe("integration tests", () => {
    it("should handle full loan lifecycle", async () => {
      const integrationLoanId = 100;
      const [integrationLoanPda] = PublicKey.findProgramAddressSync(
        [LOAN_SEED, new anchor.BN(integrationLoanId).toArrayLike(Buffer, "le", 8)],
        program.programId
      );

      // 1. Deposit
      await program.methods
        .deposit(new anchor.BN(10 * LAMPORTS_PER_SOL))
        .accounts({
          depositor: depositor1.publicKey,
          depositorRecord: depositor1RecordPda,
          protocolConfig: protocolConfigPda,
          vault: vaultPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([depositor1])
        .rpc();

      // 2. Request loan
      await program.methods
        .requestLoan(
          new anchor.BN(integrationLoanId),
          new anchor.BN(3 * LAMPORTS_PER_SOL),
          new anchor.BN(1), // 1 second for quick test
          500,
          100
        )
        .accounts({
          borrower: borrower.publicKey,
          loan: integrationLoanPda,
          protocolConfig: protocolConfigPda,
          vault: vaultPda,
          authorityPda: authorityPda,
          adminPda: adminPda,
          deployerPda: deployer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([borrower])
        .rpc();

      // 3. Set deployed program
      const programPubkey = Keypair.generate().publicKey;
      await program.methods
        .setDeployedProgram(new anchor.BN(integrationLoanId), programPubkey)
        .accounts({
          admin: admin.publicKey,
          protocolConfig: protocolConfigPda,
          loan: integrationLoanPda,
        })
        .signers([admin])
        .rpc();

      // 4. Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 5. Recover loan
      await program.methods
        .recoverLoan()
        .accounts({
          admin: admin.publicKey,
          protocolConfig: protocolConfigPda,
          loan: integrationLoanPda,
          adminPda: adminPda,
          treasury: treasuryPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      // Verify final state
      const loan = await program.account.loan.fetch(integrationLoanPda);
      assert.deepEqual(loan.state, { recovered: {} });
      assert.ok(loan.recoveredTs !== null);

      console.log("✅ Full loan lifecycle completed successfully");
    });
  });
  */

});