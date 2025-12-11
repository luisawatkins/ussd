/**
 * USSD Menu Handler
 * 
 * Implements the USSD menu flow and navigation logic.
 * Handles user input and routes to appropriate blockchain operations.
 */

const sessionManager = require('../services/session');
const blockchainService = require('../services/blockchain');
const walletService = require('../services/wallet');
const { formatBalance, formatTransaction, hashPhoneNumber } = require('../utils/formatter');

// Menu states
const MENU_STATES = {
    MAIN: 'main',
    CHECK_BALANCE: 'check_balance',
    SEND_MONEY: 'send_money',
    SEND_RECIPIENT: 'send_recipient',
    SEND_AMOUNT: 'send_amount',
    SEND_CONFIRM: 'send_confirm',
    SEND_PIN: 'send_pin',
    REQUEST_LOAN: 'request_loan',
    LOAN_AMOUNT: 'loan_amount',
    LOAN_DURATION: 'loan_duration',
    LOAN_CONFIRM: 'loan_confirm',
    LOAN_PIN: 'loan_pin',
    REPAY_LOAN: 'repay_loan',
    REPAY_CONFIRM: 'repay_confirm',
    REPAY_PIN: 'repay_pin',
    TRANSACTION_HISTORY: 'transaction_history',
    REGISTER: 'register',
    REGISTER_PIN: 'register_pin',
    REGISTER_CONFIRM_PIN: 'register_confirm_pin',
};

/**
 * Main USSD request handler
 * @param {Object} params - USSD request parameters
 * @returns {string} - USSD response (CON or END prefixed)
 */
async function handleUSSDRequest({ sessionId, phoneNumber, text }) {
    // Get or create session
    let session = sessionManager.getSession(sessionId);
    if (!session) {
        session = sessionManager.createSession(sessionId, phoneNumber);
    }

    // Parse user input
    const inputs = text ? text.split('*') : [];
    const currentInput = inputs[inputs.length - 1] || '';

    try {
        // Check if user is registered
        const phoneHash = hashPhoneNumber(phoneNumber);
        const isRegistered = await blockchainService.checkRegistration(phoneHash);

        // Route to appropriate handler based on session state and input
        if (text === '') {
            // Initial menu
            return showMainMenu(isRegistered);
        }

        // Process based on current menu path
        return await processMenuSelection(session, inputs, phoneNumber, isRegistered);

    } catch (error) {
        console.error('[MenuHandler] Error:', error);
        return 'END Service temporarily unavailable. Please try again later.';
    }
}

/**
 * Show main menu
 */
function showMainMenu(isRegistered) {
    if (isRegistered) {
        return `CON Welcome to RSK DeFi
        
1. Check Balance
2. Send Money
3. Request Loan
4. Repay Loan
5. Transaction History
6. My Account`;
    } else {
        return `CON Welcome to RSK DeFi

You are not registered.

1. Register Now
0. Exit`;
    }
}

/**
 * Process menu selection based on input path
 */
async function processMenuSelection(session, inputs, phoneNumber, isRegistered) {
    const phoneHash = hashPhoneNumber(phoneNumber);
    const firstInput = inputs[0];

    // Handle unregistered users
    if (!isRegistered) {
        return await handleRegistration(session, inputs, phoneNumber, phoneHash);
    }

    // Route based on first menu selection
    switch (firstInput) {
        case '1':
            return await handleCheckBalance(phoneHash);
        
        case '2':
            return await handleSendMoney(session, inputs, phoneNumber, phoneHash);
        
        case '3':
            return await handleRequestLoan(session, inputs, phoneHash);
        
        case '4':
            return await handleRepayLoan(session, inputs, phoneHash);
        
        case '5':
            return await handleTransactionHistory(phoneHash);
        
        case '6':
            return await handleMyAccount(phoneHash);
        
        default:
            return 'END Invalid selection. Please try again.';
    }
}

/**
 * Handle balance check
 */
