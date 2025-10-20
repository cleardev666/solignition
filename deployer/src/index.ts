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

interface LoanData {
  loanId: string;
  borrower: string;
  principal: string;
  deployedProgram?: string;
  state: number;
  startTs: number;
  duration: number;
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

  constructor(storagePath: string, uploadPath: string) {
    this.storagePath = storagePath;
    this.uploadPath = uploadPath;
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
      const stats = await fs.stat(binaryPath);
      const fileSize = stats.size;
      
      // Base cost for creating program account
      // Approximately 1 lamport per byte + rent exemption
      const rentExemptionBase = 0.01; // Base rent exemption in SOL
      const byteCost = fileSize * 0.00000348; // Cost per byte in SOL
      const transactionFees = 0.001; // Estimated transaction fees
      
      // Add buffer for compute units and other costs
      const totalCost = rentExemptionBase + byteCost + transactionFees;
      
      // Round up to 4 decimal places
      return Math.ceil(totalCost * 10000) / 10000;
    } catch (error) {
      logger.error('Error estimating deployment cost', { error });
      throw error;
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
    this.program = program;
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
    const { loanId, binaryPath } = deployment;

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

    // Update the on-chain loan with deployed program
    const setTx = await this.setDeployedProgram(loanId, new PublicKey(programId));
    deployment.setDeployedTxSignature = setTx;

    deployment.status = 'deployed';
    deployment.updatedAt = Date.now();
    await this.stateManager.saveDeployment(deployment);

    logger.info('Deployment completed successfully', {
      loanId,
      programId,
    });
  }

  private async setDeployedProgram(loanId: string, programPubkey: PublicKey): Promise<string> {
    try {
      const loanIdBn = new anchor.BN(loanId);
      const [configPda] = PublicKey.findProgramAddressSync(
        [PROTOCOL_CONFIG_SEED],
        this.program.programId
      );
      const [loanPda] = PublicKey.findProgramAddressSync(
        [LOAN_SEED, loanIdBn.toArrayLike(Buffer, 'le', 8)],
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

  private async processRecovery(loanId: string): Promise<void> {
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
    logger.info('Deployer orchestrator started');
  }

  async stop(): Promise<void> {
    await this.graphqlMonitor.stop();
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
        fileSize: 100 * 1024 * 1024, // 100MB limit
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
  /* 
  private setupMiddleware(): void {
    // Configure CORS to allow requests from your frontend
    this.app.use(cors({
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      credentials: true,
    }));
    this.app.use(express.json());
  }
*/
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

        // Check if this loan is already being processed
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
        }

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
            await this.processLoanFromSignature(signature, borrower, fileUpload);
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
        const estimatedCost = await this.binaryManager.estimateDeploymentCost(destinationPath);

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
  }

  private async processLoanFromSignature(
    signature: string,
    borrower: string,
    fileUpload: FileUploadRecord
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
      });

      // Parse the transaction to extract loan details
      const logs = transaction.meta?.logMessages || [];
      
      // Look for loan creation in logs or extract from instruction data
      let loanId: string | null = null;
       
      /* Try to find in logs first
      for (const log of logs) {
        const match = log.match(/Loan (?:created|requested).*?(?:id|ID).*?(\d+)/i);
        if (match) {
          loanId = match[1];
          logger.info('Found loan ID in logs', { loanId, log });
          break;
        }
      }*/

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
      }

      logger.info('Processing deployment for loan', { loanId, signature, borrower });

      // Create deployment record
      const deployment: DeploymentRecord = {
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
    const program = new Program(idl, provider);

    // Initialize components
    logger.info('Initializing components...');
    const stateManager = new StateManager(config.dbPath);
    const binaryManager = new BinaryManager(config.binaryStoragePath, config.uploadPath);
    await binaryManager.init();

    const solanaDeployer = new SolanaCliDeployer(
      connection,
      config.deployerKeypairPath,
      config.cluster
    );

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