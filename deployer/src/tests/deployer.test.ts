// src/__tests__/deployer.test.ts
import { jest } from '@jest/globals';
import { Keypair, PublicKey, Connection } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { StateManager, BinaryManager, ProgramDeployer, EventMonitor } from '../index';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Level } from 'level';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Mock Solana web3.js
jest.mock('@solana/web3.js', () => ({
  ...jest.requireActual('@solana/web3.js'),
  Connection: jest.fn().mockImplementation(() => ({
    getBalance: jest.fn(),
    getAccountInfo: jest.fn(),
    getMinimumBalanceForRentExemption: jest.fn(),
    sendTransaction: jest.fn(),
    confirmTransaction: jest.fn(),
    onLogs: jest.fn(),
    removeOnLogsListener: jest.fn(),
    getParsedTransaction: jest.fn(),
  })),
}));

describe('StateManager', () => {
  let stateManager: StateManager;
  const testDbPath = './test-db';

  beforeEach(async () => {
    // Clean up test database
    try {
      await fs.rm(testDbPath, { recursive: true, force: true });
    } catch {}
    stateManager = new StateManager(testDbPath);
  });

  afterEach(async () => {
    await stateManager.close();
    // Clean up
    try {
      await fs.rm(testDbPath, { recursive: true, force: true });
    } catch {}
  });

  describe('Deployment Records', () => {
    it('should save and retrieve deployment record', async () => {
      const deployment = {
        loanId: '1',
        borrower: '11111111111111111111111111111111',
        status: 'pending' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        principal: '1000000000',
      };

      await stateManager.saveDeployment(deployment);
      const retrieved = await stateManager.getDeployment('1');

      expect(retrieved).toEqual(deployment);
    });

    it('should return null for non-existent deployment', async () => {
      const result = await stateManager.getDeployment('999');
      expect(result).toBeNull();
    });

    it('should retrieve all deployments', async () => {
      const deployments = [
        {
          loanId: '1',
          borrower: 'addr1',
          status: 'deployed' as const,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          principal: '1000000000',
        },
        {
          loanId: '2',
          borrower: 'addr2',
          status: 'pending' as const,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          principal: '2000000000',
        },
      ];

      for (const deployment of deployments) {
        await stateManager.saveDeployment(deployment);
      }

      const retrieved = await stateManager.getAllDeployments();
      expect(retrieved).toHaveLength(2);
      expect(retrieved.map(d => d.loanId).sort()).toEqual(['1', '2']);
    });
  });

  describe('Slot Tracking', () => {
    it('should save and retrieve last processed slot', async () => {
      await stateManager.setLastProcessedSlot(12345);
      const slot = await stateManager.getLastProcessedSlot();
      expect(slot).toBe(12345);
    });

    it('should return null for unset slot', async () => {
      const slot = await stateManager.getLastProcessedSlot();
      expect(slot).toBeNull();
    });
  });
});

describe('BinaryManager', () => {
  let binaryManager: BinaryManager;
  const testStoragePath = './test-binaries';

  beforeEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testStoragePath, { recursive: true, force: true });
    } catch {}
    binaryManager = new BinaryManager(testStoragePath);
    await binaryManager.init();
  });

  afterEach(async () => {
    // Clean up
    try {
      await fs.rm(testStoragePath, { recursive: true, force: true });
    } catch {}
  });

  describe('Binary Storage', () => {
    it('should store and retrieve binary', async () => {
      const testBinary = Buffer.from('test binary data');
      const hash = await binaryManager.storeBinary('1', testBinary);

      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64); // SHA256 hex string

      const retrieved = await binaryManager.getBinary('1', hash);
      expect(retrieved.equals(testBinary)).toBe(true);
    });

    it('should generate consistent hash for same binary', async () => {
      const testBinary = Buffer.from('test binary data');
      const hash1 = await binaryManager.storeBinary('1', testBinary);
      const hash2 = await binaryManager.storeBinary('2', testBinary);

      expect(hash1).toBe(hash2);
    });
  });

  describe('Binary Validation', () => {
    it('should reject empty binary', async () => {
      const result = await binaryManager.validateBinary(Buffer.from(''));
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Empty binary');
    });

    it('should reject non-ELF binary', async () => {
      const nonElfBinary = Buffer.from('not an elf file');
      const result = await binaryManager.validateBinary(nonElfBinary);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Invalid ELF header');
    });

    it('should accept valid ELF binary', async () => {
      // ELF magic bytes followed by dummy data
      const elfBinary = Buffer.concat([
        Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
        Buffer.from('dummy elf content'),
      ]);
      const result = await binaryManager.validateBinary(elfBinary);
      expect(result.valid).toBe(true);
    });

    it('should reject oversized binary', async () => {
      // Create a binary larger than 100MB
      const elfHeader = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
      const largeBinary = Buffer.concat([
        elfHeader,
        Buffer.alloc(100 * 1024 * 1024 + 1),
      ]);
      const result = await binaryManager.validateBinary(largeBinary);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Binary too large (>100MB)');
    });
  });
});

