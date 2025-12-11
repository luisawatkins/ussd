# Quick Start Guide

Get up and running with USSD DeFi on RSK in under 15 minutes.

## Prerequisites

- Node.js v18 or higher
- npm or yarn
- Git

## Step 1: Clone & Install

```bash
# Clone the repository
git clone https://github.com/your-repo/ussd-rsk-defi.git
cd ussd-rsk-defi

# Install root dependencies (smart contracts)
npm install

# Install backend dependencies
cd backend
npm install
cd ..
```

## Step 2: Configure Environment

### Smart Contracts

Create a `.env` file in the project root:

```env
# Get test RBTC from https://faucet.rsk.co
DEPLOYER_PRIVATE_KEY=your_private_key_here
RSK_TESTNET_RPC=https://public-node.testnet.rsk.co
```

### Backend Server

Copy the example config:

```bash
cd backend
cp env.example.txt .env
```

Edit `.env` with your settings.

## Step 3: Deploy Contracts

### Local Development

```bash
# Terminal 1: Start local Hardhat node
npm run node

# Terminal 2: Deploy contracts
npm run deploy:local
```

### RSK Testnet

```bash
# Get test RBTC first from https://faucet.rsk.co
npm run deploy:testnet
```

Save the deployed contract addresses - you'll need them for the backend.

## Step 4: Configure Backend

Update `backend/.env` with the deployed contract addresses:

```env
WALLET_REGISTRY_ADDRESS=0x...
P2P_TRANSFER_ADDRESS=0x...
MICRO_LOAN_ADDRESS=0x...
BACKEND_WALLET_PRIVATE_KEY=0x...
```

## Step 5: Start the Server

```bash
cd backend
npm run dev
```

The server will start on `http://localhost:3000`.

## Step 6: Test with Africa's Talking Simulator

1. Sign up at [Africa's Talking](https://africastalking.com)
2. Create a sandbox application
3. Go to **USSD → Launch Simulator**
4. Use ngrok to expose your local server:
   ```bash
   ngrok http 3000
   ```
5. Set the callback URL in Africa's Talking to:
   ```
   https://your-ngrok-url.ngrok.io/ussd
   ```
6. Dial your test service code in the simulator

## Quick Test Endpoints

### Health Check
```bash
curl http://localhost:3000/health
```

### Simulate USSD Request
```bash
curl -X POST http://localhost:3000/ussd \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "sessionId=test123&phoneNumber=+254712345678&serviceCode=*384*123#&text="
```

## Project Structure

```
ussd-rsk-defi/
├── contracts/           # Solidity smart contracts
│   ├── WalletRegistry.sol
│   ├── P2PTransfer.sol
│   └── MicroLoan.sol
├── backend/             # Node.js backend server
│   └── src/
│       ├── index.js     # Entry point
│       ├── routes/      # USSD & API routes
│       ├── handlers/    # USSD menu logic
│       ├── services/    # Blockchain integration
│       └── utils/       # Helpers
├── scripts/             # Deployment scripts
├── test/                # Contract tests
└── docs/                # Documentation
```

## Next Steps

1. **Add Liquidity**: Run `npm run add-liquidity:testnet` to fund the loan pool
2. **Register Users**: Use the USSD simulator to register test accounts
3. **Test Transfers**: Send RBTC between registered accounts
4. **Test Loans**: Request and repay micro-loans

## Common Issues

### "Gas estimation failed"
- Ensure your deployer account has enough RBTC
- Check RPC URL is correct

### "Contract not found"
- Verify contract addresses in `.env`
- Make sure contracts are deployed to the correct network

### "USSD timeout"
- Check server is running and accessible
- Verify ngrok URL is correct in Africa's Talking

## Resources

- [RSK Faucet](https://faucet.rsk.co) - Get test RBTC
- [RSK Explorer](https://explorer.testnet.rsk.co) - View transactions
- [Africa's Talking Docs](https://developers.africastalking.com/docs/ussd) - USSD API reference

## Support

Open an issue on GitHub or contact support@example.com

