/**
 * Blockchain Service
 * 
 * Handles all interactions with the Rootstock (RSK) blockchain.
 * Manages contract connections, transaction building, and state queries.
 */

const { ethers } = require('ethers');
const { hashPin } = require('../utils/crypto');

// Contract ABIs (simplified for this implementation)
const WALLET_REGISTRY_ABI = require('../abis/WalletRegistry.json');
const P2P_TRANSFER_ABI = require('../abis/P2PTransfer.json');
const MICRO_LOAN_ABI = require('../abis/MicroLoan.json');

// Service state
let provider;
let signer;
let walletRegistry;
let p2pTransfer;
let microLoan;
let initialized = false;

/**
 * Initialize blockchain connection and contract instances
 */
async function initializeBlockchain() {
    try {
        // Connect to RSK network
        const rpcUrl = process.env.RSK_TESTNET_RPC || 'https://public-node.testnet.rsk.co';
        provider = new ethers.JsonRpcProvider(rpcUrl);

        // Verify connection
        const network = await provider.getNetwork();
        console.log(`Connected to RSK network: ${network.name} (chainId: ${network.chainId})`);

        // Setup signer (backend wallet for gas)
        if (!process.env.BACKEND_WALLET_PRIVATE_KEY) {
            throw new Error('BACKEND_WALLET_PRIVATE_KEY not configured');
        }
        signer = new ethers.Wallet(process.env.BACKEND_WALLET_PRIVATE_KEY, provider);
        
        const signerBalance = await provider.getBalance(signer.address);
        console.log(`Backend wallet: ${signer.address}`);
        console.log(`Backend balance: ${ethers.formatEther(signerBalance)} RBTC`);

        // Initialize contract instances
        if (process.env.WALLET_REGISTRY_ADDRESS) {
            walletRegistry = new ethers.Contract(
                process.env.WALLET_REGISTRY_ADDRESS,
                WALLET_REGISTRY_ABI,
                signer
            );
            console.log(`WalletRegistry: ${process.env.WALLET_REGISTRY_ADDRESS}`);
        }

        if (process.env.P2P_TRANSFER_ADDRESS) {
            p2pTransfer = new ethers.Contract(
                process.env.P2P_TRANSFER_ADDRESS,
                P2P_TRANSFER_ABI,
                signer
            );
            console.log(`P2PTransfer: ${process.env.P2P_TRANSFER_ADDRESS}`);
        }

        if (process.env.MICRO_LOAN_ADDRESS) {
            microLoan = new ethers.Contract(
                process.env.MICRO_LOAN_ADDRESS,
                MICRO_LOAN_ABI,
                signer
            );
            console.log(`MicroLoan: ${process.env.MICRO_LOAN_ADDRESS}`);
        }

        initialized = true;
        return true;

    } catch (error) {
        console.error('Failed to initialize blockchain:', error);
        throw error;
    }
}

/**
 * Check if a phone hash is registered
 * @param {string} phoneHash - Keccak256 hash of phone number
 * @returns {boolean} Registration status
 */
async function checkRegistration(phoneHash) {
    if (!walletRegistry) {
        console.warn('WalletRegistry not initialized');
        return false;
    }

    try {
        return await walletRegistry.checkRegistration(phoneHash);
    } catch (error) {
        console.error('checkRegistration error:', error);
        return false;
    }
}

/**
 * Get wallet address for a phone hash
 * @param {string} phoneHash - Keccak256 hash of phone number
 * @returns {string} Wallet address
 */
async function getWalletAddress(phoneHash) {
    if (!walletRegistry) {
        throw new Error('WalletRegistry not initialized');
    }

    return await walletRegistry.getWallet(phoneHash);
}

/**
 * Get balance for a phone hash
 * @param {string} phoneHash - Keccak256 hash of phone number
 * @returns {string} Balance in RBTC
 */