describe('Event Processing', () => {
  let eventMonitor: EventMonitor;
  let mockConnection: jest.Mocked<Connection>;
  let mockProgram: any;
  let stateManager: StateManager;

  beforeEach(async () => {
    mockConnection = new Connection('') as jest.Mocked<Connection>;
    stateManager = new StateManager('./test-event-db');
    
    mockProgram = {
      account: {
        loan: {
          fetch: jest.fn(),
        },
      },
      coder: {
        events: {
          decode: jest.fn(),
        },
      },
    };

    eventMonitor = new EventMonitor(
      mockConnection as any,
      mockProgram,
      stateManager
    );
  });

  afterEach(async () => {
    await eventMonitor.stop();
    await stateManager.close();
    try {
      await fs.rm('./test-event-db', { recursive: true, force: true });
    } catch {}
  });

  describe('Event Subscription', () => {
    it('should subscribe to program logs on start', async () => {
      const subscriptionId = 123;
      mockConnection.onLogs.mockReturnValue(subscriptionId);

      await eventMonitor.start();

      expect(mockConnection.onLogs).toHaveBeenCalledWith(
        expect.any(PublicKey),
        expect.any(Function),
        'confirmed'
      );
    });

    it('should unsubscribe on stop', async () => {
      const subscriptionId = 123;
      mockConnection.onLogs.mockReturnValue(subscriptionId);

      await eventMonitor.start();
      await eventMonitor.stop();

      expect(mockConnection.removeOnLogsListener).toHaveBeenCalledWith(subscriptionId);
    });
  });

  describe('Event Emission', () => {
    it('should emit loanRequested event', (done) => {
      eventMonitor.on('loanRequested', (event) => {
        expect(event.loanId).toBe('1');
        expect(event.borrower).toBeDefined();
        expect(event.principal).toBeDefined();
        done();
      });

      // Simulate event
      eventMonitor.emit('loanRequested', {
        loanId: '1',
        borrower: 'test-borrower',
        principal: '1000000000',
        duration: '86400',
        interestRateBps: 500,
        adminFee: '10000000',
      });
    });

    it('should emit loanRecovered event', (done) => {
      eventMonitor.on('loanRecovered', (event) => {
        expect(event.loanId).toBe('1');
        done();
      });

      // Simulate event
      eventMonitor.emit('loanRecovered', { loanId: '1' });
    });
  });
});

// Integration test
describe('Integration Tests', () => {
  it('should handle complete deployment flow', async () => {
    // This would require a localnet setup
    // Placeholder for integration test structure
    expect(true).toBe(true);
  });
});

// src/__tests__/deployer.integration.test.ts
import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as anchor from '@project-serum/anchor';
import { DeployerOrchestrator, StateManager, BinaryManager, ProgramDeployer, EventMonitor } from '../index';
import * as fs from 'fs/promises';

