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
}

/**
 * @title MicroLoan
 * @author USSD DeFi on RSK
 * @notice Collateralized micro-loan system for USSD-based financial inclusion
 * @dev Implements a simple over-collateralized lending protocol
 * 
 * Key Features:
 * - Over-collateralized loans (150% minimum)
 * - Fixed interest rates based on duration
 * - Automatic liquidation on default
 * - Phone-based identity system
 * 
 * Loan Flow:
 * 1. User requests loan with collateral
 * 2. System verifies collateral ratio
 * 3. Loan principal sent to user's wallet
 * 4. User repays principal + interest before deadline
 * 5. Collateral returned on successful repayment
 */
contract MicroLoan is ReentrancyGuard, Ownable, Pausable {
    
    // ============ Type Definitions ============
    
    /// @notice Loan status enumeration
    enum LoanStatus {
        None,       // No loan exists
        Active,     // Loan is active
        Repaid,     // Loan successfully repaid
        Defaulted,  // Loan defaulted and collateral seized
        Liquidated  // Loan liquidated due to collateral value drop
    }
    
    /// @notice Loan data structure
    struct Loan {
        uint256 loanId;          // Unique loan identifier
        uint256 principal;       // Original loan amount
        uint256 collateral;      // Collateral deposited
        uint256 interestRate;    // Annual interest rate (basis points)
        uint256 startTime;       // Loan start timestamp
        uint256 duration;        // Loan duration in seconds
        uint256 totalDue;        // Total amount due (principal + interest)
        uint256 repaidAmount;    // Amount already repaid
        LoanStatus status;       // Current loan status
    }
    
    /// @notice Loan tier configuration
    struct LoanTier {
        uint256 minAmount;
        uint256 maxAmount;
        uint256 interestRateBps;  // Annual interest in basis points
        uint256 minDuration;
        uint256 maxDuration;
        bool active;
    }
    
    // ============ State Variables ============
    
    /// @notice Reference to the WalletRegistry contract
    IWalletRegistry public immutable walletRegistry;
    
    /// @notice Phone hash to active loan mapping
    mapping(bytes32 => Loan) public loans;
    
    /// @notice Loan history per phone hash
    mapping(bytes32 => uint256[]) private loanHistory;
    
    /// @notice All loans by ID
    mapping(uint256 => Loan) private loansById;
    
    /// @notice Loan tiers
    mapping(uint256 => LoanTier) public loanTiers;
    uint256 public tierCount;
    
    /// @notice Minimum collateral ratio (basis points, 15000 = 150%)
    uint256 public minCollateralRatio;
    
    /// @notice Liquidation threshold (basis points, 12000 = 120%)
    uint256 public liquidationThreshold;
    
    /// @notice Total loans issued
    uint256 public totalLoansIssued;
    
    /// @notice Total value of active loans
    uint256 public totalActiveLoanValue;
    
    /// @notice Available liquidity for loans
    uint256 public availableLiquidity;
    
    /// @notice Total interest earned
    uint256 public totalInterestEarned;
    
    /// @notice Authorized backend addresses
    mapping(address => bool) public authorizedBackends;
    
    // ============ Events ============
    
    event LoanRequested(
        bytes32 indexed phoneHash,
        uint256 indexed loanId,
        uint256 principal,
        uint256 collateral,
        uint256 totalDue,
        uint256 dueDate
    );
    
    event LoanRepaid(
        bytes32 indexed phoneHash,
        uint256 indexed loanId,
        uint256 amountPaid,
        uint256 collateralReturned
    );
    
    event LoanDefaulted(
        bytes32 indexed phoneHash,
        uint256 indexed loanId,
        uint256 collateralSeized
    );
    
    event PartialRepayment(
        bytes32 indexed phoneHash,
        uint256 indexed loanId,
        uint256 amountPaid,
        uint256 remainingDue
    );
    
    event LiquidityAdded(address indexed provider, uint256 amount);
    event LiquidityRemoved(address indexed to, uint256 amount);
    event TierUpdated(uint256 indexed tierId, uint256 minAmount, uint256 maxAmount);
    event CollateralRatioUpdated(uint256 oldRatio, uint256 newRatio);
    
    // ============ Errors ============
    
    error NotAuthorized();
    error NotRegistered();
    error ActiveLoanExists();
    error NoActiveLoan();
    error InvalidAmount();
    error InvalidDuration();
    error InsufficientCollateral();
    error InsufficientLiquidity();
    error InsufficientRepayment();
    error LoanNotDue();
    error LoanAlreadyDefaulted();
    error TransferFailed();
    error InvalidTier();
    
    // ============ Modifiers ============
    
    modifier onlyAuthorized() {
        if (!authorizedBackends[msg.sender] && msg.sender != owner()) {
            revert NotAuthorized();
        }
        _;
    }
    
    // ============ Constructor ============
    
    /**
     * @notice Initialize the MicroLoan contract
     * @param _walletRegistry Address of the WalletRegistry contract
     */
    constructor(address _walletRegistry) Ownable(msg.sender) {
        walletRegistry = IWalletRegistry(_walletRegistry);
        
        // Set default parameters
        minCollateralRatio = 15000;    // 150%
        liquidationThreshold = 12000;   // 120%
        
        // Initialize default loan tiers
        _initializeDefaultTiers();
        
        authorizedBackends[msg.sender] = true;
    }
    
    /**
     * @dev Initialize default loan tiers
     */
    function _initializeDefaultTiers() internal {
        // Tier 0: Micro loans (7-30 days, 15% APR)
        loanTiers[0] = LoanTier({
            minAmount: 0.001 ether,
            maxAmount: 0.1 ether,
            interestRateBps: 1500,
            minDuration: 7 days,
            maxDuration: 30 days,
            active: true
        });
        
        // Tier 1: Small loans (14-60 days, 12% APR)
        loanTiers[1] = LoanTier({
            minAmount: 0.1 ether,
            maxAmount: 0.5 ether,
            interestRateBps: 1200,
            minDuration: 14 days,
            maxDuration: 60 days,
            active: true
        });
        
        // Tier 2: Medium loans (30-90 days, 10% APR)
        loanTiers[2] = LoanTier({
            minAmount: 0.5 ether,
            maxAmount: 2 ether,
            interestRateBps: 1000,
            minDuration: 30 days,
            maxDuration: 90 days,
            active: true
        });
        
        tierCount = 3;
    }
    
    // ============ External Functions ============
    
    /**
     * @notice Request a micro-loan
     * @dev Collateral must be sent with the transaction
     * @param phoneHash Borrower's phone hash
     * @param principal Requested loan amount
     * @param duration Loan duration in seconds
     * @param tierId Loan tier to use
     */
    function requestLoan(
        bytes32 phoneHash,
        uint256 principal,
        uint256 duration,
        uint256 tierId
    ) external payable onlyAuthorized nonReentrant whenNotPaused {
        // Validate registration
        if (!walletRegistry.checkRegistration(phoneHash)) {
            revert NotRegistered();
        }
        
        // Check no active loan
        if (loans[phoneHash].status == LoanStatus.Active) {
            revert ActiveLoanExists();
        }
        
        // Validate tier
        LoanTier storage tier = loanTiers[tierId];
        if (!tier.active) revert InvalidTier();
        
        // Validate amount
        if (principal < tier.minAmount || principal > tier.maxAmount) {
            revert InvalidAmount();
        }
        
        // Validate duration
        if (duration < tier.minDuration || duration > tier.maxDuration) {
            revert InvalidDuration();
        }
        
        // Check liquidity
        if (availableLiquidity < principal) {
            revert InsufficientLiquidity();
        }
        
        // Calculate required collateral
        uint256 requiredCollateral = (principal * minCollateralRatio) / 10000;
        if (msg.value < requiredCollateral) {
            revert InsufficientCollateral();
        }
        
        // Calculate interest
        uint256 interest = (principal * tier.interestRateBps * duration) / (365 days * 10000);
        uint256 totalDue = principal + interest;
        
        // Create loan
        uint256 loanId = totalLoansIssued++;
        
        Loan memory newLoan = Loan({
            loanId: loanId,
            principal: principal,
            collateral: msg.value,
            interestRate: tier.interestRateBps,
            startTime: block.timestamp,
            duration: duration,
            totalDue: totalDue,
            repaidAmount: 0,
            status: LoanStatus.Active
        });
        
        loans[phoneHash] = newLoan;
        loansById[loanId] = newLoan;
        loanHistory[phoneHash].push(loanId);
        
        // Update liquidity
        availableLiquidity -= principal;
        totalActiveLoanValue += principal;
        
        // Transfer loan to borrower
        address borrowerWallet = walletRegistry.getWallet(phoneHash);
        (bool success, ) = borrowerWallet.call{value: principal}("");
        if (!success) revert TransferFailed();
        
        emit LoanRequested(
            phoneHash,
            loanId,
            principal,
            msg.value,
            totalDue,
            block.timestamp + duration
        );
    }
    
    /**
     * @notice Repay an active loan
     * @dev Can be partial or full repayment
     * @param phoneHash Borrower's phone hash
     */
    function repayLoan(bytes32 phoneHash) external payable onlyAuthorized nonReentrant {
        Loan storage loan = loans[phoneHash];
        
        if (loan.status != LoanStatus.Active) {
            revert NoActiveLoan();
        }
        
        uint256 remainingDue = loan.totalDue - loan.repaidAmount;
        
        if (msg.value >= remainingDue) {
            // Full repayment
            loan.repaidAmount = loan.totalDue;
            loan.status = LoanStatus.Repaid;
            
            // Calculate interest earned
            uint256 interestEarned = loan.totalDue - loan.principal;
            totalInterestEarned += interestEarned;
            
            // Return liquidity
            availableLiquidity += loan.totalDue;
            totalActiveLoanValue -= loan.principal;
            
            // Return collateral + excess payment
            address borrowerWallet = walletRegistry.getWallet(phoneHash);
            uint256 returnAmount = loan.collateral + (msg.value - remainingDue);
            
            (bool success, ) = borrowerWallet.call{value: returnAmount}("");
            if (!success) revert TransferFailed();
            
            // Update stored loan
            loansById[loan.loanId] = loan;
            
            emit LoanRepaid(
                phoneHash,
                loan.loanId,
                remainingDue,
                loan.collateral
            );
        } else {
            // Partial repayment
            loan.repaidAmount += msg.value;
            availableLiquidity += msg.value;
            
            // Update stored loan
            loansById[loan.loanId] = loan;
            
            emit PartialRepayment(
                phoneHash,
                loan.loanId,
                msg.value,
                loan.totalDue - loan.repaidAmount
            );
        }
    }
    
    /**
     * @notice Process loan default after due date
     * @param phoneHash Borrower's phone hash
     */
    function processDefault(bytes32 phoneHash) external onlyAuthorized nonReentrant {
        Loan storage loan = loans[phoneHash];
        
        if (loan.status != LoanStatus.Active) {
            revert NoActiveLoan();
        }
        
        if (block.timestamp <= loan.startTime + loan.duration) {
            revert LoanNotDue();
        }
        
        // Mark as defaulted
        loan.status = LoanStatus.Defaulted;
        
        // Seize collateral
        uint256 collateralSeized = loan.collateral;
        
        // Calculate how much was owed
        uint256 remainingDue = loan.totalDue - loan.repaidAmount;
        
        // Add collateral to liquidity (covers the loss)
        // In a more sophisticated system, you'd handle partial recovery
        availableLiquidity += collateralSeized;
        totalActiveLoanValue -= (loan.principal - loan.repaidAmount);
        
        // Update stored loan
        loansById[loan.loanId] = loan;
        
        emit LoanDefaulted(phoneHash, loan.loanId, collateralSeized);
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get loan details for a phone number
     * @param phoneHash Phone hash to query
     */
    function getLoanDetails(bytes32 phoneHash) external view returns (
        uint256 loanId,
        uint256 principal,
        uint256 collateral,
        uint256 totalDue,
        uint256 repaidAmount,
        uint256 remainingDue,
        uint256 dueDate,
        LoanStatus status
    ) {
        Loan storage loan = loans[phoneHash];
        return (
            loan.loanId,
            loan.principal,
            loan.collateral,
            loan.totalDue,
            loan.repaidAmount,
            loan.totalDue - loan.repaidAmount,
            loan.startTime + loan.duration,
            loan.status
        );
    }
    
    /**
     * @notice Check if user is eligible for a loan
     * @param phoneHash Phone hash to check
     */
    function checkEligibility(bytes32 phoneHash) external view returns (
        bool eligible,
        string memory reason
    ) {
        if (!walletRegistry.checkRegistration(phoneHash)) {
            return (false, "Not registered");
        }
        
        if (loans[phoneHash].status == LoanStatus.Active) {
            return (false, "Active loan exists");
        }
        
        if (availableLiquidity == 0) {
            return (false, "No liquidity available");
        }
        
        return (true, "Eligible for loan");
    }
    
    /**
     * @notice Calculate loan quote
     * @param principal Desired loan amount
     * @param duration Loan duration in seconds
     * @param tierId Loan tier
     */
    function calculateLoanQuote(
        uint256 principal,
        uint256 duration,
        uint256 tierId
    ) external view returns (
        uint256 requiredCollateral,
        uint256 interest,
        uint256 totalDue,
        uint256 monthlyEquivalentRate,
        bool valid
    ) {
        LoanTier storage tier = loanTiers[tierId];
        
        if (!tier.active || 
            principal < tier.minAmount || 
            principal > tier.maxAmount ||
            duration < tier.minDuration ||
            duration > tier.maxDuration) {
            return (0, 0, 0, 0, false);
        }
        
        requiredCollateral = (principal * minCollateralRatio) / 10000;
        interest = (principal * tier.interestRateBps * duration) / (365 days * 10000);
        totalDue = principal + interest;
        monthlyEquivalentRate = (tier.interestRateBps * 30 days) / 365 days;
        valid = true;
    }
    
    /**
     * @notice Get loan history for a phone number
     * @param phoneHash Phone hash to query
     * @param limit Maximum loans to return
     */
    function getLoanHistory(
        bytes32 phoneHash,
        uint256 limit
    ) external view returns (Loan[] memory) {
        uint256[] storage history = loanHistory[phoneHash];
        uint256 count = history.length;
        
        if (count == 0) return new Loan[](0);
        
        uint256 resultCount = count < limit ? count : limit;
        Loan[] memory result = new Loan[](resultCount);
        
        for (uint256 i = 0; i < resultCount; i++) {
            result[i] = loansById[history[count - 1 - i]];
        }
        
        return result;
    }
    
    /**
     * @notice Get available loan tiers
     */
    function getAvailableTiers() external view returns (LoanTier[] memory tiers) {
        tiers = new LoanTier[](tierCount);
        for (uint256 i = 0; i < tierCount; i++) {
            tiers[i] = loanTiers[i];
        }
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Add liquidity to the loan pool
     */
    function addLiquidity() external payable onlyOwner {
        availableLiquidity += msg.value;
        emit LiquidityAdded(msg.sender, msg.value);
    }
    
    /**
     * @notice Remove liquidity from the pool
     * @param amount Amount to withdraw
     */
    function removeLiquidity(uint256 amount) external onlyOwner nonReentrant {
        require(amount <= availableLiquidity, "Insufficient liquidity");
        
        availableLiquidity -= amount;
        
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Withdrawal failed");
        
        emit LiquidityRemoved(msg.sender, amount);
    }
    
    /**
     * @notice Update a loan tier
     */
    function updateTier(
        uint256 tierId,
        uint256 minAmount,
        uint256 maxAmount,
        uint256 interestRateBps,
        uint256 minDuration,
        uint256 maxDuration,
        bool active
    ) external onlyOwner {
        require(tierId < tierCount || tierId == tierCount, "Invalid tier");
        
        if (tierId == tierCount) tierCount++;
        
        loanTiers[tierId] = LoanTier({
            minAmount: minAmount,
            maxAmount: maxAmount,
            interestRateBps: interestRateBps,
            minDuration: minDuration,
            maxDuration: maxDuration,
            active: active
        });
        
        emit TierUpdated(tierId, minAmount, maxAmount);
    }
    
    /**
     * @notice Update collateral ratio
     * @param newRatio New ratio in basis points
     */
    function updateCollateralRatio(uint256 newRatio) external onlyOwner {
        require(newRatio >= 10000, "Ratio must be >= 100%");
        require(newRatio <= 30000, "Ratio must be <= 300%");
        
        uint256 oldRatio = minCollateralRatio;
        minCollateralRatio = newRatio;
        
        emit CollateralRatioUpdated(oldRatio, newRatio);
    }
    
    /**
     * @notice Add authorized backend
     */
    function addAuthorizedBackend(address backend) external onlyOwner {
        authorizedBackends[backend] = true;
    }
    
    /**
     * @notice Remove authorized backend
     */
    function removeAuthorizedBackend(address backend) external onlyOwner {
        authorizedBackends[backend] = false;
    }
    
    /**
     * @notice Pause the contract
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    // ============ Receive Function ============
    
    receive() external payable {
        availableLiquidity += msg.value;
        emit LiquidityAdded(msg.sender, msg.value);
    }
}

