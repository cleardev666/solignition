import * as anchor from '@coral-xyz/anchor';
import { Program, AnchorProvider, Wallet, Idl } from '@coral-xyz/anchor';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
  ConfirmOptions,
} from '@solana/web3.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import winston from 'winston';
import { EventEmitter } from 'events';
import express from 'express';
import multer from 'multer';
import { Registry, Gauge, Counter, Histogram } from 'prom-client';
import * as dotenv from 'dotenv';
import { Level } from 'level';
import { GraphQLClient, gql } from 'graphql-request';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import cors from 'cors';
import { Solignition } from '../../anchor/target/types/solignition';
import { error, log } from 'console';

const execAsync = promisify(exec);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ============ Configuration ============
interface DeployerConfig {
  rpcUrl: string;
  wsUrl?: string;
  programId: PublicKey;
  deployerKeypairPath: string;
  adminKeypairPath?: string;
  binaryStoragePath: string;
  uploadPath: string;
  dbPath: string;
  idlPath: string;
  port: number;
  maxRetries: number;
  retryDelayMs: number;
  pollIntervalMs: number;
  cluster: 'devnet' | 'testnet' | 'mainnet-beta' | 'localnet';
  graphqlEndpoint: string;
  solanaCliPath?: string;
}

const config: DeployerConfig = {
  rpcUrl: process.env.RPC_URL || 'http://127.0.0.1:8899',
  wsUrl: process.env.WS_URL,
  programId: new PublicKey(process.env.PROGRAM_ID || '4dWBvsjopo5Z145Xmse3Lx41G1GKpMyWMLc6p4a52T4N'),
  deployerKeypairPath: process.env.DEPLOYER_KEYPAIR_PATH || './keys/deployer-keypair.json',
  adminKeypairPath: process.env.ADMIN_KEYPAIR_PATH,
  binaryStoragePath: process.env.BINARY_STORAGE_PATH || './binaries',
  uploadPath: process.env.UPLOAD_PATH || './uploads',
  dbPath: process.env.DB_PATH || './deployer-state',
  idlPath: process.env.IDL_PATH || './idl.json',
  port: parseInt(process.env.PORT || '3000'),
  maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
  retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '5000'),
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '5000'),
  cluster: (process.env.CLUSTER as any) || 'localnet',
  graphqlEndpoint: process.env.GRAPHQL_ENDPOINT || 'http://127.0.0.1:18488/subgraphs',
  solanaCliPath: process.env.SOLANA_CLI_PATH || 'solana',
};

// ============ Constants ============
const VAULT_SEED = Buffer.from('vault');
const AUTHORITY_SEED = Buffer.from('authority');
const PROTOCOL_CONFIG_SEED = Buffer.from('config');
const LOAN_SEED = Buffer.from('loan');

// ============ Types ============
interface DeploymentRecord {
  loanId: string;
  borrower: string;
  programId?: string;
  deploymentCost?: number;
  deployTxSignature?: string;
  setDeployedTxSignature?: string;
  recoveryTxSignature?: string;
  status: 'pending' | 'deploying' | 'deployed' | 'recovering' | 'recovered' | 'failed';
  error?: string;
  createdAt: number;
  updatedAt: number;
  binaryHash?: string;
  binaryPath?: string;
  principal: string;
}

interface FileUploadRecord {
  fileId: string;
  borrower: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  binaryHash: string;
  estimatedCost: number;
  status: 'pending' | 'ready' | 'deployed';
  createdAt: number;
}

interface LoanAccount {
  loanId: anchor.BN;
  borrower: PublicKey;
  principal: anchor.BN;
  deployedProgram: PublicKey | null;
  state: number; // 0: Active, 1: Repaid, 2: Recovered, 4:pending 5:RepaidPendingTransfer
  startTs: anchor.BN;
  duration: anchor.BN;
  interestRateBps: number;
  adminFeeBps: number;
  reclaimedAmount: anchor.BN;
}

interface LoanRequestedData {
  adminFee: string;
  borrower: string;
  duration: string;
  interestRateBps: string;
  loanId: string;
  principal: string;
  slot: number;
  transactionSignature: string;
}

interface ProtocolConfigData {
  admin: string;
  adminFeeSplitBps: string;
  defaultAdminFeeBps: string;
  defaultInterestRateBps: string;
  deployer: string;
  isPaused: number;
  lamports: number;
  loanCounter: string;
  owner: string;
  pubkey: string;
  slot: number;
  totalDeposits: string;
  totalLoansOutstanding: string;
  totalYieldDistributed: string;
  treasury: string;
}

// ============ Logging ============
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    new winston.transports.File({ filename: 'deployer.log' }),
  ],
});

// ============ Metrics ============
const registry = new Registry();
const metrics = {
  deploymentsTotal: new Counter({
    name: 'deployer_deployments_total',
    help: 'Total number of deployments',
    labelNames: ['status'],
    registers: [registry],
  }),
  recoveryTotal: new Counter({
    name: 'deployer_recovery_total',
    help: 'Total number of program recoveries',
    labelNames: ['status'],
    registers: [registry],
  }),
  deploymentDuration: new Histogram({
    name: 'deployer_deployment_duration_seconds',
    help: 'Duration of deployment operations',
    registers: [registry],
  }),
  activeLoans: new Gauge({
    name: 'deployer_active_loans',
    help: 'Number of active loans being monitored',
    registers: [registry],
  }),
  fileUploads: new Counter({
    name: 'deployer_file_uploads_total',
    help: 'Total number of file uploads',
    registers: [registry],
  }),
  expiredLoansRecovered: new Counter({
  name: 'deployer_expired_loans_recovered_total',
  help: 'Total number of expired loans recovered',
  registers: [registry],
}),
expiredLoansChecked: new Counter({
  name: 'deployer_expired_loans_checked_total',
  help: 'Total number of expired loan checks performed',
  registers: [registry],
}),
};

// ============ State Management ============
class StateManager {
  private db: Level<string, any>;

  constructor(dbPath: string) {
    this.db = new Level(dbPath, { valueEncoding: 'json' });
  }

  async getDeployment(loanId: string): Promise<DeploymentRecord | null> {
    try {
      return await this.db.get(`deployment:${loanId}`);
    } catch (error: any) {
      if (error.notFound) return null;
      throw error;
    }
  }

  async saveDeployment(record: DeploymentRecord): Promise<void> {
    await this.db.put(`deployment:${record.loanId}`, record);
  }

  async getAllDeployments(): Promise<DeploymentRecord[]> {
    const deployments: DeploymentRecord[] = [];
    for await (const [key, value] of this.db.iterator()) {
      if (key.startsWith('deployment:')) {
        deployments.push(value);
      }
    }
    return deployments;
  }

  async saveFileUpload(record: FileUploadRecord): Promise<void> {
    await this.db.put(`upload:${record.fileId}`, record);
  }

  async getFileUpload(fileId: string): Promise<FileUploadRecord | null> {
    try {
      return await this.db.get(`upload:${fileId}`);
    } catch (error: any) {
      if (error.notFound) return null;
      throw error;
    }
  }

  async getFileUploadByBorrower(borrower: string): Promise<FileUploadRecord | null> {
    for await (const [key, value] of this.db.iterator()) {
      if (key.startsWith('upload:') && value.borrower === borrower && value.status === 'ready') {
        return value;
      }
    }
    return null;
  }

  async getAllFileUploadsByBorrower(borrower: string): Promise<FileUploadRecord[]> {
  const uploads: FileUploadRecord[] = [];
  for await (const [key, value] of this.db.iterator()) {
    if (key.startsWith('upload:') && value.borrower === borrower) {
      uploads.push(value);
    }
  }
  return uploads;
}

async getFileUploadsByBorrowerAndStatus(
  borrower: string, 
  status?: FileUploadRecord['status']
): Promise<FileUploadRecord[]> {
  const uploads: FileUploadRecord[] = [];
  for await (const [key, value] of this.db.iterator()) {
    if (key.startsWith('upload:') && value.borrower === borrower) {
      if (!status || value.status === status) {
        uploads.push(value);
      }
    }
  }
  return uploads;
}

// method to get all uploads (for admin views)
async getAllFileUploads(): Promise<FileUploadRecord[]> {
  const uploads: FileUploadRecord[] = [];
  for await (const [key, value] of this.db.iterator()) {
    if (key.startsWith('upload:')) {
      uploads.push(value);
    }
  }
  return uploads;
}

// pagination support for large lists
async getFileUploadsByBorrowerPaginated(
  borrower: string, 
  limit: number = 10, 
  offset: number = 0
): Promise<{ uploads: FileUploadRecord[], total: number }> {
  const allUploads = await this.getAllFileUploadsByBorrower(borrower);
  const uploads = allUploads
    .sort((a, b) => b.createdAt - a.createdAt) // Sort by newest first
    .slice(offset, offset + limit);
  
  return {
    uploads,
    total: allUploads.length
  };
}

  async setLastProcessedLoanId(loanId: string): Promise<void> {
    await this.db.put('last-processed-loan-id', loanId);
  }

