/**
 * Cryptographic Utilities
 * 
 * Handles hashing and encryption operations for the USSD DeFi system.
 */

const { ethers } = require('ethers');
const crypto = require('crypto');

// Salt for phone number hashing (in production, use environment variable)
const PHONE_SALT = process.env.PHONE_HASH_SALT || 'ussd-rsk-defi-salt-v1';

/**
 * Hash a phone number for on-chain storage
 * @param {string} phoneNumber - Phone number to hash
 * @returns {string} Keccak256 hash (bytes32)
 */
function hashPhoneNumber(phoneNumber) {
    // Normalize phone number (remove spaces, dashes, etc.)
    const normalized = normalizePhoneNumber(phoneNumber);
    
    // Create hash with salt
    const hash = ethers.keccak256(
        ethers.solidityPacked(
            ['string', 'string'],
            [normalized, PHONE_SALT]
        )
    );
    
    return hash;
}

/**
 * Normalize phone number format
 * @param {string} phoneNumber - Raw phone number
 * @returns {string} Normalized phone number
 */
function normalizePhoneNumber(phoneNumber) {
    // Remove all non-digit characters except leading +
    let normalized = phoneNumber.replace(/[^\d+]/g, '');
    
    // Ensure it starts with +
    if (!normalized.startsWith('+')) {
        // Assume it's a local number, add country code
        // This should be configurable based on deployment region
        normalized = '+' + normalized;
    }
    
    return normalized;
}

/**
 * Hash a PIN for on-chain storage
 * @param {string} phoneHash - Phone hash (for binding)
 * @param {string} pin - 4-digit PIN
 * @returns {string} Keccak256 hash (bytes32)
 */
function hashPin(phoneHash, pin) {
    // Bind PIN to phone hash to prevent rainbow table attacks
    const hash = ethers.keccak256(
        ethers.solidityPacked(
            ['bytes32', 'string'],
            [phoneHash, pin]
        )
    );
    
    return hash;
}

/**
 * Generate a random bytes32 value
 * @returns {string} Random bytes32
 */
function generateRandomBytes32() {
    const randomBytes = crypto.randomBytes(32);
    return '0x' + randomBytes.toString('hex');
}

/**
 * Generate a secure random PIN
 * @returns {string} 4-digit PIN
 */
function generateRandomPin() {
    const pin = crypto.randomInt(0, 10000);
    return pin.toString().padStart(4, '0');
}

/**
 * Encrypt data with AES-256-GCM
 * @param {string} data - Data to encrypt
 * @param {string} key - Encryption key
 * @returns {Object} Encrypted data with IV and auth tag
 */
function encrypt(data, key) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(
        'aes-256-gcm',
        Buffer.from(key, 'hex'),
        iv
    );
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
    };
}

/**
 * Decrypt data with AES-256-GCM
 * @param {Object} encryptedData - Object with encrypted, iv, and authTag
 * @param {string} key - Encryption key
 * @returns {string} Decrypted data
 */
function decrypt(encryptedData, key) {
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        Buffer.from(key, 'hex'),
        Buffer.from(encryptedData.iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
}

/**
 * Derive encryption key from password
 * @param {string} password - Password to derive from
 * @param {string} salt - Salt for derivation
 * @returns {string} Derived key (hex)
 */
function deriveKey(password, salt) {
    return crypto.pbkdf2Sync(
        password,
        salt,
        100000,
        32,
        'sha256'
    ).toString('hex');
}

/**
 * Verify HMAC signature
 * @param {string} data - Data that was signed
 * @param {string} signature - HMAC signature to verify
 * @param {string} key - Secret key
 * @returns {boolean} Whether signature is valid
 */
function verifyHmac(data, signature, key) {
    const expectedSignature = crypto
        .createHmac('sha256', key)
        .update(data)
        .digest('hex');
    
    return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
    );
}

/**
 * Create HMAC signature
 * @param {string} data - Data to sign
 * @param {string} key - Secret key
 * @returns {string} HMAC signature (hex)
 */
function createHmac(data, key) {
    return crypto
        .createHmac('sha256', key)
        .update(data)
        .digest('hex');
}

module.exports = {
    hashPhoneNumber,
    normalizePhoneNumber,
    hashPin,
    generateRandomBytes32,
    generateRandomPin,
    encrypt,
    decrypt,
    deriveKey,
    verifyHmac,
    createHmac
};

