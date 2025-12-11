# System Architecture

## Overview

The USSD DeFi system enables feature phone users to interact with the Rootstock (RSK) blockchain through a USSD gateway. This document details the system architecture, data flows, and security considerations.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              USSD DeFi Architecture                                      │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  LAYER 1: USER INTERFACE (Feature Phones)                                               │
│  ════════════════════════════════════════                                               │
│                                                                                          │
│  ┌──────────────┐                                                                        │
│  │   Feature    │  User dials *384*123#                                                 │
│  │   Phone      │  ────────────────────▶  GSM Network                                   │
│  │   (No Data)  │                                                                        │
│  └──────────────┘                                                                        │
│                                                                                          │
│  LAYER 2: TELECOM INFRASTRUCTURE                                                        │
│  ════════════════════════════════════                                                   │
│                                                                                          │
│  ┌──────────────┐     ┌──────────────────┐     ┌─────────────────────────┐              │
│  │   Mobile     │     │   Telecom        │     │   Africa's Talking      │              │
│  │   Network    │────▶│   USSD Gateway   │────▶│   USSD API Gateway      │              │
│  │   Operator   │     │   (MTN, etc.)    │     │   (REST API)            │              │
│  └──────────────┘     └──────────────────┘     └───────────┬─────────────┘              │
│                                                            │                             │
│                                                            │ HTTP POST                   │
│                                                            ▼                             │
│  LAYER 3: APPLICATION BACKEND                                                           │
│  ══════════════════════════════                                                         │
│                                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐    │
│  │                         Node.js Backend Server                                   │    │
│  │  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────────────────┐   │    │
│  │  │  USSD Router    │   │  Session        │   │  Security Layer             │   │    │
│  │  │  ─────────────  │   │  Manager        │   │  ───────────────            │   │    │
│  │  │  • Menu Logic   │   │  ─────────────  │   │  • PIN Verification         │   │    │
│  │  │  • Input Parse  │   │  • State Track  │   │  • Rate Limiting            │   │    │
│  │  │  • Response     │   │  • Timeout      │   │  • Input Sanitization       │   │    │
│  │  │    Builder      │   │  • Cleanup      │   │  • Request Validation       │   │    │
│  │  └─────────────────┘   └─────────────────┘   └─────────────────────────────┘   │    │
│  │                                                                                  │    │
│  │  ┌─────────────────────────────────────────────────────────────────────────┐   │    │
│  │  │                    Blockchain Integration Layer                          │   │    │
│  │  │  ┌───────────────┐   ┌───────────────┐   ┌───────────────────────────┐  │   │    │
│  │  │  │  Wallet       │   │  Transaction  │   │  Loan                     │  │   │    │
│  │  │  │  Service      │   │  Builder      │   │  Manager                  │  │   │    │
│  │  │  │  ───────────  │   │  ───────────  │   │  ───────────              │  │   │    │
│  │  │  │  • HD Wallet  │   │  • Gas Est.   │   │  • Quote Calc             │  │   │    │
│  │  │  │  • Key Mgmt   │   │  • TX Sign    │   │  • Collateral             │  │   │    │
│  │  │  │  • Recovery   │   │  • Broadcast  │   │  • Repayment              │  │   │    │
│  │  │  └───────────────┘   └───────────────┘   └───────────────────────────┘  │   │    │
│  │  └─────────────────────────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────────────────────┘    │
│                                                            │                             │
│                                                            │ JSON-RPC                    │
│                                                            ▼                             │
│  LAYER 4: BLOCKCHAIN (Rootstock/RSK)                                                    │
│  ════════════════════════════════════                                                   │
│                                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐    │
│  │                         RSK Network (Bitcoin Sidechain)                          │    │
│  │                                                                                  │    │
│  │  ┌─────────────────────┐  ┌─────────────────────┐  ┌──────────────────────────┐│    │
│  │  │  WalletRegistry.sol │  │  P2PTransfer.sol    │  │  MicroLoan.sol           ││    │
│  │  │  ─────────────────  │  │  ────────────────   │  │  ────────────            ││    │
│  │  │  • Phone→Wallet     │  │  • Transfer RBTC    │  │  • Request Loan          ││    │
│  │  │  • PIN Storage      │  │  • TX History       │  │  • Collateral Mgmt       ││    │
│  │  │  • Registration     │  │  • Fee Collection   │  │  • Repayment             ││    │
│  │  │  • Authorization    │  │  • Daily Limits     │  │  • Default Handling      ││    │
│  │  └─────────────────────┘  └─────────────────────┘  └──────────────────────────┘│    │
│  │                                                                                  │    │
│  │  ┌───────────────────────────────────────────────────────────────────────────┐ │    │
│  │  │                    Native RBTC (Bitcoin-backed)                            │ │    │
│  │  └───────────────────────────────────────────────────────────────────────────┘ │    │
│  └─────────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. User Interface Layer

