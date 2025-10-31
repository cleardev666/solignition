# Solignition

A decentralized lending protocol on Solana that provides liquidity for Solana program deployments. Depositors earn yield while borrowers access SOL to deploy their programs to the network.

## Overview

Solignition connects liquidity providers with developers who need SOL for program deployment. The protocol:

- **Enables Deposits**: Users deposit SOL into a shared liquidity pool and earn yield over time
- **Facilitates Program Deployment Loans**: Borrowers request loans to cover the cost of deploying Solana programs
- **Automates Deployments**: Includes a deployer service that handles program deployment when loans are approved
- **Distributes Yield**: Interest from loans is distributed proportionally to depositors based on their share of the pool
- **Manages Loan Lifecycle**: Tracks loans through their lifecycle (Active → Repaid/Recovered)

## Core Features

### For Liquidity Providers (Depositors)
- **Deposit SOL**: Contribute to the liquidity pool
- **Earn Yield**: Receive proportional share of interest from loans
- **Withdraw Anytime**: Withdraw deposits plus accumulated yield (subject to available liquidity)
- **Track Performance**: Monitor deposits and earnings through the web interface

### For Borrowers
- **Request Loans**: Submit loan requests specifying amount and program to deploy
- **Automated Deployment**: Protocol deploys your program upon loan approval
- **Authority Transfer**: Receive upgrade authority for your deployed program
- **Flexible Repayment**: Repay loans with accrued interest at your convenience

### For Protocol Admins
- **Configure Parameters**: Set interest rates, admin fees, and other protocol parameters
- **Manage Loans**: Recover loans if borrowers fail to repay
- **Protocol Controls**: Pause/unpause protocol in emergencies
- **Fee Collection**: Treasury receives admin fee split from loan interest

## Architecture

### Solana Program (Anchor)
Located in `anchor/programs/solignition/src/lib.rs`, the on-chain program handles:
- Protocol initialization and configuration
- Deposit and withdrawal operations
- Loan request, repayment, and recovery
- Interest calculations (time-based, using basis points)
- Yield distribution to depositors
- Authority management for deployed programs

**Key Accounts:**
- `ProtocolConfig`: Global protocol state and configuration
- `DepositorRecord`: Individual depositor balance and yield tracking
- `Loan`: Loan details including amount, interest rate, timestamps, and state

### Web Interface (React + Vite)
Modern web3 interface built with:
- **Gill SDK**: Simplified Solana wallet integration
- **Codama-Generated Client**: Type-safe TypeScript client from program IDL
- **shadcn/ui + Tailwind**: Professional, accessible UI components
- **Wallet UI Components**: Pre-built wallet connection components

### Deployer Service
Automated deployment service (`deployer/`) that:
- Monitors loan requests
- Deploys programs to Solana when loans are approved
- Manages deployment state and binaries
- Transfers program upgrade authority to borrowers

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- Rust and Anchor CLI (`anchor-cli`)
- Solana CLI tools
- A Solana wallet with devnet SOL

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd solignition

# Install dependencies
npm install
```

### Setup

Generate and sync program ID:

```bash
npm run setup
```

This creates a new program keypair and updates:
- `Anchor.toml` configuration
- Program's `declare_id!` macro
- TypeScript client exports

### Build

Build the Solana program:

```bash
npm run anchor-build
```

Generate the TypeScript client:

```bash
npm run anchor generate
```

### Local Development

Start a local validator with the program deployed:

```bash
npm run anchor-localnet
```

In another terminal, start the web interface:

```bash
npm run dev
```

Visit `http://localhost:5173` to interact with the protocol.

### Testing

Run the Anchor program tests:

```bash
npm run anchor-test
```

The test suite includes comprehensive unit tests for:
- Interest calculations
- Yield distribution
- Loan lifecycle management
- Edge cases and overflow protection

### Deployment

Deploy to Solana Devnet:

```bash
npm run anchor deploy --provider.cluster devnet
```

Update the cluster in the web interface to connect to devnet.

## Project Structure

```
solignition/
├── anchor/                      # Solana program
│   ├── programs/solignition/    # Anchor program source
│   ├── src/                     # TypeScript client and helpers
│   │   ├── client/js/generated/ # Codama-generated client
│   │   └── solignition-exports.ts
│   └── tests/                   # Program tests
├── deployer/                    # Deployment automation service
│   ├── src/                     # Deployer source code
│   └── binaries/                # Cached program binaries
├── src/                         # Web interface
│   ├── components/              # React components
│   │   ├── solana/              # Wallet and provider components
│   │   └── ui/                  # shadcn/ui components
│   └── features/                # Feature-specific components
│       ├── protocol/            # Protocol interaction UI
│       └── account/             # Account management
└── clients/js/                  # main client used
```

## Key Concepts

### Interest Calculation
Interest is calculated using a time-based formula:
```
interest = (principal × rate_bps × elapsed_seconds) / (10,000 × SECONDS_PER_YEAR)
```
- Rates are in basis points (bps): 100 bps = 1%
- Time-based accrual: Interest accumulates proportionally to loan duration

### Yield Distribution
When loans are repaid:
1. Admin fee is deducted (configured in protocol)
2. Remaining yield is distributed proportionally to all depositors
3. Each depositor's share = (their deposit / total deposits) × yield

### Loan States
- **Active**: Loan is outstanding, interest is accruing
- **Repaid**: Borrower has fully repaid the loan with interest
- **Recovered**: Admin has recovered the loan (borrower failed to repay)

## Configuration

Protocol parameters (set during initialization or via `update_config`):
- `default_interest_rate_bps`: Base interest rate for loans
- `default_admin_fee_bps`: Percentage of interest allocated to protocol treasury
- `admin_fee_split_bps`: Split between admin and deployer service
- Pause functionality for emergency stops

## Security Considerations

⚠️ **This is experimental software. Use at your own risk.**

- Protocol admin has privileged access (recovery, configuration)
- Loans are not collateralized - borrowers can default
- No slashing mechanism for failed deployments
- Audit recommended before mainnet deployment

## Development Tools

This project uses:
- **Anchor 0.30+**: Solana program framework
- **Codama**: IDL-to-client code generation
- **Gill SDK**: Modern Solana web3 library
- **TypeScript**: Type-safe client development
- **Vitest**: Fast unit testing

## License
#
#
#
## Resources

- [Anchor Documentation](https://www.anchor-lang.com/)
- [Solana Documentation](https://docs.solana.com/)
- [Gill SDK](https://gill.site/)
- [Codama](https://github.com/codama-idl/codama)

## Support

- Issues: [GitHub Issues](repo-url/issues)
- Discussions: [GitHub Discussions](repo-url/discussions)
- Discord: [Discord Link]

---