async function getBalance(phoneHash) {
    const walletAddress = await getWalletAddress(phoneHash);
    
    if (walletAddress === ethers.ZeroAddress) {
        return '0';
    }

    const balance = await provider.getBalance(walletAddress);
    return ethers.formatEther(balance);
}

/**
 * Verify PIN for a phone hash
 * @param {string} phoneHash - Phone hash
 * @param {string} pin - User's PIN
 * @returns {boolean} Whether PIN is valid
 */
async function verifyPin(phoneHash, pin) {
    if (!walletRegistry) {
        throw new Error('WalletRegistry not initialized');
    }

    const pinHash = hashPin(phoneHash, pin);
    return await walletRegistry.verifyPin(phoneHash, pinHash);
}

/**
 * Calculate transfer fee
 * @param {number} amount - Transfer amount in RBTC
 * @returns {number} Fee in RBTC
 */
async function calculateTransferFee(amount) {
    if (!p2pTransfer) {
        // Default 0.5% fee
        return amount * 0.005;
    }

    try {
        const feeBps = await p2pTransfer.transferFeeBps();
        return amount * Number(feeBps) / 10000;
    } catch (error) {
        console.error('calculateTransferFee error:', error);
        return amount * 0.005;
    }
}

/**
 * Execute P2P transfer
 * @param {string} fromPhoneHash - Sender's phone hash
 * @param {string} toPhoneHash - Recipient's phone hash
 * @param {number} amount - Amount in RBTC
 * @returns {string} Transaction hash
 */
async function executeTransfer(fromPhoneHash, toPhoneHash, amount) {
    if (!p2pTransfer) {
        throw new Error('P2PTransfer not initialized');
    }

    // Get sender's wallet to withdraw funds
    const senderWallet = await getWalletAddress(fromPhoneHash);
    
    // Note: In production, you would need a more sophisticated approach
    // to handle user wallets, possibly using account abstraction or
    // meta-transactions. For this tutorial, we assume the backend
    // has authorization to execute transfers on behalf of users.

    const amountWei = ethers.parseEther(amount.toString());
    const fee = await calculateTransferFee(amount);
    const totalWei = ethers.parseEther((amount + fee).toString());

    const tx = await p2pTransfer.transfer(
        fromPhoneHash,
        toPhoneHash,
        { value: totalWei }
    );

    const receipt = await tx.wait();
    return receipt.hash;
}

/**
 * Get transaction history for a phone hash
 * @param {string} phoneHash - Phone hash
 * @param {number} limit - Max transactions to return
 * @returns {Array} Transaction history
 */
async function getTransactionHistory(phoneHash, limit = 5) {
    if (!p2pTransfer) {
        return [];
    }

    try {
        const transactions = await p2pTransfer.getTransactionHistory(phoneHash, 0, limit);
        
        return transactions.map(tx => ({
            fromPhoneHash: tx.fromPhoneHash,
            toPhoneHash: tx.toPhoneHash,
            amount: ethers.formatEther(tx.amount),
            fee: ethers.formatEther(tx.fee),
            timestamp: Number(tx.timestamp),
            txHash: tx.txHash
        }));
    } catch (error) {
        console.error('getTransactionHistory error:', error);
        return [];
    }
}

/**
 * Check loan eligibility
 * @param {string} phoneHash - Phone hash
 * @returns {Object} Eligibility status and reason
 */
async function checkLoanEligibility(phoneHash) {
    if (!microLoan) {
        return { eligible: false, reason: 'Loan service not available' };
    }

    try {
        const result = await microLoan.checkEligibility(phoneHash);
        return {
            eligible: result.eligible,
            reason: result.reason
        };
    } catch (error) {
        console.error('checkLoanEligibility error:', error);
        return { eligible: false, reason: 'Unable to check eligibility' };
    }
}

/**
 * Get loan quote
 * @param {number} principal - Loan amount in RBTC
 * @param {number} duration - Duration in seconds
 * @returns {Object} Loan quote details
 */