async function handleCheckBalance(phoneHash) {
    try {
        const balance = await blockchainService.getBalance(phoneHash);
        const formattedBalance = formatBalance(balance);
        
        return `END Your Balance:
${formattedBalance} RBTC

(≈ $${(parseFloat(formattedBalance) * 30000).toFixed(2)} USD)`;
    } catch (error) {
        console.error('[CheckBalance] Error:', error);
        return 'END Unable to fetch balance. Please try again.';
    }
}

/**
 * Handle send money flow
 */
async function handleSendMoney(session, inputs, phoneNumber, phoneHash) {
    const step = inputs.length;

    switch (step) {
        case 1:
            // Ask for recipient phone number
            session.state = MENU_STATES.SEND_RECIPIENT;
            return `CON Send Money

Enter recipient phone number:
(e.g., +254712345678)`;

        case 2:
            // Validate recipient and ask for amount
            const recipientPhone = inputs[1];
            
            // Basic phone validation
            if (!recipientPhone.match(/^\+?\d{10,15}$/)) {
                return 'END Invalid phone number format. Please try again.';
            }

            const recipientHash = hashPhoneNumber(recipientPhone);
            const recipientRegistered = await blockchainService.checkRegistration(recipientHash);
            
            if (!recipientRegistered) {
                return 'END Recipient is not registered on RSK DeFi.';
            }

            session.data.recipientPhone = recipientPhone;
            session.data.recipientHash = recipientHash;
            session.state = MENU_STATES.SEND_AMOUNT;
            
            return `CON Enter amount to send (RBTC):
(e.g., 0.001)

Your balance: ${formatBalance(await blockchainService.getBalance(phoneHash))} RBTC`;

        case 3:
            // Validate amount and show confirmation
            const amount = parseFloat(inputs[2]);
            
            if (isNaN(amount) || amount <= 0) {
                return 'END Invalid amount. Please try again.';
            }

            const balance = await blockchainService.getBalance(phoneHash);
            const fee = await blockchainService.calculateTransferFee(amount);
            const totalRequired = amount + fee;

            if (totalRequired > parseFloat(balance)) {
                return `END Insufficient balance.
Required: ${totalRequired.toFixed(6)} RBTC
Available: ${formatBalance(balance)} RBTC`;
            }

            session.data.amount = amount;
            session.data.fee = fee;
            session.state = MENU_STATES.SEND_CONFIRM;

            return `CON Confirm Transfer:
To: ${session.data.recipientPhone}
Amount: ${amount} RBTC
Fee: ${fee.toFixed(6)} RBTC
Total: ${totalRequired.toFixed(6)} RBTC

1. Confirm
2. Cancel`;

        case 4:
            // Handle confirmation
            if (inputs[3] !== '1') {
                return 'END Transaction cancelled.';
            }
            
            session.state = MENU_STATES.SEND_PIN;
            return 'CON Enter your 4-digit PIN:';

        case 5:
            // Verify PIN and execute transfer
            const pin = inputs[4];
            
            if (!pin.match(/^\d{4}$/)) {
                return 'END Invalid PIN format.';
            }

            // Verify PIN
            const pinValid = await blockchainService.verifyPin(phoneHash, pin);
            if (!pinValid) {
                return 'END Incorrect PIN. Transaction cancelled.';
            }

            // Execute transfer
            try {
                const txHash = await blockchainService.executeTransfer(
                    phoneHash,
                    session.data.recipientHash,
                    session.data.amount
                );

                return `END Transfer Successful!

Amount: ${session.data.amount} RBTC
To: ${session.data.recipientPhone}
Fee: ${session.data.fee.toFixed(6)} RBTC

Tx: ${txHash.substring(0, 10)}...`;
            } catch (error) {
                console.error('[Transfer] Error:', error);
                return 'END Transfer failed. Please try again.';
            }

        default:
            return 'END Session error. Please start over.';
    }
}

/**
 * Handle loan request flow
 */
