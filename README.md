# USSD DeFi on Rootstock (RSK)

A concise, production-grade reference for building a USSD-first DeFi application on Rootstock. It combines smart contracts (wallet registry, P2P transfers, micro-loans) with an Express backend that integrates with USSD gateways. An optional React frontend provides a simple admin and simulator.

## Features
- Wallet registration keyed by hashed phone numbers with PIN verification
- P2P transfers with configurable fee and basic on-chain history
- Micro-loans: liquidity pool, quote, disbursement, and repayment
- USSD backend: session management, validation, secure hashing
- Optional frontend: monitor status, balances, and simulate flows

## Project Structure
```
.
├─ contracts/            # Solidity: WalletRegistry, P2PTransfer, MicroLoan
├─ scripts/              # Deploy and ops scripts
├─ backend/              # Express USSD backend
│  ├─ src/abis/          # Contract ABIs (copy from artifacts)
│  ├─ src/handlers/      # USSD menu handler
│  ├─ src/middleware/    # Validation
│  ├─ src/routes/        # /ussd and /api
│  ├─ src/services/      # blockchain/session/wallet
│  └─ src/index.js       # Server entry
├─ deployments/          # Last deployment addresses
├─ frontend/             # Optional Vite React admin & simulator
└─ hardhat.config.js
```

## Setup (Rootstock Testnet)
- Fund a deployer account with RBTC (RSK Testnet faucet)
- Environment variables:
  - `RSK_TESTNET_RPC=https://public-node.testnet.rsk.co`
  - `DEPLOYER_PRIVATE_KEY=0x<funded>`
  - `BACKEND_WALLET_PRIVATE_KEY=0x<funded_or_service_key>`
- Compile contracts:
```
npm run compile
```
- Deploy contracts to testnet:
```
npm run deploy:testnet
```
- Add loan liquidity on testnet:
```
npx hardhat run scripts/add-liquidity.js --network rskTestnet
```
- Copy ABIs from `artifacts/contracts/*/*.json` to `backend/src/abis/`
- Backend `.env` (testnet):
  - `RSK_TESTNET_RPC=https://public-node.testnet.rsk.co`
  - `BACKEND_WALLET_PRIVATE_KEY=0x<funded_or_service_key>`
  - `WALLET_REGISTRY_ADDRESS=0x<deployed>`
  - `P2P_TRANSFER_ADDRESS=0x<deployed>`
  - `MICRO_LOAN_ADDRESS=0x<deployed>`
- Start backend:
```
cd backend
npm install
npm run dev
```

## USSD Integration
- Endpoint: POST `application/x-www-form-urlencoded` to `/ussd`
- Fields: `sessionId`, `phoneNumber`, `serviceCode`, `text`
- Response format:
  - `CON <message>` continues the session
  - `END <message>` ends the session

## API Reference
- `GET /api/status`
- `GET /api/balance/:phoneNumber` (Header: `x-api-key: dev_internal_key`)
- `GET /api/transactions/:phoneNumber` (Header: `x-api-key: dev_internal_key`)

## Deploy to RSK Testnet
```
RSK_TESTNET_RPC=https://public-node.testnet.rsk.co
DEPLOYER_PRIVATE_KEY=0x<funded>
npm run deploy:testnet
```
- Update backend `.env` with deployed addresses and restart backend

## Security
- Hash phone numbers and PINs; never store plaintext
- Do not commit private keys; use environment variables or a secret manager