async function getLoanQuote(principal, duration) {
    if (!microLoan) {
        // Return default calculation
        const collateralRatio = 1.5;
        const annualRate = 0.15; // 15%
        const interest = principal * annualRate * (duration / (365 * 24 * 60 * 60));
        
        return {
            requiredCollateral: principal * collateralRatio,
            interest: interest,
            totalDue: principal + interest,
            valid: true
        };
    }

    try {
        const principalWei = ethers.parseEther(principal.toString());
        const quote = await microLoan.calculateLoanQuote(principalWei, duration, 0);
        
        return {
            requiredCollateral: parseFloat(ethers.formatEther(quote.requiredCollateral)),
            interest: parseFloat(ethers.formatEther(quote.interest)),
            totalDue: parseFloat(ethers.formatEther(quote.totalDue)),
            valid: quote.valid
        };
    } catch (error) {
        console.error('getLoanQuote error:', error);
        throw error;
    }
}

/**
 * Get active loan details
 * @param {string} phoneHash - Phone hash
 * @returns {Object|null} Loan details or null
 */
async function getLoanDetails(phoneHash) {
    if (!microLoan) {
        return null;
    }

    try {
        const details = await microLoan.getLoanDetails(phoneHash);
        
        // Check if loan exists
        if (Number(details.status) === 0) {
            return null;
        }

        const statusMap = ['None', 'Active', 'Repaid', 'Defaulted', 'Liquidated'];

        return {
            loanId: Number(details.loanId),
            principal: ethers.formatEther(details.principal),
            collateral: ethers.formatEther(details.collateral),
            totalDue: ethers.formatEther(details.totalDue),
            repaidAmount: ethers.formatEther(details.repaidAmount),
            remainingDue: ethers.formatEther(details.remainingDue),
            dueDate: Number(details.dueDate),
            status: statusMap[Number(details.status)]
        };
    } catch (error) {
        console.error('getLoanDetails error:', error);
        return null;
    }
}

/**
 * Request a new loan
 * @param {string} phoneHash - Borrower's phone hash
 * @param {number} principal - Loan amount in RBTC
 * @param {number} duration - Duration in seconds
 * @param {number} collateral - Collateral amount in RBTC
 * @returns {Object} Loan result
 */
async function requestLoan(phoneHash, principal, duration, collateral) {
    if (!microLoan) {
        throw new Error('Loan service not available');
    }

    const principalWei = ethers.parseEther(principal.toString());
    const collateralWei = ethers.parseEther(collateral.toString());

    const tx = await microLoan.requestLoan(
        phoneHash,
        principalWei,
        duration,
        0, // tierId
        { value: collateralWei }
    );

    const receipt = await tx.wait();
    
    return {
        success: true,
        txHash: receipt.hash
    };
}

/**
 * Repay an active loan
 * @param {string} phoneHash - Borrower's phone hash
 * @param {string} amount - Amount to repay in RBTC
 * @returns {Object} Repayment result
 */
async function repayLoan(phoneHash, amount) {
    if (!microLoan) {
        throw new Error('Loan service not available');
    }

    const amountWei = ethers.parseEther(amount.toString());

    const tx = await microLoan.repayLoan(
        phoneHash,
        { value: amountWei }
    );

    const receipt = await tx.wait();
    
    return {
        success: true,
        txHash: receipt.hash
    };
}

/**
 * Get current gas price
 * @returns {string} Gas price in gwei
 */
async function getGasPrice() {
    const feeData = await provider.getFeeData();
    return ethers.formatUnits(feeData.gasPrice, 'gwei');
}

/**
 * Get provider instance
 */
function getProvider() {
    return provider;
}

/**
 * Get signer instance
 */
function getSigner() {
    return signer;
}

module.exports = {
    initializeBlockchain,
    checkRegistration,
    getWalletAddress,
    getBalance,
    verifyPin,
    calculateTransferFee,
    executeTransfer,
    getTransactionHistory,
    checkLoanEligibility,
    getLoanQuote,
    getLoanDetails,
    requestLoan,
    repayLoan,
    getGasPrice,
    getProvider,
    getSigner
};