**Feature Phones**
- Standard GSM phones without internet capability
- Users interact via USSD short codes (e.g., `*384*123#`)
- Text-based menu navigation
- Session timeout: ~3 minutes (carrier dependent)

### 2. Telecom Infrastructure Layer

**Mobile Network Operators (MNO)**
- Handle USSD signaling
- Route requests to registered short codes
- Examples: MTN, Safaricom, Airtel

**Africa's Talking Gateway**
- Aggregates multiple MNO connections
- Provides REST API for USSD handling
- Handles session management at telecom level
- Sends HTTP POST requests to callback URL

### 3. Application Backend Layer

**USSD Router**
- Parses incoming USSD requests
- Routes to appropriate menu handler
- Builds USSD responses (CON/END prefix)

**Session Manager**
- Tracks user session state
- Stores temporary data (recipient, amount, etc.)
- Automatic cleanup of expired sessions
- In-memory storage (Redis recommended for production)

**Security Layer**
- Validates incoming requests
- Rate limiting per phone number
- Input sanitization
- PIN verification before sensitive operations

**Blockchain Integration**
- Wallet Service: HD wallet generation and management
- Transaction Builder: Constructs and signs transactions
- Loan Manager: Handles loan lifecycle

### 4. Blockchain Layer (RSK)

**WalletRegistry Contract**
- Maps phone number hashes to wallet addresses
- Stores hashed PINs for authentication
- Authorization system for backend access

**P2PTransfer Contract**
- Executes peer-to-peer RBTC transfers
- Records transaction history on-chain
- Collects and manages transfer fees
- Enforces daily transfer limits

**MicroLoan Contract**
- Over-collateralized lending system
- Multiple loan tiers with different terms
- Automatic interest calculation
- Default and liquidation handling

## Data Flow Diagrams

### Transfer Flow

```
User                USSD        Backend         RSK
 │                   │            │              │
 │ Dial *384*123#    │            │              │
 │──────────────────▶│            │              │
 │                   │ POST /ussd │              │
 │                   │───────────▶│              │
 │                   │            │ Check reg    │
 │                   │            │─────────────▶│
 │                   │            │◀─────────────│
 │ Show menu         │◀───────────│              │
 │◀──────────────────│            │              │
 │ Select "Send"     │            │              │
 │──────────────────▶│───────────▶│              │
 │ Enter recipient   │◀───────────│              │
 │◀──────────────────│            │              │
 │ +254712345678     │            │              │
 │──────────────────▶│───────────▶│ Check recip  │
 │                   │            │─────────────▶│
 │ Enter amount      │◀───────────│◀─────────────│
 │◀──────────────────│            │              │
 │ 0.01              │            │              │
 │──────────────────▶│───────────▶│ Get balance  │
 │                   │            │─────────────▶│
 │ Confirm (Y/N)     │◀───────────│◀─────────────│
 │◀──────────────────│            │              │
 │ 1 (Yes)           │            │              │
 │──────────────────▶│───────────▶│              │
 │ Enter PIN         │◀───────────│              │
 │◀──────────────────│            │              │
 │ 1234              │            │              │
 │──────────────────▶│───────────▶│ Verify PIN   │
 │                   │            │─────────────▶│
 │                   │            │◀─────────────│
 │                   │            │ Execute TX   │
 │                   │            │─────────────▶│
 │ Success!          │◀───────────│◀─────────────│
 │◀──────────────────│            │              │
 │                   │            │              │
```