  async getLastProcessedLoanId(): Promise<string | null> {
    try {
      return await this.db.get('last-processed-loan-id');
    } catch (error: any) {
      if (error.notFound) return null;
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}

// ============ Binary Management ============
class BinaryManager {
  private storagePath: string;
  private uploadPath: string;
  private deployer: SolanaCliDeployer;

  constructor(storagePath: string, uploadPath: string, deployer: SolanaCliDeployer) {
    this.storagePath = storagePath;
    this.uploadPath = uploadPath;
    this.deployer = deployer;
  }

  async init(): Promise<void> {
    await fs.mkdir(this.storagePath, { recursive: true });
    await fs.mkdir(this.uploadPath, { recursive: true });
  }

  async storeBinary(fileId: string, sourcePath: string): Promise<{ hash: string; destinationPath: string }> {
    const binaryData = await fs.readFile(sourcePath);
    const hash = createHash('sha256').update(binaryData).digest('hex');
    const destinationPath = path.join(this.storagePath, `${fileId}_${hash}.so`);
    await fs.copyFile(sourcePath, destinationPath);
    logger.info(`Stored binary for file ${fileId}, hash: ${hash}`);
    return { hash, destinationPath };
  }

  async validateBinary(binaryData: Buffer): Promise<{ valid: boolean; reason?: string }> {
    if (binaryData.length === 0) {
      return { valid: false, reason: 'Empty binary' };
    }

    // Check for ELF header
    const elfMagic = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
    if (!binaryData.subarray(0, 4).equals(elfMagic)) {
      return { valid: false, reason: 'Invalid ELF header' };
    }

    // Check file size (adjust based on your requirements)
    if (binaryData.length > 100 * 1024 * 1024) {
      return { valid: false, reason: 'Binary too large (>100MB)' };
    }

    return { valid: true };
  }

  async estimateDeploymentCost(binaryPath: string): Promise<number> {
   try {
     logger.info('Estimating deployment cost for binary', { binaryPath });
    
     // Get actual rent cost from Solana CLI
     const rentInfo = await this.deployer.estimateRentForFile(binaryPath);
    
     // Calculate number of transactions needed based on file size
     // Solana transaction size limit is ~1232 bytes
     // After accounting for transaction overhead (signatures, headers, instructions),
     // we typically have ~900 bytes available for actual program data per transaction
     const USABLE_BYTES_PER_TRANSACTION = 900; // Conservative estimate
     const BASE_FEE_PER_TRANSACTION = 0.000005; // 5000 lamports per signature
    
     // Calculate number of write transactions needed
     const numWriteTransactions = Math.ceil(rentInfo.sizeInBytes / USABLE_BYTES_PER_TRANSACTION);
    
     // Total transactions include:
     // 1. Initial transaction to create the program account
     // 2. Multiple transactions to write the program data
     // 3. Final transaction to mark the program as executable
     const totalTransactions = numWriteTransactions + 2;
    
     // Calculate transaction fees
     const estimatedTransactionFees = totalTransactions * BASE_FEE_PER_TRANSACTION;
    
     // Add a small buffer for potential additional compute units
     // Larger programs may need more compute units
     const computeUnitBuffer = Math.min(0.001, rentInfo.sizeInBytes / (1024 * 1024) * 0.0001);
    
     // Calculate total cost
     const totalCost = rentInfo.sol + estimatedTransactionFees + computeUnitBuffer;
    
     logger.info('Deployment cost estimated', {
      binaryPath,
      fileSizeBytes: rentInfo.sizeInBytes,
      fileSizeMB: (rentInfo.sizeInBytes / (1024 * 1024)).toFixed(2),
      rentCostSOL: rentInfo.sol,
      //rentCostLamports: rentInfo.lamports,
      numWriteTransactions,
      totalTransactions,
      transactionFees: estimatedTransactionFees,
      computeUnitBuffer: computeUnitBuffer,
      totalCostSOL: totalCost
     });
    
     // Round up to 4 decimal places
     return Math.ceil(totalCost * 10000) / 10000;
   }  catch (error) {
     logger.error('Error estimating deployment cost', { 
       error, 
       binaryPath 
     });
    
     // Fallback to estimated calculation if Solana CLI fails
     try {
       const stats = await fs.stat(binaryPath);
       const fileSize = stats.size;
      
       logger.warn('Falling back to estimated rent calculation', { fileSize });
      
       // Fallback estimation
       const rentExemptionBase = 0.01;
       const byteCost = fileSize * 0.00000348;
       
       // Calculate transaction fees based on file size
       const USABLE_BYTES_PER_TRANSACTION = 900;
       const BASE_FEE_PER_TRANSACTION = 0.000005;
       const numWriteTransactions = Math.ceil(fileSize / USABLE_BYTES_PER_TRANSACTION);
       const totalTransactions = numWriteTransactions + 2;
       const transactionFees = totalTransactions * BASE_FEE_PER_TRANSACTION;
      
       const totalCost = rentExemptionBase + byteCost + transactionFees;
      
       return Math.ceil(totalCost * 10000) / 10000;
     } catch (fallbackError) {
       logger.error('Fallback estimation also failed', { fallbackError });
       throw error; // Throw original error
      }
    }
  }
}

// ============ Solana CLI Deployer ============
class SolanaCliDeployer {
  private connection: Connection;
  private deployerKeypairPath: string;
  private cluster: string;

  constructor(connection: Connection, deployerKeypairPath: string, cluster: string) {
    this.connection = connection;
    this.deployerKeypairPath = deployerKeypairPath;
    this.cluster = cluster;
  }

  async deployProgram(binaryPath: string): Promise<{ programId: string; signature: string }> {
    const timer = metrics.deploymentDuration.startTimer();

    try {
      logger.info('Deploying program using Solana CLI', { binaryPath });

      // Generate a new program keypair
      const programKeypair = Keypair.generate();
      const programKeypairPath = `/tmp/program-${programKeypair.publicKey.toBase58()}.json`;
      await fs.writeFile(programKeypairPath, JSON.stringify(Array.from(programKeypair.secretKey)));

      // Build the deploy command
      const deployCommand = `${config.solanaCliPath || 'solana'} program deploy ${binaryPath} \
        --program-id ${programKeypairPath} \
        --keypair ${this.deployerKeypairPath} \
        --url ${config.rpcUrl} \
        --commitment confirmed`;

      logger.info('Executing deploy command', { command: deployCommand });

      // Execute the deployment
      const { stdout, stderr } = await execAsync(deployCommand);
      
      if (stderr && !stderr.includes('Program Id:')) {
        throw new Error(`Deployment error: ${stderr}`);
      }

      // Parse the program ID from output
      const programIdMatch = stdout.match(/Program Id: (\w+)/);
      if (!programIdMatch) {
        throw new Error('Failed to parse program ID from deployment output');
      }

      const programId = programIdMatch[1];
      
      // Get the latest transaction signature
      const signatures = await this.connection.getSignaturesForAddress(
        programKeypair.publicKey,
        { limit: 1 }
      );
      
      const signature = signatures[0]?.signature || 'unknown';

      // Clean up temporary keypair file
      await fs.unlink(programKeypairPath);

      logger.info('Program deployed successfully', { programId, signature });
      metrics.deploymentsTotal.inc({ status: 'success' });

      return { programId, signature };
    } catch (error) {
      logger.error('Failed to deploy program', { error });
      metrics.deploymentsTotal.inc({ status: 'failure' });
      throw error;
    } finally {
      timer();
    }
  }

  async closeProgram(programId: string): Promise<{ signature: string }> {
    try {
      logger.info('Closing program using Solana CLI', { programId });

      const closeCommand = `${config.solanaCliPath || 'solana'} program close ${programId} \
        --keypair ${this.deployerKeypairPath} \
        --url ${config.rpcUrl} \
        --bypass-warning \
        --commitment confirmed`;

      const { stdout, stderr } = await execAsync(closeCommand);
      
      if (stderr && !stderr.includes('closed')) {
        throw new Error(`Close error: ${stderr}`);
      }

      // Parse signature from output if available
      const signatureMatch = stdout.match(/Signature: (\w+)/);
      const signature = signatureMatch ? signatureMatch[1] : 'unknown';

      logger.info('Program closed successfully', { programId, signature });
      metrics.recoveryTotal.inc({ status: 'success' });

      return { signature };
    } catch (error) {
      logger.error('Failed to close program', { error });
      metrics.recoveryTotal.inc({ status: 'failure' });
      throw error;
    }
  }

  async getAccountBalance(pubkey: PublicKey): Promise<number> {
    const balance = await this.connection.getBalance(pubkey);
    return balance / LAMPORTS_PER_SOL;
  }

  async estimateRent(sizeInBytes: number): Promise<{  sol: number }> {
  const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
  
  try {
    // Validate size
    if (sizeInBytes <= 0) {
      throw new Error('File size must be greater than 0 bytes');
    }
    
    if (sizeInBytes > MAX_SIZE_BYTES) {
      throw new Error(`File size exceeds maximum allowed size of ${MAX_SIZE_BYTES} bytes (10MB)`);
    }
    
    logger.info('Estimating rent for file', { sizeInBytes });
    
    // Build the rent command
    const rentCommand = `${config.solanaCliPath || 'solana'} rent ${sizeInBytes} \
      --url ${config.rpcUrl}`;
    
    logger.info('Executing rent command', { command: rentCommand });
    
    // Execute the rent estimation
    const { stdout, stderr } = await execAsync(rentCommand);
    
    if (stderr) {
      throw new Error(`Rent estimation error: ${stderr}`);
    }
    
    // Parse the rent amount from output
    // Typical output format: "Rent-exempt minimum: X lamports (Y SOL)"
    //const lamportsMatch = stdout.match(/(\d+(?:\.\d+)?)\s*lamports/);
    const solMatch = stdout.match(/(\d+(?:\.\d+)?)\s*SOL/);
    /*
    if (!lamportsMatch || !solMatch) {
      throw new Error('Failed to parse rent amount from output');
    } */
    
    //const lamports = parseFloat(lamportsMatch[1]);
    const sol = parseFloat(solMatch[1]);
    
    logger.info('Rent estimated successfully', { 
      sizeInBytes, 
      //lamports, 
      sol 
    });
    
    return { sol };
  } catch (error) {
    logger.error('Failed to estimate rent', { 
      error, 
      sizeInBytes 
    });
    throw error;
  }
}

// Add a helper method to estimate rent for a file path
async estimateRentForFile(filePath: string): Promise<{ sol: number; sizeInBytes: number }> {
  try {
    // Get file stats to determine size
    const stats = await fs.stat(filePath);
    const sizeInBytes = stats.size;
    
    logger.info('Estimating rent for file path', { filePath, sizeInBytes });
    
    const rentInfo = await this.estimateRent(sizeInBytes);
    
    return {
      ...rentInfo,
      sizeInBytes
    };
  } catch (error) {
    logger.error('Failed to estimate rent for file', { 
      error, 
      filePath 
    });
    throw error;
  }
}
}

// ============ GraphQL Client ============
class GraphQLMonitor extends EventEmitter {
  private client: GraphQLClient;
  private stateManager: any;
  private isRunning: boolean = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private processedLoans: Set<string> = new Set();
  private logger: winston.Logger;

  constructor(endpoint: string, stateManager: StateManager,logger: winston.Logger) {
    super();
    this.client = new GraphQLClient(endpoint);
    this.stateManager = stateManager;
    this.logger = logger;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    logger.info('Starting GraphQL monitor');
    // Load previously processed loans
    await this.loadProcessedLoans();
    this.startPolling();
  }

  private async loadProcessedLoans(): Promise<void> {
    try {
      const deployments = await this.stateManager.getAllDeployments();
      deployments.forEach(d => {
        this.processedLoans.add(d.loanId);
      });
      this.logger.info(`Loaded ${this.processedLoans.size} processed loans`);
    } catch (error) {
      this.logger.error('Error loading processed loans', { error });
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private startPolling(): void {
    this.pollInterval = setInterval(async () => {
      if (!this.isRunning) return;
      
      try {
        await this.checkForNewLoans();
        //await this.checkLoanStates();
      } catch (error) {
        logger.error('Error in GraphQL polling cycle', { error });
      }
    }, config.pollIntervalMs);

    // Initial check
    this.checkForNewLoans();
  }

  private async checkForNewLoans(): Promise<void> {
    const query = gql`
      query GetLoans {
        loanRequested {
    adminFee
    borrower
    duration
    interestRateBps
    loanId
    principal
    slot
    transactionSignature
  }
      }
    `;

    try {
      const response = await this.client.request<{ loanRequested: LoanRequestedData[] }>(query);
      
      if (!response.loanRequested || !Array.isArray(response.loanRequested)) {
        this.logger.warn('Invalid response structure from GraphQL', { response });
        return;
      }

      this.logger.debug(`Fetched ${response.loanRequested.length} loan requests from GraphQL`);
      
      for (const loan of response.loanRequested) {
        // Check if this loan has already been processed
        if (this.processedLoans.has(loan.loanId)) {
          continue;
        }

        // Check if there's already a deployment record
        const existingDeployment = await this.stateManager.getDeployment(loan.loanId);
        
        if (!existingDeployment || existingDeployment.status === 'failed') {
          this.logger.info('New loan detected for deployment', { 
            loanId: loan.loanId,
            borrower: loan.borrower,
            principal: loan.principal,
            transactionSignature: loan.transactionSignature
          });

          // Emit event for new loan
          this.emit('loanRequested', {
            loanId: loan.loanId,
            borrower: loan.borrower,
            principal: loan.principal,
            duration: loan.duration,
            interestRateBps: loan.interestRateBps,
            adminFee: loan.adminFee,
            transactionSignature: loan.transactionSignature
          });
          
          // Mark as processed
          this.processedLoans.add(loan.loanId);
          
          // Save last processed loan ID
          await this.stateManager.setLastProcessedLoanId(loan.loanId);
        }
      }

      // Update metrics
      const activeLoans = response.loanRequested.length;
      this.logger.debug(`Active loans: ${activeLoans}`);
      
    } catch (error) {
      this.logger.error('Failed to fetch loan requests from GraphQL', { 
        error: error instanceof Error ? error.message : error 
      });
    }
  }
/*
  private async checkLoanStates(): Promise<void> {
    const query = gql`
      query GetLoanStates {
        loans {
          loanId
          state
          deployedProgram
        }
      }
    `;

    try {
      const data = await this.client.request<{ loans: LoanData[] }>(query);
      
      for (const loan of data.loans) {
        const deployment = await this.stateManager.getDeployment(loan.loanId);
        
        if (deployment && deployment.status === 'deployed') {
          // Check if loan has been repaid or recovered
          if (loan.state === 1 || loan.state === 2) { // Repaid or Recovered
            logger.info('Loan state changed, triggering recovery', { 
              loanId: loan.loanId, 
              state: loan.state 
            });
            this.emit('loanRecovered', { loanId: loan.loanId });
          }
        }
      }
    } catch (error) {
      logger.error('Failed to check loan states', { error });
    }
  }
    */

  async getProtocolConfig(): Promise<any> {
    const query = gql`
      query GetProtocolConfig {
        protocolConfig {
    admin
    adminFeeSplitBps
    defaultAdminFeeBps
    defaultInterestRateBps
    deployer
    isPaused
    lamports
    loanCounter
    owner
    pubkey
    slot
    totalDeposits
    totalLoansOutstanding
    totalYieldDistributed
    treasury
   }
      }
    `;

    try {
      const response = await this.client.request<{ protocolConfig: ProtocolConfigData[] }>(query);
      
      if (!response.protocolConfig || !Array.isArray(response.protocolConfig)) {
        this.logger.warn('Invalid protocol config response', { response });
        return null;
      }

      // Get the latest protocol config (highest slot)
      const latestConfig = response.protocolConfig.reduce((latest, current) => {
        return current.slot > latest.slot ? current : latest;
      }, response.protocolConfig[0]);

      this.logger.info('Fetched protocol config', {
        loanCounter: latestConfig.loanCounter,
        totalLoansOutstanding: latestConfig.totalLoansOutstanding,
        isPaused: latestConfig.isPaused,
        slot: latestConfig.slot
      });

      return latestConfig;
    } catch (error) {
      this.logger.error('Failed to fetch protocol config', { error });
      return null;
    }
  }

  // Optional: Method to check loan states if you implement that query later
  async checkLoanStates(): Promise<void> {
    // This would be implemented when you have a loan state query
    // For now, you might need to check on-chain or track states locally
    this.logger.debug('Loan state checking not yet implemented in GraphQL');
  }

  // Get specific loan by ID
  async getLoanById(loanId: string): Promise<LoanRequestedData | null> {
    const query = gql`
      query GetLoanById($loanId: String!) {
        loanRequested(where: { loanId: { _eq: $loanId } }) {
          loanId
          borrower
          principal
          duration
          interestRateBps
          adminFee
          slot
          transactionSignature
        }
      }
    `;

    try {
      const response = await this.client.request<{ loanRequested: LoanRequestedData[] }>(
        query, 
        { loanId }
      );
      
      if (response.loanRequested && response.loanRequested.length > 0) {
        return response.loanRequested[0];
      }
      
      return null;
    } catch (error) {
      this.logger.error('Failed to fetch loan by ID', { loanId, error });
      return null;
    }
  }

  // Get loans for a specific borrower
  async getLoansByBorrower(borrower: string): Promise<LoanRequestedData[]> {
    const query = gql`
      query GetLoansByBorrower($borrower: String!) {
        loanRequested(where: { borrower: { _eq: $borrower } }) {
          loanId
          borrower
          principal
          duration
          interestRateBps
          adminFee
          slot
          transactionSignature
        }
      }
    `;

    try {
      const response = await this.client.request<{ loanRequested: LoanRequestedData[] }>(
        query, 
        { borrower }
      );
      
      return response.loanRequested || [];
    } catch (error) {
      this.logger.error('Failed to fetch loans by borrower', { borrower, error });
      return [];
    }
  }

  // Get recent loans
  async getRecentLoans(limit: number = 10): Promise<LoanRequestedData[]> {
    const query = gql`
      query GetRecentLoans($limit: Int!) {
        loanRequested(order_by: { slot: desc }, limit: $limit) {
          loanId
          borrower
          principal
          duration
          interestRateBps
          adminFee
          slot
          transactionSignature
        }
      }
    `;

    try {
      const response = await this.client.request<{ loanRequested: LoanRequestedData[] }>(
        query, 
        { limit }
      );
      
      return response.loanRequested || [];
    } catch (error) {
      this.logger.error('Failed to fetch recent loans', { error });
      return [];
    }
  }

  // Check if protocol is paused
  async isProtocolPaused(): Promise<boolean> {
    const config = await this.getProtocolConfig();
    return config ? config.isPaused === 1 : false;
  }

  // Get total loans outstanding
  async getTotalLoansOutstanding(): Promise<string> {
    const config = await this.getProtocolConfig();
    return config ? config.totalLoansOutstanding : '0';
  }

}

// ============ Orchestrator ============
class DeployerOrchestrator {
  private stateManager: StateManager;
  private binaryManager: BinaryManager;
  private solanaDeployer: SolanaCliDeployer;
  private graphqlMonitor: GraphQLMonitor;
  private connection: Connection;
  private program: Program<Idl>;
  private deployerWallet: Wallet;
  private expiredLoanInterval: NodeJS.Timeout | null = null;

  constructor(
    connection: Connection,
    stateManager: StateManager,
    binaryManager: BinaryManager,
    solanaDeployer: SolanaCliDeployer,
    graphqlMonitor: GraphQLMonitor,
    program: Program<Idl>,
    deployerWallet: Wallet
  ) {
    this.connection = connection;
    this.stateManager = stateManager;
    this.binaryManager = binaryManager;
    this.solanaDeployer = solanaDeployer;
    this.graphqlMonitor = graphqlMonitor;
    this.program = program ;
    this.deployerWallet = deployerWallet;

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.graphqlMonitor.on('loanRequested', async (event) => {
      await this.handleLoanRequested(event);
    });

    this.graphqlMonitor.on('loanRecovered', async (event) => {
      await this.handleLoanRecovered(event);
    });
  }

  private startExpiredLoanChecker(): void {
  const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
  
  setTimeout(() => {
    this.checkExpiredLoans().catch(error => 
      logger.error('Error in initial expired loan check', { error })
    );
  }, 60000);
  
  this.expiredLoanInterval = setInterval(async () => {
    try {
      await this.checkExpiredLoans();
    } catch (error) {
      logger.error('Error in periodic expired loan check', { error });
    }
  }, CHECK_INTERVAL_MS);
  
  logger.info(`Started expired loan checker with interval: ${CHECK_INTERVAL_MS}ms`);
}

  public async checkExpiredLoans(): Promise<void> {
  try {
    logger.info('Checking for expired loans...');
    
    const deployerKeypairData = await fs.readFile(config.deployerKeypairPath, 'utf8');
    const deployerKeypair = Keypair.fromSecretKey(
      new Uint8Array(JSON.parse(deployerKeypairData))
    );
    // Initialize Anchor program
    const idlContent = await fs.readFile(config.idlPath, 'utf8');
    const idl = JSON.parse(idlContent) as Idl;
    
    const opts: ConfirmOptions = {
      preflightCommitment: 'confirmed',
      commitment: 'confirmed',
    };
    
    const deployerWallet = new Wallet(deployerKeypair);
    const provider = new AnchorProvider(this.connection, deployerWallet, opts);

    const program = new Program(idl, provider) as Program<Solignition>;
    

    const loans = await program.account.loan.all();
    logger.info(`Found ${loans.length} total loans to check`);
    
    const currentTimestamp = Math.floor(Date.now() / 1000); 
    let expiredCount = 0;
    let processedCount = 0;
    
    for (const loanAccountInfo of loans) {
      try {
        const loan = loanAccountInfo.account as unknown as LoanAccount;
        const loanId = loan.loanId.toString();
        const startTime = loan.startTs.toNumber();
        const duration = loan.duration.toNumber();
        const expirationTime = startTime + duration;
        const reclaimed = loan.reclaimedAmount.toNumber();
        

        const stateKey = Object.keys(loan.state ?? {})[0] ?? 'unknown';
        const isActiveOrPending = ['active', 'pending'].includes(stateKey);
        const isRecovered = ['recovered'].includes(stateKey);
        logger.info(`loan is ${stateKey}`);
        logger.info(`reclaim is ${reclaimed}`);


        
         //logger.info('loan object ', loan);
      if(reclaimed == 0 || !isRecovered){ //when 0 returnSol has not been called yet
        if (isActiveOrPending) {//currentTimestamp > expirationTime && loan.state === 0 TODO(status === 'Active' || status === 'Pending')
          
          logger.info('Found expired loan', {
            loanId,
            borrower: loan.borrower.toString(),
            startTime: new Date(startTime * 1000).toISOString(),
            expirationTime: new Date(expirationTime * 1000).toISOString(),
            currentTime: new Date(currentTimestamp * 1000).toISOString(),
            hoursOverdue: ((currentTimestamp - expirationTime) / 3600).toFixed(2),
          });
          
          const deployment = await this.stateManager.getDeployment(loanId);
          
          if (deployment && deployment.status === 'deployed') {
           
            logger.info('Processing full recovery for expired loan', { loanId });
            try {
              await this.executeCompleteRecovery(loanId, loan, loanAccountInfo.publicKey);
               expiredCount++;
               processedCount++;
            } catch (error) {
              logger.error('Error during complete recovery for expired loan ', error);
            }
            // Execute the complete recovery flow
            
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else  {
            logger.warn('No deployed program found for expired loan', {
              loanId,
              deploymentStatus: deployment?.status || 'not found',
            });
          }
          
        }
      }
      } catch (error) {
        logger.error('Error processing loan', {
          publicKey: loanAccountInfo.publicKey.toString(),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    logger.info('Expired loans check completed', {
      totalLoans: loans.length,
      expiredLoans: expiredCount,
      processedRecoveries: processedCount,
    });
    
    metrics.activeLoans.set(loans.filter(l => (l.account as any).state === 0).length);
    
  } catch (error) {
    logger.error('Failed to check expired loans', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

// New method: Complete recovery flow with all three steps
private async executeCompleteRecovery(
  loanId: string, 
  loan: LoanAccount, 
  loanPubkey: PublicKey
): Promise<void> {
  try {
    logger.info('Starting complete recovery flow for loan', { loanId });
    const stateKey = Object.keys(loan.state ?? {})[0] ?? 'unknown';
    const isActiveOrPending = ['active', 'pending'].includes(stateKey);
    const isActive =  ['active'].includes(stateKey);

    // Step 1: Call recoverLoan to mark the loan as recovered
    if(isActiveOrPending){
    await this.callRecoverLoan(loanId, loan, loanPubkey);
    }
    
    // Step 2: Close the deployed program
    const deployment = await this.stateManager.getDeployment(loanId);
    if (deployment && deployment.programId && loan.deployedProgram) {
      if(isActive && deployment.status != 'recovered'){//only close active loans that have expired
      await this.closeDeployedProgram(loanId, new PublicKey(deployment.programId));
      }
      // Step 3: Return reclaimed SOL to vault
      // Get the balance that was recovered from closing the program
      //const reclaimedAmount = await this.getReclaimedAmount(deployment.programId);
      //const returnSig = await this.callReturnReclaimedSol(loanId, loan, loanPubkey, loan.principal);
    }

    // just return sol if there is no deployed program
    if(loan.reclaimedAmount.toNumber() == 0 ){
      const returnSig = await this.callReturnReclaimedSol(loanId, loan, loanPubkey, loan.principal);
    }
    
    // Update deployment status in database
    await this.stateManager.saveDeployment(deployment);
    
    logger.info('Complete recovery flow finished successfully', { loanId });
  } catch (error) {
    logger.error('Failed to execute complete recovery', {
      loanId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// New method: Call the recoverLoan instruction
private async callRecoverLoan(
  loanId: string,
  loan: LoanAccount,
  loanPubkey: PublicKey
): Promise<string> {
  try {
    logger.info('Calling recoverLoan instruction', { loanId });
    
    // Get required accounts
    const protocolConfigPubkey = PublicKey.findProgramAddressSync(
      [PROTOCOL_CONFIG_SEED],
      this.program.programId
    )[0];
    
    const adminPdaPubkey = PublicKey.findProgramAddressSync(
      [Buffer.from('admin')],
      this.program.programId
    )[0];
    
    const eventAuthority = PublicKey.findProgramAddressSync(
      [AUTHORITY_SEED],
      this.program.programId
    )[0];

    const loanIdBn = new anchor.BN(loanId);
      const [loanPda] = PublicKey.findProgramAddressSync(
        [LOAN_SEED, loanIdBn.toArrayLike(Buffer, 'le', 8), loan.borrower.toBuffer()],
        this.program.programId
      );

    const deployerKeypairData = await fs.readFile(config.deployerKeypairPath, 'utf8');
    const deployerKeypair = Keypair.fromSecretKey(
      new Uint8Array(JSON.parse(deployerKeypairData))
    );
    // Initialize Anchor program
    const idlContent = await fs.readFile(config.idlPath, 'utf8');
    const idl = JSON.parse(idlContent) as Idl;
    
    const opts: ConfirmOptions = {
      preflightCommitment: 'confirmed',
      commitment: 'confirmed',
    };
    
    const deployerWallet = new Wallet(deployerKeypair);
    const provider = new AnchorProvider(this.connection, deployerWallet, opts);

    const program = new Program(idl, provider) as Program<Solignition>;
    
    // Get treasury from protocol config
    const protocolConfig = await program.account.protocolConfig.fetch(protocolConfigPubkey);
    const treasuryPubkey = protocolConfig.treasury;
    
    // Build and send transaction
    const tx = await this.program.methods
      .recoverLoan()
      .accounts({
        admin: this.deployerWallet.publicKey, // Assuming admin is the deployer wallet
        protocolConfig: protocolConfigPubkey,
        loan: loanPda,
        deployer: this.deployerWallet.publicKey,
        adminPda: adminPdaPubkey,
        treasury: treasuryPubkey,
        systemProgram: SystemProgram.programId,
        //eventAuthority: eventAuthority,
        program: this.program.programId,
      })
      .signers([this.deployerWallet.payer])
      .rpc();
    
    logger.info('recoverLoan transaction confirmed', { 
      loanId, 
      tx,
      loanState: 'recovered'
    });
    return tx;
    
  } catch (error) {
    logger.error('Failed to call recoverLoan', {
      loanId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// New method: Close the deployed program account
private async closeDeployedProgram(
  loanId: string,
  programPubkey: PublicKey
): Promise<void> {
  try {
    logger.info('Closing deployed program', { loanId, programPubkey: programPubkey.toString() });
    
    // This is your existing processRecovery logic
    // Close the program buffer and recover rent
    await this.processRecovery(loanId);
    
    logger.info('Deployed program closed successfully', { loanId });
  } catch (error) {
    logger.error('Failed to close deployed program', {
      loanId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
//TODO needs to be change
// New method: Get the amount of SOL reclaimed from closing the program d
private async getReclaimedAmount(programPubkey: string): Promise<number> {
  try {
    // Check the deployer PDA balance before and after, or
    // track the amount from the close transaction
    // This depends on your specific implementation
    
    // For now, we'll get the minimum balance for a program account
    // Typically around 1-3 SOL depending on program size
    const ESTIMATED_PROGRAM_RENT = 2 * anchor.web3.LAMPORTS_PER_SOL;
    return ESTIMATED_PROGRAM_RENT;
    
  } catch (error) {
    logger.error('Failed to get reclaimed amount', {
      programPubkey,
      error: error instanceof Error ? error.message : String(error),
    });
    // Return a default amount if we can't determine exact amount
    return 2 * anchor.web3.LAMPORTS_PER_SOL;
  }
}

// New method: Call the returnReclaimedSol instruction
private async callReturnReclaimedSol(
  loanId: string,
  loan: LoanAccount,
  loanPubkey: PublicKey,
  amount: number
): Promise<string> {
  try {
    logger.info('Calling returnReclaimedSol instruction', { 
      loanId,
      amount: amount / anchor.web3.LAMPORTS_PER_SOL + ' SOL'
    });
    
    // Get required accounts
    const protocolConfigPubkey = PublicKey.findProgramAddressSync(
      [PROTOCOL_CONFIG_SEED],
      this.program.programId
    )[0];
    
    const vaultPubkey = PublicKey.findProgramAddressSync(
      [VAULT_SEED],
      this.program.programId
    )[0];
    
    const eventAuthority = PublicKey.findProgramAddressSync(
      [AUTHORITY_SEED],
      this.program.programId
    )[0];
    
    // Get the deployer PDA (this should be where the reclaimed SOL is)
    // You may need to adjust this based on your specific deployer PDA setup
    const deployerPdaPubkey = PublicKey.findProgramAddressSync(
      [Buffer.from('deployer'), new anchor.BN(loanId).toArrayLike(Buffer, 'le', 8)],
      this.program.programId
    )[0];
    
    // Build and send transaction
    const tx = await this.program.methods
      .returnReclaimedSol(new anchor.BN(amount))
      .accounts({
        caller: this.deployerWallet.publicKey,
        protocolConfig: protocolConfigPubkey,
        loan: loanPubkey,
        vault: vaultPubkey,
        deployer: this.deployerWallet.publicKey,
        systemProgram: SystemProgram.programId,
        //eventAuthority: eventAuthority,
        program: this.program.programId,
      })
      .signers([this.deployerWallet.payer])
      .rpc();
    
    logger.info('returnReclaimedSol transaction confirmed', { 
      loanId, 
      tx,
      amountReturned: amount / anchor.web3.LAMPORTS_PER_SOL + ' SOL'
    });
    return tx;
    
  } catch (error) {
    logger.error('Failed to call returnReclaimedSol', {
      loanId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

  private async handleLoanRequested(event: any): Promise<void> {
    const { loanId, borrower, principal } = event;

    logger.info('Processing loan requested event', { loanId, borrower, principal });

    // Check if we have a file upload for this borrower
    const fileUpload = await this.stateManager.getFileUploadByBorrower(borrower);
    if (!fileUpload) {
      logger.error('No file upload found for borrower', { borrower });
      return;
    }

    let deployment = await this.stateManager.getDeployment(loanId);
    if (deployment && deployment.status !== 'failed') {
      logger.info(`Loan ${loanId} already being processed`, { status: deployment.status });
      return;
    }

    deployment = {
      loanId,
      borrower,
      principal,
      binaryPath: fileUpload.filePath,
      binaryHash: fileUpload.binaryHash,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await this.stateManager.saveDeployment(deployment);

    // Update file upload status
    fileUpload.status = 'deployed';
    await this.stateManager.saveFileUpload(fileUpload);

    await this.processDeploymentWithRetries(deployment);
  }


  public async processDeploymentWithRetries(deployment: DeploymentRecord): Promise<void> {
    let attempts = 0;

    while (attempts < config.maxRetries) {
     if(deployment.status != 'deployed'){
      try {
        await this.processDeployment(deployment);
        return;
      } catch (error) {
        attempts++;
        logger.error(`Deployment attempt ${attempts} failed`, {
          loanId: deployment.loanId,
          error,
        });

        if (attempts >= config.maxRetries) {
          deployment.status = 'failed';
          deployment.error = String(error);
          await this.stateManager.saveDeployment(deployment);
          metrics.deploymentsTotal.inc({ status: 'failed' });
          return;
        }

        await new Promise(resolve => 
          setTimeout(resolve, config.retryDelayMs * Math.pow(2, attempts - 1))
        );
      }
     }
    }
  }

  // Add a new public method to trigger deployment from API
  public async triggerDeployment(loanId: string, borrower: string): Promise<void> {
    logger.info('Triggering deployment via API', { loanId, borrower });

    // Check if we have a file upload for this borrower
    const fileUpload = await this.stateManager.getFileUploadByBorrower(borrower);
    if (!fileUpload) {
      throw new Error('No file upload found for borrower');
    }

    let deployment = await this.stateManager.getDeployment(loanId);
    if (deployment && deployment.status !== 'failed') {
      logger.info(`Loan ${loanId} already being processed`, { status: deployment.status });
      return;
    }

    deployment = {
      loanId,
      borrower,
      principal: '0',
      binaryPath: fileUpload.filePath,
      binaryHash: fileUpload.binaryHash,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    await this.stateManager.saveDeployment(deployment);

    // Update file upload status
    fileUpload.status = 'deployed';
    await this.stateManager.saveFileUpload(fileUpload);

    await this.processDeploymentWithRetries(deployment);
  }

  private async processDeployment(deployment: DeploymentRecord): Promise<void> {
    const { loanId, binaryPath ,borrower } = deployment;

    if (!binaryPath) {
      throw new Error('No binary path specified for deployment');
    }

    deployment.status = 'deploying';
    deployment.updatedAt = Date.now();
    await this.stateManager.saveDeployment(deployment);

    // Deploy using Solana CLI
    const { programId, signature } = await this.solanaDeployer.deployProgram(binaryPath);

    deployment.programId = programId;
    deployment.deployTxSignature = signature;
    
    deployment.status = 'deployed';
    deployment.updatedAt = Date.now();
    await this.stateManager.saveDeployment(deployment);

    logger.info('Deployment completed successfully', {
      loanId,
      programId,
    });
// Update the on-chain loan with deployed program
    logger.info('trying to set deployed program in contract', {loanId, programId, borrower });

    let setTx = null;
    try {
      setTx = await this.setDeployedProgram(loanId, new PublicKey(programId), new PublicKey(borrower));
      
    } catch (error) {
      logger.info('failed to set deployed program in contract', {loanId, programId, borrower });
    }
  
  }

  public async transferDeployedProgramAuth(loanId: string | number, borrower: PublicKey): Promise<string> {
    try {
      const loanIdBn = new anchor.BN(loanId.toString());

      logger.info('Starting auth transfer', {
      loanId,
      loanIdBn: loanIdBn.toString(),
      borrower: borrower.toString()
    });

      const [configPda] = PublicKey.findProgramAddressSync(
        [PROTOCOL_CONFIG_SEED],
        this.program.programId
      );
      const [loanPda] = PublicKey.findProgramAddressSync(
        [LOAN_SEED, loanIdBn.toArrayLike(Buffer, 'le', 8), borrower.toBuffer()],
        this.program.programId
      );

      const deployment = await this.stateManager.getDeployment(loanId.toString());
      if (!deployment) {
      logger.info(`Loan ${loanId} not in deployed state`, { status: deployment?.status });
      return;
      }

      // Fetch the loan account to get the deployed program pubkey
      //const loanAccount = await this.connection.getAccountInfo(loanPda, 'confirmed');
      //logger.info(`loan Account: {} `,loanAccount);
    
      //if (!loanAccount || loanAccount.programPubkey.equals(PublicKey.default)) {
        //throw new Error(`No program deployed for loan ${loanId}`);
      //}
      const BPF_UPGRADEABLE_LOADER = new PublicKey(
      "BPFLoaderUpgradeab1e11111111111111111111111"
      );
      
      
      const [programData] = PublicKey.findProgramAddressSync([new PublicKey(deployment.programId).toBuffer()], BPF_UPGRADEABLE_LOADER);

       logger.info("\n🔑 Authority Transfer Details:");
       logger.info("Deployed Program:", deployment.programId.toString());
       logger.info("Program Data:", programData.toString());
       logger.info("Current Authority (Deployer):", this.deployerWallet.publicKey.toString());
       logger.info("New Authority (Borrower):", borrower.toString());

      const tx = await this.program.methods
        .transferAuthorityToBorrower(loanIdBn)
        .accountsPartial({
          deployer: this.deployerWallet.publicKey,
          protocolConfig: configPda,
          loan: loanPda,
          borrower,
          programData,
          bpfUpgradeableLoader: BPF_UPGRADEABLE_LOADER,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([this.deployerWallet.payer])
        .rpc();

      logger.info('transfer program auth from deployer ', { loanId, borrower , tx });
      return tx;
    } catch (error) {
      logger.error('Failed to transfer program auth from deployer', { loanId, error });
      throw error;
    }
  }

  private async setDeployedProgram(loanId: string, programPubkey: PublicKey, borrower: PublicKey): Promise<string> {
    try {
      const loanIdBn = new anchor.BN(loanId);
      const [configPda] = PublicKey.findProgramAddressSync(
        [PROTOCOL_CONFIG_SEED],
        this.program.programId
      );
      const [loanPda] = PublicKey.findProgramAddressSync(
        [LOAN_SEED, loanIdBn.toArrayLike(Buffer, 'le', 8), borrower.toBuffer()],
        this.program.programId
      );

      const tx = await this.program.methods
        .setDeployedProgram(loanIdBn, programPubkey)
        .accounts({
          admin: this.deployerWallet.publicKey,
          protocolConfig: configPda,
          loan: loanPda,
        })
        .signers([this.deployerWallet.payer])
        .rpc();

      logger.info('Set deployed program', { loanId, programPubkey: programPubkey.toBase58(), tx });
      return tx;
    } catch (error) {
      logger.error('Failed to set deployed program', { loanId, error });
      throw error;
    }
  }

  private async handleLoanRecovered(event: any): Promise<void> {
    const { loanId } = event;
    await this.processRecovery(loanId);
  }

  public async processRecovery(loanId: string): Promise<void> {
    logger.info('Processing loan recovery', { loanId });

    const deployment = await this.stateManager.getDeployment(loanId);
    if (!deployment || deployment.status !== 'deployed') {
      logger.info(`Loan ${loanId} not in deployed state`, { status: deployment?.status });
      return;
    }

    try {
      deployment.status = 'recovering';
      deployment.updatedAt = Date.now();
      await this.stateManager.saveDeployment(deployment);

      if (deployment.programId) {
        // Close program using Solana CLI
        const { signature } = await this.solanaDeployer.closeProgram(deployment.programId);

        deployment.recoveryTxSignature = signature;
        deployment.status = 'recovered';
        deployment.updatedAt = Date.now();
        await this.stateManager.saveDeployment(deployment);

        logger.info('Recovery completed successfully', {
          loanId,
          signature,
        });
        metrics.expiredLoansRecovered.inc();
      }
    } catch (error) {
      logger.error('Recovery failed', { loanId, error });
      deployment.status = 'failed';
      deployment.error = String(error);
      await this.stateManager.saveDeployment(deployment);
    }
  }

  async start(): Promise<void> {
    await this.graphqlMonitor.start();
    this.startExpiredLoanChecker();
    logger.info('Deployer orchestrator started');
  }

  async stop(): Promise<void> {
    await this.graphqlMonitor.stop();

    if (this.expiredLoanInterval) {
    clearInterval(this.expiredLoanInterval);
    this.expiredLoanInterval = null;
  }
    logger.info('Deployer orchestrator stopped');
  }
}


// ============ API Server ============
class ApiServer {
  private app: express.Application;
  private stateManager: StateManager;
  private binaryManager: BinaryManager;
  private upload: multer.Multer;
  private orchestrator: DeployerOrchestrator | null = null;

  constructor(stateManager: StateManager, binaryManager: BinaryManager) {
    this.app = express();
    this.stateManager = stateManager;
    this.binaryManager = binaryManager;
    
    // Configure multer for file uploads
    this.upload = multer({
      dest: config.uploadPath,
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      },
      fileFilter: (req, file, cb) => {
        if (path.extname(file.originalname) !== '.so') {
          return cb(new Error('Only .so files are allowed'));
        }
        cb(null, true);
      },
    });

    this.setupMiddleware();
    this.setupRoutes();
  }

  setOrchestrator(orchestrator: DeployerOrchestrator): void {
    this.orchestrator = orchestrator;
    logger.info('Orchestrator reference set in ApiServer');
  }

  private setupMiddleware(): void {
    // Configure CORS - this must be FIRST
    const corsOptions = {
      origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
        // Allow requests with no origin (like mobile apps, curl, postman)
        if (!origin) {
          return callback(null, true);
        }
        
        const allowedOrigins = [
          'http://localhost:5173',
          'http://localhost:5174',
          'http://localhost:3000',
          'http://127.0.0.1:5173',
          process.env.FRONTEND_URL,
        ].filter(Boolean) as string[];
        
        if (allowedOrigins.indexOf(origin) !== -1) {
          callback(null, true);
        } else {
          logger.warn(`CORS request from unauthorized origin: ${origin}`);
          callback(null, true); // Allow anyway for development
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
      exposedHeaders: ['Content-Length', 'Content-Type'],
      maxAge: 86400,
    };
    
    this.app.use(cors(corsOptions));
    
    // Handle preflight requests
    this.app.options('*', cors(corsOptions));
    
    this.app.use(express.json());
    
    logger.info('CORS middleware configured');
    
  }
  
  private setupRoutes(): void {
    // Health check
    this.app.get('/health', async (req, res) => {
      try {
        const deployments = await this.stateManager.getAllDeployments();
        const activeCount = deployments.filter(d => d.status === 'deployed').length;
        
        res.json({
          status: 'healthy',
          activeLoans: activeCount,
          totalDeployments: deployments.length,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        res.status(500).json({ status: 'unhealthy', error: String(error) });
      }
    });

    // Metrics endpoint
    this.app.get('/metrics', async (req, res) => {
      res.set('Content-Type', registry.contentType);
      res.end(await registry.metrics());
    });

    this.app.post('/check-expired-loans', async (req, res) => {
  try {
    if (!this.orchestrator) {
      return res.status(500).json({ error: 'Orchestrator not initialized' });
    }
    
    logger.info('Manual expired loan check triggered via API');
    
    // Run the check asynchronously
    this.orchestrator.checkExpiredLoans()
      .then(() => logger.info('Manual expired loan check completed'))
      .catch(error => logger.error('Manual expired loan check failed', { error }));
    
    res.json({
      success: true,
      message: 'Expired loan check initiated with full recovery flow',
    });
  } catch (error) {
    logger.error('Error triggering expired loan check', { error });
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    });
  }
    });

    this.app.post('/notify-repaid', async (req, res) => {
      try {
        const { signature, borrower, loanId } = req.body;
        
        if (!loanId || !borrower) {
          logger.warn('Notify loan request missing required fields', { signature, borrower });
          return res.status(400).json({ 
            error: 'Transaction signature and borrower address required' 
          });
        }

        logger.info('Received repaid notification', { 
          signature, 
          borrower, 
          loanId: loanId || 'unknown'
        });

        let tx;
        // Give the transaction a moment to be confirmed
       setTimeout(async () => {
          try {
          //  const connection = new Connection(config.rpcUrl, 'confirmed');
          if (!this.orchestrator) {
          logger.error('No orchestrator reference available');
          return;
          }
          
          // Trigger transfer through orchestrator
          const borrowerPubkey = new PublicKey(borrower);
          tx = await (this.orchestrator as any).transferDeployedProgramAuth(loanId, borrowerPubkey);
           logger.info('Auth transfer completed', { loanId, borrower, tx });

          // Respond after transaction
          res.json({
            success: true,
            message: 'Auth transfer completed',
            tx,
            loanId,
            auth: borrower,
          });

          } catch (error) {
            logger.error('Error transferring program auth', { 
             borrower,
             loanId,
             errorMessage: error instanceof Error ? error.message : String(error),
             errorStack: error instanceof Error ? error.stack : undefined,
             errorName: error instanceof Error ? error.name : undefined
            });
          }
        }, 2000); // Wait 2 seconds for confirmation

      } catch (error) {
        logger.error('Error handling repaid notification', { 
            errorMessage: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined
         });
            res.status(500).json({ 
            error: error instanceof Error ? error.message : 'Internal server error' 
            });
      }
    });

    // Notify about new loan request - called by frontend after transaction
    this.app.post('/notify-loan', async (req, res) => {
      try {
        const { signature, borrower, loanId } = req.body;
        
        if (!signature || !borrower) {
          logger.warn('Notify loan request missing required fields', { signature, borrower });
          return res.status(400).json({ 
            error: 'Transaction signature and borrower address required' 
          });
        }

        logger.info('Received loan notification', { 
          signature, 
          borrower, 
          loanId: loanId || 'unknown'
        });

        // Check if we have a file upload for this borrower
        const fileUpload = await this.stateManager.getFileUploadByBorrower(borrower);
        if (!fileUpload) {
          logger.error('No file upload found for borrower', { borrower, signature });
          return res.status(404).json({ 
            error: 'No file upload found for this borrower. Please upload a file first.' 
          });
        }

        /* Check if this loan is already being processed
        if (loanId) {
          const existingDeployment = await this.stateManager.getDeployment(loanId);
          if (existingDeployment && existingDeployment.status !== 'failed') {
            logger.info('Loan already being processed', { loanId, status: existingDeployment.status });
            return res.json({
              success: true,
              message: 'Loan already being processed',
              status: existingDeployment.status,
              loanId,
            });
          }
        }*/

        // Respond immediately - we'll process in background
        res.json({
          success: true,
          message: 'Loan notification received. Deployment will begin shortly.',
          signature,
          fileId: fileUpload.fileId,
        });

        // Process the loan asynchronously
        // Give the transaction a moment to be confirmed
        setTimeout(async () => {
          try {
            await this.processLoanFromSignature(signature, borrower, fileUpload, loanId);
          } catch (error) {
            logger.error('Error processing loan from signature', { 
              signature, 
              borrower, 
              error 
            });
          }
        }, 2000); // Wait 2 seconds for confirmation

      } catch (error) {
        logger.error('Error handling loan notification', { error });
        res.status(500).json({ 
          error: error instanceof Error ? error.message : 'Internal server error' 
        });
      }
    });

    // Upload .so file and calculate deployment cost
    this.app.post('/upload', this.upload.single('file'), async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'No file uploaded' });
        }

        const { borrower } = req.body;
        if (!borrower) {
          return res.status(400).json({ error: 'Borrower address required' });
        }

        logger.info('File uploaded', {
          fileName: req.file.originalname,
          size: req.file.size,
          borrower,
        });

        // Validate the binary
        const binaryData = await fs.readFile(req.file.path);
        const validation = await this.binaryManager.validateBinary(binaryData);
        
        if (!validation.valid) {
          await fs.unlink(req.file.path);
          return res.status(400).json({ 
            error: `Invalid binary: ${validation.reason}` 
          });
        }

        // Generate file ID and store binary
        const fileId = createHash('sha256')
          .update(borrower + Date.now())
          .digest('hex')
          .substring(0, 16);

        const { hash, destinationPath } = await this.binaryManager.storeBinary(
          fileId, 
          req.file.path
        );

        // Estimate deployment cost
        const estimatedCost = await  this.binaryManager.estimateDeploymentCost(destinationPath);

        // Save file upload record
        const fileUpload: FileUploadRecord = {
          fileId,
          borrower,
          fileName: req.file.originalname,
          filePath: destinationPath,
          fileSize: req.file.size,
          binaryHash: hash,
          estimatedCost,
          status: 'ready',
          createdAt: Date.now(),
        };

        await this.stateManager.saveFileUpload(fileUpload);

        // Clean up temp file
        await fs.unlink(req.file.path);

        metrics.fileUploads.inc();

        res.json({
          success: true,
          fileId,
          estimatedCost,
          binaryHash: hash,
          message: 'File uploaded successfully. You can now request a loan for deployment.',
        });
      } catch (error) {
        logger.error('Error handling file upload', { error });
        if (req.file) {
          await fs.unlink(req.file.path).catch(() => {});
        }
        res.status(500).json({ error: String(error) });
      }
    });

    // Get deployment status
    this.app.get('/deployments/:loanId', async (req, res) => {
      try {
        const deployment = await this.stateManager.getDeployment(req.params.loanId);
        if (!deployment) {
          return res.status(404).json({ error: 'Deployment not found' });
        }
        res.json(deployment);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Get all deployments for a borrower
    this.app.get('/deployments/borrower/:borrower', async (req, res) => {
      try {
        const allDeployments = await this.stateManager.getAllDeployments();
        const borrowerDeployments = allDeployments.filter(
          d => d.borrower === req.params.borrower
        );
        res.json(borrowerDeployments);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Get file upload status
    this.app.get('/uploads/:fileId', async (req, res) => {
      try {
        const upload = await this.stateManager.getFileUpload(req.params.fileId);
        if (!upload) {
          return res.status(404).json({ error: 'Upload not found' });
        }
        res.json(upload);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Get all uploads for a borrower
this.app.get('/uploads/borrower/:borrower', async (req, res) => {
  try {
    const uploads = await this.stateManager.getAllFileUploadsByBorrower(req.params.borrower);
    
    // Sort by creation date (newest first)
    const sortedUploads = uploads.sort((a, b) => b.createdAt - a.createdAt);
    
    res.json(sortedUploads);
  } catch (error) {
    logger.error('Error fetching uploads for borrower', { 
      borrower: req.params.borrower, 
      error 
    });
    res.status(500).json({ error: String(error) });
  }
});

// Optional: Add pagination support
this.app.get('/uploads/borrower/:borrower/paginated', async (req, res) => {
  try {
    const { limit = '10', offset = '0', status } = req.query;
    
    let uploads = await this.stateManager.getAllFileUploadsByBorrower(req.params.borrower);
    
    // Filter by status if provided
    if (status && ['pending', 'ready', 'deployed'].includes(status as string)) {
      uploads = uploads.filter(u => u.status === status);
    }
    
    // Sort by newest first
    uploads.sort((a, b) => b.createdAt - a.createdAt);
    
    // Paginate
    const paginatedUploads = uploads.slice(
      parseInt(offset as string), 
      parseInt(offset as string) + parseInt(limit as string)
    );
    
    res.json({
      uploads: paginatedUploads,
      total: uploads.length,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      hasMore: uploads.length > (parseInt(offset as string) + parseInt(limit as string))
    });
  } catch (error) {
    logger.error('Error fetching paginated uploads', { 
      borrower: req.params.borrower, 
      error 
    });
    res.status(500).json({ error: String(error) });
  }
});

// Optional: Delete an upload 
this.app.delete('/uploads/:fileId', async (req, res) => {
  try {
    const upload = await this.stateManager.getFileUpload(req.params.fileId);
    
    if (!upload) {
      return res.status(404).json({ error: 'Upload not found' });
    }
    
    // Verify the requester owns this upload (you'll need to pass borrower in request)
    const { borrower } = req.body;
    if (!borrower || upload.borrower !== borrower) {
      return res.status(403).json({ error: 'Unauthorized to delete this upload' });
    }
    
    // Only allow deletion if not already deployed
    if (upload.status === 'deployed') {
      return res.status(400).json({ error: 'Cannot delete deployed uploads' });
    }
    
    // Delete the file from disk
    try {
      await fs.unlink(upload.filePath);
    } catch (error) {
      logger.warn('Failed to delete file from disk', { filePath: upload.filePath, error });
    }
    
    // Delete from state TBI
   // await this.stateManager.deleteFileUpload(req.params.fileId);
    
    res.json({ success: true, message: 'Upload deleted successfully' });
  } catch (error) {
    logger.error('Error deleting upload', { fileId: req.params.fileId, error });
    res.status(500).json({ error: String(error) });
  }
   });
  }

  private async processLoanFromSignature(
    signature: string,
    borrower: string,
    fileUpload: FileUploadRecord,
    loanId: string
  ): Promise<void> {
    logger.info('Processing loan from transaction signature', { signature, borrower });

    try {
      // Fetch the transaction to get loan details
      const connection = new Connection(config.rpcUrl, 'confirmed');
      
      // Wait and retry if needed
      let attempts = 0;
      let transaction = null;
      
      while (attempts < 5 && !transaction) {
        try {
          transaction = await connection.getTransaction(signature, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed',
          });
          
          if (!transaction) {
            attempts++;
            logger.info(`Transaction not found yet, attempt ${attempts}/5`, { signature });
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (err) {
          attempts++;
          logger.warn(`Error fetching transaction, attempt ${attempts}/5`, { signature, err });
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      if (!transaction) {
        throw new Error(`Transaction not found after ${attempts} attempts: ${signature}`);
      }

      logger.info('Transaction fetched successfully', { 
        signature,
        slot: transaction.slot,
        transaction,
      });

      // Parse the transaction to extract loan details
      const logs = transaction.meta?.logMessages || [];

      // Step 2: Derive the loan PDA
      const loanIdBn = new anchor.BN(loanId);
      const [loanPda] = PublicKey.findProgramAddressSync(
        [LOAN_SEED, loanIdBn.toArrayLike(Buffer, 'le', 8),new PublicKey(borrower).toBuffer()],
        config.programId
      );
      
      let loanAccount = null;

       try {
          loanAccount = await connection.getAccountInfo(loanPda, 'confirmed');
          
          if (!loanAccount) {
            //attempts++;
            logger.info(`Loan account not found yet, attempt ${attempts}/5`, { loanPda: loanPda.toBase58() });
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (err) {
          //attempts++;
          logger.warn(`Error fetching loan account, attempt ${attempts}/5`, { loanPda: loanPda.toBase58(), err });
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      // Look for loan creation in logs or extract from instruction data
      let nloanId: string | null = null;
       
      /* Try to find in logs first
      for (const log of logs) {
        const match = log.match(/Loan (?:created|requested).*?(?:id|ID).*?(\d+)/i);
        if (match) {
          loanId = match[1];
          logger.info('Found loan ID in logs', { loanId, log });
          break;
        }
      }

      // If not in logs, get it from protocol config account
      if (!loanId) {
        logger.info('Loan ID not found in logs, querying protocol config');
        const [configPda] = PublicKey.findProgramAddressSync(
          [PROTOCOL_CONFIG_SEED],
          config.programId
        );
        
        const configAccount = await connection.getAccountInfo(configPda);
        if (configAccount && configAccount.data.length >= 16) {
          // Read loan_counter (u64) - adjust offset based on your program structure
          // Typically: 8 bytes discriminator + other fields before loan_counter
          // This is a simplified version - adjust the offset as needed
          const loanCounter = configAccount.data.readBigUInt64LE(8); // Adjust offset!
          loanId = (loanCounter - 1n).toString(); // The just-created loan
          logger.info('Derived loan ID from config', { loanId, loanCounter: loanCounter.toString() });
        }
      }

      if (!loanId) {
        // Last resort: use the file upload as a temporary ID
        loanId = `temp_${fileUpload.fileId}`;
        logger.warn('Could not determine loan ID, using temporary ID', { loanId });
      }*/

      logger.info('Processing deployment for loan', { loanId, signature, borrower });

      // Create deployment record
      const deployment: DeploymentRecord = {
        loanId,
        borrower,
        principal: loanAccount.principal,
        binaryPath: fileUpload.filePath,
        binaryHash: fileUpload.binaryHash,
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await this.stateManager.saveDeployment(deployment);

      // Update file upload status
      fileUpload.status = 'deployed';
      await this.stateManager.saveFileUpload(fileUpload);

      // Trigger deployment through orchestrator
      if (this.orchestrator) {
        await (this.orchestrator as any).processDeploymentWithRetries(deployment);
        logger.info('Deployment triggered via orchestrator', { loanId });
      } else {
        logger.error('No orchestrator reference available for deployment');
        throw new Error('Orchestrator not initialized');
      }

    } catch (error) {
      logger.error('Failed to process loan from signature', {
        signature,
        borrower,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      
      // Save error to deployment record if possible
      try {
        const deployments = await this.stateManager.getAllDeployments();
        const deployment = deployments.find(d => d.borrower === borrower && d.status === 'pending');
        if (deployment) {
          deployment.status = 'failed';
          deployment.error = error instanceof Error ? error.message : String(error);
          deployment.updatedAt = Date.now();
          await this.stateManager.saveDeployment(deployment);
        }
      } catch (saveError) {
        logger.error('Failed to save error state', { saveError });
      }
      
      throw error;
    }
  }

  private async processDeploymentDirect(deployment: DeploymentRecord): Promise<void> {
    // This method will be implemented to handle deployment
    // For now, we'll need to refactor to share deployment logic
    logger.info('Direct deployment processing started', { loanId: deployment.loanId });
    
    // We need access to the orchestrator or deployment logic
    // This will be handled by passing a reference to the orchestrator
    // or by making this method call the orchestrator's process method
  }

  start(port: number): void {
    this.app.listen(port, () => {
      logger.info(`API server listening on port ${port}`);
    });
  }
}

// ============ Main Application ============
async function main() {
  logger.info('Starting Solana Lending Protocol Deployer Service', { 
    config: {
      ...config,
      programId: config.programId.toBase58()
    } 
  });

  try {
    // Initialize directories
    await fs.mkdir(config.binaryStoragePath, { recursive: true });
    await fs.mkdir(config.uploadPath, { recursive: true });

    // Initialize connection
    const connection = new Connection(config.rpcUrl, {
      commitment: 'confirmed',
      wsEndpoint: config.wsUrl,
    });

    // Test connection
    logger.info('Testing connection to Solana RPC...');
    const version = await connection.getVersion();
    logger.info('Connected to Solana', { version });

    // Load keypairs
    logger.info('Loading keypairs...');
    const deployerKeypairData = await fs.readFile(config.deployerKeypairPath, 'utf8');
    const deployerKeypair = Keypair.fromSecretKey(
      new Uint8Array(JSON.parse(deployerKeypairData))
    );
    logger.info(`Deployer public key: ${deployerKeypair.publicKey.toBase58()}`);

    // Initialize Anchor program
    const idlContent = await fs.readFile(config.idlPath, 'utf8');
    const idl = JSON.parse(idlContent) as Idl;
    
    const opts: ConfirmOptions = {
      preflightCommitment: 'confirmed',
      commitment: 'confirmed',
    };
    
    const deployerWallet = new Wallet(deployerKeypair);
    const provider = new AnchorProvider(connection, deployerWallet, opts);
    const program = new Program(idl, provider) as Program<Idl>;

    const programT = new Program(idl, provider) as Program<Solignition>;

    const loans =  await programT.account.loan.all();
    logger.info(`Loaded programT: ${config.programId.toBase58()}`, { totalLoans: loans.length });

    // Initialize components
    logger.info('Initializing components...');
    const solanaDeployer = new SolanaCliDeployer(
      connection,
      config.deployerKeypairPath,
      config.cluster
    );
    const stateManager = new StateManager(config.dbPath);
    const binaryManager = new BinaryManager(config.binaryStoragePath, config.uploadPath, solanaDeployer);
    await binaryManager.init();

    

    const graphqlMonitor = new GraphQLMonitor(
      config.graphqlEndpoint,
      stateManager,
      logger
    );

    const orchestrator = new DeployerOrchestrator(
      connection,
      stateManager,
      binaryManager,
      solanaDeployer,
      graphqlMonitor,
      program,
      deployerWallet
    );

    // Start API server
    const apiServer = new ApiServer(stateManager, binaryManager);
    apiServer.setOrchestrator(orchestrator);
    apiServer.start(config.port);

    // Start orchestrator
    await orchestrator.start();

    logger.info('Deployer service started successfully');
    logger.info('API endpoints available:');
    logger.info(`  - POST http://localhost:${config.port}/upload - Upload program file`);
    logger.info(`  - POST http://localhost:${config.port}/notify-loan - Notify about loan request`);
    logger.info(`  - GET http://localhost:${config.port}/health - Health check`);
    logger.info(`  - GET http://localhost:${config.port}/metrics - Prometheus metrics`);

    // Test GraphQL connection
    try {
      const protocolConfig = await graphqlMonitor.getProtocolConfig();
      logger.info('GraphQL connection successful', { protocolConfig });
    } catch (error) {
      logger.warn('Could not fetch protocol config from GraphQL', { error });
    }

    // Handle graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');
      await orchestrator.stop();
      await stateManager.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (error) {
    logger.error('Failed to start deployer service', {
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    process.exit(1);
  }
}

// Start the application
if (require.main === module) {
  main().catch(error => {
    logger.error('Unhandled error', { error });
    process.exit(1);
  });
}

export {
  DeployerOrchestrator,
  SolanaCliDeployer,
  GraphQLMonitor,
  StateManager,
  BinaryManager,
  ApiServer,
};