async function handleRequestLoan(session, inputs, phoneHash) {
    const step = inputs.length;

    switch (step) {
        case 1:
            // Check eligibility first
            const { eligible, reason } = await blockchainService.checkLoanEligibility(phoneHash);
            
            if (!eligible) {
                return `END Cannot request loan:
${reason}`;
            }

            session.state = MENU_STATES.LOAN_AMOUNT;
            return `CON Request Micro-Loan

Enter loan amount (RBTC):
Min: 0.001 RBTC
Max: 0.1 RBTC`;

        case 2:
            // Validate amount and ask for duration
            const amount = parseFloat(inputs[1]);
            
            if (isNaN(amount) || amount < 0.001 || amount > 0.1) {
                return 'END Invalid amount. Must be between 0.001 and 0.1 RBTC.';
            }

            session.data.loanAmount = amount;
            session.state = MENU_STATES.LOAN_DURATION;

            return `CON Select loan duration:

1. 7 days
2. 14 days
3. 30 days`;

        case 3:
            // Calculate loan terms and show confirmation
            const durationOption = inputs[2];
            let duration;
            
            switch (durationOption) {
                case '1': duration = 7 * 24 * 60 * 60; break;
                case '2': duration = 14 * 24 * 60 * 60; break;
                case '3': duration = 30 * 24 * 60 * 60; break;
                default: return 'END Invalid selection.';
            }

            session.data.duration = duration;

            // Get loan quote
            const quote = await blockchainService.getLoanQuote(
                session.data.loanAmount,
                duration
            );

            session.data.collateral = quote.requiredCollateral;
            session.data.totalDue = quote.totalDue;
            session.data.interest = quote.interest;

            return `CON Loan Terms:
Amount: ${session.data.loanAmount} RBTC
Duration: ${duration / (24 * 60 * 60)} days
Interest: ${quote.interest.toFixed(6)} RBTC
Total Due: ${quote.totalDue.toFixed(6)} RBTC
Collateral: ${quote.requiredCollateral.toFixed(4)} RBTC

1. Accept & Continue
2. Cancel`;

        case 4:
            if (inputs[3] !== '1') {
                return 'END Loan request cancelled.';
            }

            session.state = MENU_STATES.LOAN_PIN;
            return 'CON Enter your 4-digit PIN to confirm:';

        case 5:
            const pin = inputs[4];
            
            if (!pin.match(/^\d{4}$/)) {
                return 'END Invalid PIN format.';
            }

            const pinValid = await blockchainService.verifyPin(phoneHash, pin);
            if (!pinValid) {
                return 'END Incorrect PIN. Loan request cancelled.';
            }

            try {
                const loanResult = await blockchainService.requestLoan(
                    phoneHash,
                    session.data.loanAmount,
                    session.data.duration,
                    session.data.collateral
                );

                return `END Loan Approved!

Amount: ${session.data.loanAmount} RBTC
Due Date: ${new Date(Date.now() + session.data.duration * 1000).toLocaleDateString()}
Total Due: ${session.data.totalDue.toFixed(6)} RBTC

Funds sent to your wallet.`;
            } catch (error) {
                console.error('[Loan] Error:', error);
                return 'END Loan request failed. Please try again.';
            }

        default:
            return 'END Session error. Please start over.';
    }
}

/**
 * Handle loan repayment flow
 */
