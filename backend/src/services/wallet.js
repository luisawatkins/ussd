/**
 * Wallet Service
 * 
 * Handles wallet creation and management for USSD users.
 * Generates HD wallets from phone numbers and manages key storage.
 */

const { ethers } = require('ethers');
const { hashPin } = require('../utils/crypto');
const blockchainService = require('./blockchain');

// In production, use a proper secure key management system
// This is a simplified implementation for tutorial purposes
const walletStore = new Map();

/**
 * Create a new wallet and register it with the WalletRegistry contract
 * @param {string} phoneHash - Hashed phone number
 * @param {string} pin - User's PIN
 * @returns {Object} Wallet creation result
 */
async function createAndRegisterWallet(phoneHash, pin) {
    try {
        // Generate a new random wallet
        const wallet = ethers.Wallet.createRandom();
        
        // In production, you would:
        // 1. Encrypt the private key with the user's PIN
        // 2. Store it in a secure database or HSM
        // 3. Use account abstraction for better UX
        
        // For this tutorial, we store in memory (NOT FOR PRODUCTION)
        walletStore.set(phoneHash, {
            address: wallet.address,
            // In production: encrypt this with a proper KMS
            encryptedKey: wallet.privateKey,
            createdAt: Date.now()
        });

        // Hash the PIN for on-chain storage
        const pinHash = hashPin(phoneHash, pin);

        // Get contract signer
        const signer = blockchainService.getSigner();
        const provider = blockchainService.getProvider();

        // Get WalletRegistry contract
        const walletRegistryAddress = process.env.WALLET_REGISTRY_ADDRESS;
        
        if (!walletRegistryAddress) {
            throw new Error('WalletRegistry address not configured');
        }

        const WALLET_REGISTRY_ABI = require('../abis/WalletRegistry.json');
        const walletRegistry = new ethers.Contract(
            walletRegistryAddress,
            WALLET_REGISTRY_ABI,
            signer
        );

        // Register wallet on-chain
        const tx = await walletRegistry.registerWallet(
            phoneHash,
            wallet.address,
            pinHash
        );

        const receipt = await tx.wait();

        console.log(`[Wallet] Registered new wallet: ${wallet.address}`);
        console.log(`[Wallet] Transaction hash: ${receipt.hash}`);

        return {
            address: wallet.address,
            txHash: receipt.hash
        };

    } catch (error) {
        console.error('[Wallet] Creation failed:', error);
        throw error;
    }
}

/**
 * Get wallet for a phone hash
 * @param {string} phoneHash - Hashed phone number
 * @returns {Object|null} Wallet info
 */
function getWallet(phoneHash) {
    return walletStore.get(phoneHash) || null;
}

/**
 * Get wallet signer for transactions
 * @param {string} phoneHash - Hashed phone number
 * @returns {ethers.Wallet} Wallet signer
 */
function getWalletSigner(phoneHash) {
    const walletInfo = walletStore.get(phoneHash);
    
    if (!walletInfo) {
        throw new Error('Wallet not found');
    }

    const provider = blockchainService.getProvider();
    return new ethers.Wallet(walletInfo.encryptedKey, provider);
}

/**
 * Sign a message with user's wallet
 * @param {string} phoneHash - Hashed phone number
 * @param {string} message - Message to sign
 * @returns {string} Signature
 */
async function signMessage(phoneHash, message) {
    const walletSigner = getWalletSigner(phoneHash);
    return await walletSigner.signMessage(message);
}

/**
 * Sign and send a transaction
 * @param {string} phoneHash - Hashed phone number
 * @param {Object} txRequest - Transaction request
 * @returns {Object} Transaction receipt
 */
async function sendTransaction(phoneHash, txRequest) {
    const walletSigner = getWalletSigner(phoneHash);
    
    const tx = await walletSigner.sendTransaction(txRequest);
    const receipt = await tx.wait();
    
    return receipt;
}

/**
 * Update user's PIN
 * @param {string} phoneHash - Hashed phone number
 * @param {string} oldPin - Current PIN
 * @param {string} newPin - New PIN
 * @returns {boolean} Success status
 */
async function updatePin(phoneHash, oldPin, newPin) {
    // Verify old PIN first
    const oldPinHash = hashPin(phoneHash, oldPin);
    const isValid = await blockchainService.verifyPin(phoneHash, oldPin);
    
    if (!isValid) {
        throw new Error('Invalid current PIN');
    }

    const newPinHash = hashPin(phoneHash, newPin);

    // Update on-chain
    const signer = blockchainService.getSigner();
    const walletRegistryAddress = process.env.WALLET_REGISTRY_ADDRESS;
    
    const WALLET_REGISTRY_ABI = require('../abis/WalletRegistry.json');
    const walletRegistry = new ethers.Contract(
        walletRegistryAddress,
        WALLET_REGISTRY_ABI,
        signer
    );

    const tx = await walletRegistry.updatePin(phoneHash, newPinHash);
    await tx.wait();

    return true;
}

/**
 * Recover wallet (would require additional verification in production)
 * @param {string} phoneHash - Hashed phone number
 * @param {string} newPin - New PIN after recovery
 * @returns {Object} Recovery result
 */
async function recoverWallet(phoneHash, newPin) {
    // In production, this would involve:
    // 1. SMS/voice verification
    // 2. KYC document verification
    // 3. Waiting period
    // 4. Multi-factor authentication
    
    throw new Error('Wallet recovery not implemented in tutorial');
}

module.exports = {
    createAndRegisterWallet,
    getWallet,
    getWalletSigner,
    signMessage,
    sendTransaction,
    updatePin,
    recoverWallet
};

