// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title IWalletRegistry
 * @notice Interface for the WalletRegistry contract
 */
interface IWalletRegistry {
    function getWallet(bytes32 phoneHash) external view returns (address);
    function checkRegistration(bytes32 phoneHash) external view returns (bool);
    function verifyPin(bytes32 phoneHash, bytes32 pinHash) external view returns (bool);
}

/**
 * @title P2PTransfer
 * @author USSD DeFi on RSK
 * @notice Enables peer-to-peer RBTC transfers between phone-registered wallets
 * @dev All transfers are initiated by the authorized backend after PIN verification
 * 
 * Key Features:
 * - Phone-to-phone transfers using hashed identifiers
 * - Transaction history storage for USSD retrieval
 * - Configurable transfer fees
 * - Emergency pause functionality
 */
contract P2PTransfer is ReentrancyGuard, Ownable, Pausable {
    
    // ============ State Variables ============
    
    /// @notice Reference to the WalletRegistry contract
    IWalletRegistry public immutable walletRegistry;
    
    /// @notice Transaction record structure
    struct Transaction {
        bytes32 fromPhoneHash;    // Sender's phone hash
        bytes32 toPhoneHash;      // Recipient's phone hash
        uint256 amount;           // Amount transferred (after fees)
        uint256 fee;              // Fee charged
        uint256 timestamp;        // Block timestamp
        bytes32 txHash;           // Transaction identifier
    }
    
    /// @notice Transaction history per phone hash
    mapping(bytes32 => Transaction[]) private transactionHistory;
    
    /// @notice Transaction lookup by hash
    mapping(bytes32 => Transaction) private transactionByHash;
    
    /// @notice Transfer fee in basis points (100 = 1%)
    uint256 public transferFeeBps;
    
    /// @notice Maximum allowed fee (5%)
    uint256 public constant MAX_FEE_BPS = 500;
    
    /// @notice Minimum transfer amount
    uint256 public minTransferAmount;
    
    /// @notice Maximum transfer amount per transaction
    uint256 public maxTransferAmount;
    
    /// @notice Daily transfer limit per user
    uint256 public dailyTransferLimit;
    
    /// @notice Daily transfer tracking
    mapping(bytes32 => mapping(uint256 => uint256)) private dailyTransfers;
    
    /// @notice Accumulated fees available for withdrawal
    uint256 public accumulatedFees;
    
    /// @notice Total transaction count
    uint256 public totalTransactions;
    
    /// @notice Total volume transferred
    uint256 public totalVolume;
    
    /// @notice Authorized backend addresses
    mapping(address => bool) public authorizedBackends;
    
    // ============ Events ============
    
    event TransferExecuted(
        bytes32 indexed fromPhoneHash,
        bytes32 indexed toPhoneHash,
        uint256 amount,
        uint256 fee,
        bytes32 indexed txHash,
        uint256 timestamp
    );
    
    event FeesWithdrawn(address indexed to, uint256 amount);
    event FeeUpdated(uint256 oldFee, uint256 newFee);
    event LimitsUpdated(uint256 minAmount, uint256 maxAmount, uint256 dailyLimit);
    event BackendAuthorized(address indexed backend);
    event BackendRevoked(address indexed backend);
    
    // ============ Errors ============
    
    error NotAuthorized();
    error InvalidAmount();
    error InsufficientFunds();
    error RecipientNotRegistered();
    error SelfTransferNotAllowed();
    error TransferFailed();
    error DailyLimitExceeded();
    error InvalidFee();
    error NoFeesToWithdraw();
    
    // ============ Modifiers ============
    
    modifier onlyAuthorized() {
        if (!authorizedBackends[msg.sender] && msg.sender != owner()) {
            revert NotAuthorized();
        }
        _;
    }
    
    // ============ Constructor ============
    
    /**
     * @notice Initialize the P2PTransfer contract
     * @param _walletRegistry Address of the WalletRegistry contract
     */
    constructor(address _walletRegistry) Ownable(msg.sender) {
        walletRegistry = IWalletRegistry(_walletRegistry);
        
        // Set default values
        transferFeeBps = 50;                    // 0.5% fee
        minTransferAmount = 0.0001 ether;       // ~$0.10 at typical RBTC prices
        maxTransferAmount = 10 ether;           // ~$10,000
        dailyTransferLimit = 50 ether;          // ~$50,000 daily
        
        authorizedBackends[msg.sender] = true;
        emit BackendAuthorized(msg.sender);
    }
    
    // ============ External Functions ============
    
    /**
     * @notice Execute a P2P transfer between two phone numbers
     * @dev Called by authorized backend after PIN verification
     * @param fromPhoneHash Sender's phone hash
     * @param toPhoneHash Recipient's phone hash
     * 
     * The backend should:
     * 1. Verify the sender's PIN off-chain or via WalletRegistry
     * 2. Withdraw funds from sender's wallet
     * 3. Call this function with the funds
     */
    function transfer(
        bytes32 fromPhoneHash,
        bytes32 toPhoneHash
    ) external payable onlyAuthorized nonReentrant whenNotPaused {
        // Validations
        if (msg.value < minTransferAmount || msg.value > maxTransferAmount) {
            revert InvalidAmount();
        }
        if (fromPhoneHash == toPhoneHash) {
            revert SelfTransferNotAllowed();
        }
        if (!walletRegistry.checkRegistration(toPhoneHash)) {
            revert RecipientNotRegistered();
        }
        
        // Check daily limit
        uint256 today = block.timestamp / 1 days;
        uint256 todayTotal = dailyTransfers[fromPhoneHash][today] + msg.value;
        if (todayTotal > dailyTransferLimit) {
            revert DailyLimitExceeded();
        }
        dailyTransfers[fromPhoneHash][today] = todayTotal;
        
        // Calculate fee
        uint256 fee = (msg.value * transferFeeBps) / 10000;
        uint256 transferAmount = msg.value - fee;
        
        // Get recipient wallet
        address recipient = walletRegistry.getWallet(toPhoneHash);
        
        // Generate transaction hash
        bytes32 txHash = keccak256(abi.encodePacked(
            fromPhoneHash,
            toPhoneHash,
            msg.value,
            block.timestamp,
            totalTransactions
        ));
        
        // Record transaction
        Transaction memory txRecord = Transaction({
            fromPhoneHash: fromPhoneHash,
            toPhoneHash: toPhoneHash,
            amount: transferAmount,
            fee: fee,
            timestamp: block.timestamp,
            txHash: txHash
        });
        
        transactionHistory[fromPhoneHash].push(txRecord);
        transactionHistory[toPhoneHash].push(txRecord);
        transactionByHash[txHash] = txRecord;
        
        // Update stats
        accumulatedFees += fee;
        totalTransactions++;
        totalVolume += transferAmount;
        
        // Transfer to recipient
        (bool success, ) = recipient.call{value: transferAmount}("");
        if (!success) revert TransferFailed();
        
        emit TransferExecuted(
            fromPhoneHash,
            toPhoneHash,
            transferAmount,
            fee,
            txHash,
            block.timestamp
        );
    }
    
    /**
     * @notice Get transaction history for a phone number
     * @param phoneHash Phone hash to query
     * @param offset Starting index (0 for most recent)
     * @param limit Maximum number of transactions to return
     * @return transactions Array of recent transactions (newest first)
     */
    function getTransactionHistory(
        bytes32 phoneHash,
        uint256 offset,
        uint256 limit
    ) external view returns (Transaction[] memory transactions) {
        Transaction[] storage history = transactionHistory[phoneHash];
        uint256 total = history.length;
        
        if (total == 0 || offset >= total) {
            return new Transaction[](0);
        }
        
        // Calculate actual count to return
        uint256 available = total - offset;
        uint256 count = available < limit ? available : limit;
        
        transactions = new Transaction[](count);
        
        // Return most recent transactions first
        for (uint256 i = 0; i < count; i++) {
            transactions[i] = history[total - 1 - offset - i];
        }
        
        return transactions;
    }
    
    /**
     * @notice Get transaction count for a phone number
     * @param phoneHash Phone hash to query
     * @return count Number of transactions
     */
    function getTransactionCount(bytes32 phoneHash) external view returns (uint256 count) {
        return transactionHistory[phoneHash].length;
    }
    
    /**
     * @notice Get transaction by hash
     * @param txHash Transaction hash to look up
     * @return transaction The transaction details
     */
    function getTransaction(bytes32 txHash) external view returns (Transaction memory transaction) {
        return transactionByHash[txHash];
    }
    
    /**
     * @notice Get daily transfer total for a phone number
     * @param phoneHash Phone hash to query
     * @return total Today's transfer total
     * @return remaining Remaining daily limit
     */
    function getDailyTransferStatus(bytes32 phoneHash) external view returns (
        uint256 total,
        uint256 remaining
    ) {
        uint256 today = block.timestamp / 1 days;
        total = dailyTransfers[phoneHash][today];
        remaining = total >= dailyTransferLimit ? 0 : dailyTransferLimit - total;
    }
    
    /**
     * @notice Calculate transfer fee for an amount
     * @param amount Amount to transfer
     * @return fee The fee that would be charged
     * @return netAmount Amount recipient would receive
     */
    function calculateFee(uint256 amount) external view returns (
        uint256 fee,
        uint256 netAmount
    ) {
        fee = (amount * transferFeeBps) / 10000;
        netAmount = amount - fee;
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Withdraw accumulated fees
     * @param to Address to send fees to
     */
    function withdrawFees(address to) external onlyOwner nonReentrant {
        uint256 amount = accumulatedFees;
        if (amount == 0) revert NoFeesToWithdraw();
        
        accumulatedFees = 0;
        
        (bool success, ) = to.call{value: amount}("");
        if (!success) revert TransferFailed();
        
        emit FeesWithdrawn(to, amount);
    }
    
    /**
     * @notice Update transfer fee
     * @param newFeeBps New fee in basis points
     */
    function updateFee(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert InvalidFee();
        
        uint256 oldFee = transferFeeBps;
        transferFeeBps = newFeeBps;
        
        emit FeeUpdated(oldFee, newFeeBps);
    }
    
    /**
     * @notice Update transfer limits
     * @param _minAmount Minimum transfer amount
     * @param _maxAmount Maximum transfer amount
     * @param _dailyLimit Daily transfer limit
     */
    function updateLimits(
        uint256 _minAmount,
        uint256 _maxAmount,
        uint256 _dailyLimit
    ) external onlyOwner {
        require(_minAmount < _maxAmount, "Invalid limits");
        
        minTransferAmount = _minAmount;
        maxTransferAmount = _maxAmount;
        dailyTransferLimit = _dailyLimit;
        
        emit LimitsUpdated(_minAmount, _maxAmount, _dailyLimit);
    }
    
    /**
     * @notice Add authorized backend
     * @param backend Address to authorize
     */
    function addAuthorizedBackend(address backend) external onlyOwner {
        authorizedBackends[backend] = true;
        emit BackendAuthorized(backend);
    }
    
    /**
     * @notice Remove authorized backend
     * @param backend Address to revoke
     */
    function removeAuthorizedBackend(address backend) external onlyOwner {
        authorizedBackends[backend] = false;
        emit BackendRevoked(backend);
    }
    
    /**
     * @notice Pause all transfers
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @notice Resume transfers
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @notice Emergency withdrawal of stuck funds
     * @param to Address to send funds to
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(address to, uint256 amount) external onlyOwner {
        require(amount <= address(this).balance - accumulatedFees, "Exceeds available");
        
        (bool success, ) = to.call{value: amount}("");
        require(success, "Withdrawal failed");
    }
    
    // ============ Receive Function ============
    
    receive() external payable {}
}