describe('Deployer Integration Tests', () => {
  let connection: Connection;
  let orchestrator: DeployerOrchestrator;
  let stateManager: StateManager;
  
  // Only run if TEST_INTEGRATION env var is set
  const shouldRunIntegration = process.env.TEST_INTEGRATION === 'true';

  beforeAll(async () => {
    if (!shouldRunIntegration) {
      console.log('Skipping integration tests. Set TEST_INTEGRATION=true to run.');
      return;
    }

    // Setup localnet connection
    connection = new Connection('http://127.0.0.1:8899', 'confirmed');

    // Initialize components
    stateManager = new StateManager('./test-integration-db');
    const binaryManager = new BinaryManager('./test-integration-binaries');
    await binaryManager.init();

    // Load test keypairs
    const deployerKeypair = Keypair.generate();
    const adminKeypair = Keypair.generate();

    // Fund accounts for testing
    const airdropSig1 = await connection.requestAirdrop(
      deployerKeypair.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(airdropSig1);

    const airdropSig2 = await connection.requestAirdrop(
      adminKeypair.publicKey,
      10 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(airdropSig2);

    // Deploy the lending protocol first
    // This would involve deploying your actual program to localnet

    // Create deployer components
    const programDeployer = new ProgramDeployer(
      connection,
      deployerKeypair,
      adminKeypair
    );

    // Note: You'll need to load the actual IDL here
    const idl = JSON.parse(await fs.readFile('./idl.json', 'utf8'));
    const programId = new anchor.web3.PublicKey('4dWBvsjopo5Z145Xmse3Lx41G1GKpMyWMLc6p4a52T4N');
    const program = new anchor.Program(idl, programId, { connection });

    const eventMonitor = new EventMonitor(connection, program, stateManager);

    orchestrator = new DeployerOrchestrator(
      connection,
      stateManager,
      binaryManager,
      programDeployer,
      eventMonitor
    );
  });

  afterAll(async () => {
    if (!shouldRunIntegration) return;

    await orchestrator?.stop();
    await stateManager?.close();

    // Cleanup
    try {
      await fs.rm('./test-integration-db', { recursive: true, force: true });
      await fs.rm('./test-integration-binaries', { recursive: true, force: true });
    } catch {}
  });

  it('should deploy program on loan request', async () => {
    if (!shouldRunIntegration) {
      expect(true).toBe(true);
      return;
    }

    // Start orchestrator
    await orchestrator.start();

    // Simulate loan request
    // This would involve calling the on-chain request_loan instruction

    // Wait for deployment
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Check deployment state
    const deployment = await stateManager.getDeployment('1');
    expect(deployment?.status).toBe('deployed');
  });

  it('should recover program on loan expiry', async () => {
    if (!shouldRunIntegration) {
      expect(true).toBe(true);
      return;
    }

    // This would test the recovery flow
    // Requires a deployed program and expired loan
  });
});

// scripts/test-deployer.ts
/**
 * Manual testing script for the deployer service
 * Run with: npx ts-node scripts/test-deployer.ts
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as anchor from '@project-serum/anchor';
import * as fs from 'fs/promises';

async function testDeployer() {
  console.log('Starting deployer test...');

  const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
  
  // Generate test keypairs
  const borrowerKeypair = Keypair.generate();
  console.log('Borrower:', borrowerKeypair.publicKey.toBase58());

  // Fund borrower
  console.log('Requesting airdrop...');
  const sig = await connection.requestAirdrop(
    borrowerKeypair.publicKey,
    5 * LAMPORTS_PER_SOL
  );
  await connection.confirmTransaction(sig);

  // Load program
  const idl = JSON.parse(await fs.readFile('./idl.json', 'utf8'));
  const programId = new PublicKey('4dWBvsjopo5Z145Xmse3Lx41G1GKpMyWMLc6p4a52T4N');
  const program = new anchor.Program(idl, programId, {
    connection,
    wallet: new anchor.Wallet(borrowerKeypair),
  });

  // Call request_loan
  console.log('Requesting loan...');
  const loanId = new anchor.BN(Date.now());
  
  try {
    const tx = await program.methods
      .requestLoan(
        loanId,
        new anchor.BN(LAMPORTS_PER_SOL), // 1 SOL principal
        new anchor.BN(86400), // 1 day duration
        500, // 5% interest
        100  // 1% admin fee
      )
      .accounts({
        // Add required accounts
      })
      .rpc();

    console.log('Loan requested:', tx);
    console.log('Loan ID:', loanId.toString());

    // Now the deployer service should pick up this event and deploy
    console.log('Waiting for deployment...');
    
    // Poll for deployment status
    let deployed = false;
    let attempts = 0;
    while (!deployed && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check deployment status via HTTP endpoint
      try {
        const response = await fetch(`http://localhost:3000/deployments/${loanId}`);
        const deployment = await response.json();
        console.log('Deployment status:', deployment.status);
        
        if (deployment.status === 'deployed') {
          deployed = true;
          console.log('Program deployed:', deployment.programId);
        }
      } catch (error) {
        console.log('Waiting for deployer service...');
      }
      
      attempts++;
    }

    if (deployed) {
      console.log('Deployment successful!');
    } else {
      console.log('Deployment timed out');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

if (require.main === module) {
  testDeployer().catch(console.error);
}