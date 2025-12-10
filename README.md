# ChainHeatWatch

ChainHeatWatch is a privacy-preserving decentralized application built with FHEVM technology that enables users to log their daily perceived temperature on the blockchain.

## Features

- 🔐 **Encrypted Storage**: All temperature data is encrypted before being stored on-chain
- 🔓 **Local Decryption**: Only you can decrypt your personal data, and it happens locally in your browser
- 🌍 **Anonymous Aggregation**: Global statistics are computed on encrypted data without revealing individual values
- 🚀 **Fully Decentralized**: Operating entirely without a backend

## Project Structure

```
.
├── contracts/          # Smart contracts (Solidity + Hardhat)
├── frontend/          # Next.js frontend application
└── TESTING_GUIDE.md  # Testing and development guide
```

## Getting Started

### Prerequisites

- Node.js >= 20
- npm >= 7.0.0
- MetaMask browser extension

### Installation

1. Clone the repository
2. Install dependencies for contracts:
   ```bash
   cd contracts
   npm install
   ```

3. Install dependencies for frontend:
   ```bash
   cd frontend
   npm install
   ```

### Development

See `TESTING_GUIDE.md` for detailed development and testing instructions.

## License

MIT