async function handleRepayLoan(session, inputs, phoneHash) {
    const step = inputs.length;

    switch (step) {
        case 1:
            // Get active loan details
            const loanDetails = await blockchainService.getLoanDetails(phoneHash);
            
            if (!loanDetails || loanDetails.status !== 'Active') {
                return 'END You have no active loans.';
            }

            session.data.loanDetails = loanDetails;

            return `CON Active Loan:
Principal: ${formatBalance(loanDetails.principal)} RBTC
Total Due: ${formatBalance(loanDetails.totalDue)} RBTC
Remaining: ${formatBalance(loanDetails.remainingDue)} RBTC
Due Date: ${new Date(loanDetails.dueDate * 1000).toLocaleDateString()}

1. Repay Full Amount
2. Cancel`;

        case 2:
            if (inputs[1] !== '1') {
                return 'END Repayment cancelled.';
            }

            session.state = MENU_STATES.REPAY_PIN;
            return 'CON Enter your 4-digit PIN to repay:';

        case 3:
            const pin = inputs[2];
            
            if (!pin.match(/^\d{4}$/)) {
                return 'END Invalid PIN format.';
            }

            const pinValid = await blockchainService.verifyPin(phoneHash, pin);
            if (!pinValid) {
                return 'END Incorrect PIN. Repayment cancelled.';
            }

            try {
                await blockchainService.repayLoan(
                    phoneHash,
                    session.data.loanDetails.remainingDue
                );

                return `END Loan Repaid Successfully!

Amount Paid: ${formatBalance(session.data.loanDetails.remainingDue)} RBTC
Collateral returned to your wallet.

Thank you!`;
            } catch (error) {
                console.error('[Repay] Error:', error);
                return 'END Repayment failed. Please try again.';
            }

        default:
            return 'END Session error. Please start over.';
    }
}

/**
 * Handle transaction history
 */
async function handleTransactionHistory(phoneHash) {
    try {
        const transactions = await blockchainService.getTransactionHistory(phoneHash, 5);
        
        if (!transactions || transactions.length === 0) {
            return 'END No transactions found.';
        }

        let response = 'END Recent Transactions:\n\n';
        
        transactions.forEach((tx, index) => {
            const direction = tx.fromPhoneHash === phoneHash ? 'SENT' : 'RECV';
            const amount = formatBalance(tx.amount);
            const date = new Date(tx.timestamp * 1000).toLocaleDateString();
            
            response += `${index + 1}. ${direction} ${amount} RBTC (${date})\n`;
        });

        return response;
    } catch (error) {
        console.error('[History] Error:', error);
        return 'END Unable to fetch transactions.';
    }
}

/**
 * Handle my account menu
 */
async function handleMyAccount(phoneHash) {
    try {
        const balance = await blockchainService.getBalance(phoneHash);
        const wallet = await blockchainService.getWalletAddress(phoneHash);
        
        return `END My Account

Balance: ${formatBalance(balance)} RBTC
Wallet: ${wallet.substring(0, 10)}...${wallet.substring(38)}

To change PIN, dial *384*123*77#`;
    } catch (error) {
        console.error('[Account] Error:', error);
        return 'END Unable to fetch account details.';
    }
}

/**
 * Handle user registration flow
 */
async function handleRegistration(session, inputs, phoneNumber, phoneHash) {
    const step = inputs.length;

    switch (step) {
        case 1:
            if (inputs[0] === '0') {
                return 'END Thank you for using RSK DeFi. Goodbye!';
            }
            if (inputs[0] !== '1') {
                return 'END Invalid selection.';
            }
            
            session.state = MENU_STATES.REGISTER_PIN;
            return `CON Registration

Create a 4-digit PIN:
(This PIN secures your account)`;

        case 2:
            const pin = inputs[1];
            
            if (!pin.match(/^\d{4}$/)) {
                return 'END PIN must be exactly 4 digits.';
            }

            session.data.pin = pin;
            session.state = MENU_STATES.REGISTER_CONFIRM_PIN;
            return 'CON Confirm your 4-digit PIN:';

        case 3:
            const confirmPin = inputs[2];
            
            if (confirmPin !== session.data.pin) {
                return 'END PINs do not match. Please try again.';
            }

            try {
                // Create wallet and register
                const result = await walletService.createAndRegisterWallet(
                    phoneHash,
                    session.data.pin
                );

                return `END Registration Successful!

Your RSK DeFi account is ready.
Wallet: ${result.address.substring(0, 10)}...

Dial *384*123# to access your account.`;
            } catch (error) {
                console.error('[Registration] Error:', error);
                return 'END Registration failed. Please try again.';
            }

        default:
            return 'END Invalid input. Please try again.';
    }
}

module.exports = {
    handleUSSDRequest,
    MENU_STATES
};