### Loan Request Flow

```
User                USSD        Backend         MicroLoan
 │                   │            │              │
 │ Request Loan      │            │              │
 │──────────────────▶│───────────▶│              │
 │                   │            │ Check elig.  │
 │                   │            │─────────────▶│
 │                   │            │◀─────────────│
 │ Enter amount      │◀───────────│              │
 │◀──────────────────│            │              │
 │ 0.05 RBTC         │            │              │
 │──────────────────▶│───────────▶│ Get quote    │
 │                   │            │─────────────▶│
 │ Select duration   │◀───────────│◀─────────────│
 │◀──────────────────│            │              │
 │ 14 days           │            │              │
 │──────────────────▶│───────────▶│ Calc terms   │
 │                   │            │─────────────▶│
 │ Show terms        │◀───────────│◀─────────────│
 │◀──────────────────│            │              │
 │ Accept            │            │              │
 │──────────────────▶│───────────▶│              │
 │ Enter PIN         │◀───────────│              │
 │◀──────────────────│            │              │
 │ 1234              │            │              │
 │──────────────────▶│───────────▶│ Verify PIN   │
 │                   │            │─────────────▶│
 │                   │            │◀─────────────│
 │                   │            │ Request Loan │
 │                   │            │ + Collateral │
 │                   │            │─────────────▶│
 │ Loan approved!    │◀───────────│◀─────────────│
 │◀──────────────────│            │              │
```

## Security Architecture

### Phone Number Privacy

```
Phone: +254712345678
         │
         ▼
    Normalize
         │
         ▼
    +254712345678
         │
         ▼
    keccak256(phone + salt)
         │
         ▼
    0x7f3d...a8b2 (stored on-chain)
```

### PIN Security

```
PIN: 1234
      │
      ▼
 keccak256(phoneHash + PIN)
      │
      ▼
 0x9e2c...f1a4 (stored on-chain)
```

### Authorization Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    Authorization Matrix                       │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Function              │ Who Can Call                         │
│  ─────────────────────────────────────────────────────────   │
│  registerWallet        │ Authorized Backend, Owner            │
│  transfer              │ Authorized Backend, Owner            │
│  requestLoan           │ Authorized Backend, Owner            │
│  repayLoan             │ Authorized Backend, Owner            │
│  updateFee             │ Owner only                           │
│  withdrawFees          │ Owner only                           │
│  addAuthorizedBackend  │ Owner only                           │
│  pause/unpause         │ Owner only                           │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

## Scalability Considerations

### Current Limitations
- Session storage: In-memory (single server)
- Wallet keys: In-memory (single server)
- RSK TPS: ~30 transactions per second

### Production Recommendations

1. **Session Storage**: Use Redis for distributed session management
2. **Key Management**: Use HSM or cloud KMS (AWS KMS, HashiCorp Vault)
3. **Database**: PostgreSQL for user data and transaction logs
4. **Load Balancing**: Multiple backend instances behind load balancer
5. **Monitoring**: Prometheus + Grafana for metrics
6. **Logging**: ELK stack for centralized logging

## Disaster Recovery

### Backup Strategy
- Smart contract state: Immutable on blockchain
- User mappings: Can be reconstructed from blockchain events
- Private keys: Must be securely backed up off-site

### Recovery Procedures
1. Deploy new backend instances
2. Restore environment configuration
3. Sync wallet keys from secure backup
4. Update Africa's Talking callback URL
5. Verify contract connectivity

