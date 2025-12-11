/**
 * Formatter Utilities
 * 
 * Handles formatting of data for USSD display.
 * USSD has limited character display, so formatting is crucial.
 */

const { hashPhoneNumber } = require('./crypto');

// Re-export for convenience
module.exports.hashPhoneNumber = hashPhoneNumber;

/**
 * Format balance for display
 * @param {string|number} balance - Balance in RBTC
 * @returns {string} Formatted balance
 */
function formatBalance(balance) {
    const num = parseFloat(balance);
    
    if (isNaN(num)) return '0.000000';
    
    // Show more decimals for small amounts
    if (num < 0.001) {
        return num.toFixed(8);
    } else if (num < 1) {
        return num.toFixed(6);
    } else if (num < 100) {
        return num.toFixed(4);
    } else {
        return num.toFixed(2);
    }
}

/**
 * Format transaction for USSD display
 * @param {Object} tx - Transaction object
 * @param {string} userPhoneHash - User's phone hash for direction
 * @returns {string} Formatted transaction string
 */
function formatTransaction(tx, userPhoneHash) {
    const direction = tx.fromPhoneHash === userPhoneHash ? '↑ SENT' : '↓ RECV';
    const amount = formatBalance(tx.amount);
    const date = formatDate(tx.timestamp);
    
    return `${direction} ${amount} RBTC\n${date}`;
}

/**
 * Format date for USSD display
 * @param {number} timestamp - Unix timestamp (seconds)
 * @returns {string} Formatted date string
 */
function formatDate(timestamp) {
    const date = new Date(timestamp * 1000);
    
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear().toString().slice(-2);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Format phone number for display (masked)
 * @param {string} phoneNumber - Full phone number
 * @returns {string} Masked phone number
 */
function formatPhoneNumber(phoneNumber) {
    if (!phoneNumber || phoneNumber.length < 6) {
        return phoneNumber;
    }
    
    // Show first 4 and last 3 digits
    const firstPart = phoneNumber.slice(0, 4);
    const lastPart = phoneNumber.slice(-3);
    const masked = '*'.repeat(phoneNumber.length - 7);
    
    return `${firstPart}${masked}${lastPart}`;
}

/**
 * Format wallet address for display
 * @param {string} address - Ethereum/RSK address
 * @returns {string} Shortened address
 */
function formatAddress(address) {
    if (!address || address.length < 10) {
        return address;
    }
    
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format RBTC amount with currency symbol
 * @param {string|number} amount - Amount in RBTC
 * @returns {string} Formatted amount with symbol
 */
function formatRBTC(amount) {
    return `${formatBalance(amount)} RBTC`;
}

/**
 * Format USD equivalent
 * @param {string|number} rbtcAmount - Amount in RBTC
 * @param {number} rbtcPrice - RBTC price in USD
 * @returns {string} USD equivalent
 */
function formatUSD(rbtcAmount, rbtcPrice = 30000) {
    const usd = parseFloat(rbtcAmount) * rbtcPrice;
    return `$${usd.toFixed(2)}`;
}

/**
 * Format duration for display
 * @param {number} seconds - Duration in seconds
 * @returns {string} Human readable duration
 */
function formatDuration(seconds) {
    const days = Math.floor(seconds / (24 * 60 * 60));
    const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
    
    if (days > 0) {
        return hours > 0 ? `${days}d ${hours}h` : `${days} days`;
    } else if (hours > 0) {
        return `${hours} hours`;
    } else {
        const minutes = Math.floor(seconds / 60);
        return `${minutes} min`;
    }
}

/**
 * Format percentage
 * @param {number} value - Value (e.g., 0.15 for 15%)
 * @param {number} decimals - Decimal places
 * @returns {string} Formatted percentage
 */
function formatPercentage(value, decimals = 1) {
    return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Truncate text for USSD display
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
function truncate(text, maxLength = 160) {
    if (!text || text.length <= maxLength) {
        return text;
    }
    
    return text.slice(0, maxLength - 3) + '...';
}

/**
 * Format loan terms for display
 * @param {Object} loan - Loan object
 * @returns {string} Formatted loan terms
 */
function formatLoanTerms(loan) {
    return [
        `Principal: ${formatRBTC(loan.principal)}`,
        `Interest: ${formatRBTC(loan.interest)}`,
        `Total Due: ${formatRBTC(loan.totalDue)}`,
        `Duration: ${formatDuration(loan.duration)}`,
        `Collateral: ${formatRBTC(loan.collateral)}`
    ].join('\n');
}

/**
 * Format error message for USSD
 * @param {Error|string} error - Error object or message
 * @returns {string} User-friendly error message
 */
function formatError(error) {
    const message = error.message || error.toString();
    
    // Map technical errors to user-friendly messages
    const errorMap = {
        'insufficient funds': 'Insufficient balance',
        'network error': 'Network error. Try again',
        'timeout': 'Request timed out',
        'invalid pin': 'Invalid PIN',
        'not registered': 'Account not registered',
        'already registered': 'Already registered',
        'loan exists': 'Active loan exists',
        'no loan': 'No active loan found'
    };
    
    const lowerMessage = message.toLowerCase();
    
    for (const [key, value] of Object.entries(errorMap)) {
        if (lowerMessage.includes(key)) {
            return value;
        }
    }
    
    return 'An error occurred. Please try again.';
}

/**
 * Build USSD menu string
 * @param {string} title - Menu title
 * @param {Array} options - Menu options
 * @param {boolean} isFinal - Whether this is the final menu (END vs CON)
 * @returns {string} Formatted USSD menu
 */
function buildMenu(title, options, isFinal = false) {
    const prefix = isFinal ? 'END' : 'CON';
    const optionsStr = options
        .map((opt, i) => `${i + 1}. ${opt}`)
        .join('\n');
    
    return `${prefix} ${title}\n\n${optionsStr}`;
}

/**
 * Build confirmation screen
 * @param {string} title - Title
 * @param {Object} details - Key-value pairs to display
 * @returns {string} Formatted confirmation screen
 */
function buildConfirmation(title, details) {
    const detailsStr = Object.entries(details)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
    
    return `CON ${title}\n\n${detailsStr}\n\n1. Confirm\n2. Cancel`;
}

module.exports = {
    formatBalance,
    formatTransaction,
    formatDate,
    formatPhoneNumber,
    formatAddress,
    formatRBTC,
    formatUSD,
    formatDuration,
    formatPercentage,
    truncate,
    formatLoanTerms,
    formatError,
    buildMenu,
    buildConfirmation,
    hashPhoneNumber
};

