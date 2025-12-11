/**
 * Internal API Routes
 * 
 * Provides REST API endpoints for administrative and monitoring purposes.
 */

const express = require('express');
const router = express.Router();
const { validateAPIRequest } = require('../middleware/validation');
const blockchainService = require('../services/blockchain');
const sessionManager = require('../services/session');
const { hashPhoneNumber } = require('../utils/crypto');

/**
 * Get balance for a phone number
 * GET /api/balance/:phoneNumber
 */
router.get('/balance/:phoneNumber', validateAPIRequest, async (req, res) => {
    try {
        const { phoneNumber } = req.params;
        const phoneHash = hashPhoneNumber(phoneNumber);
        
        const isRegistered = await blockchainService.checkRegistration(phoneHash);
        
        if (!isRegistered) {
            return res.status(404).json({ error: 'Phone number not registered' });
        }

        const balance = await blockchainService.getBalance(phoneHash);
        const wallet = await blockchainService.getWalletAddress(phoneHash);

        res.json({
            phoneNumber,
            wallet,
            balance,
            unit: 'RBTC'
        });

    } catch (error) {
        console.error('[API] Balance error:', error);
        res.status(500).json({ error: 'Failed to fetch balance' });
    }
});

/**
 * Get transaction history
 * GET /api/transactions/:phoneNumber
 */
router.get('/transactions/:phoneNumber', validateAPIRequest, async (req, res) => {
    try {
        const { phoneNumber } = req.params;
        const limit = parseInt(req.query.limit) || 10;
        
        const phoneHash = hashPhoneNumber(phoneNumber);
        
        const transactions = await blockchainService.getTransactionHistory(phoneHash, limit);

        res.json({
            phoneNumber,
            transactions,
            count: transactions.length
        });

    } catch (error) {
        console.error('[API] Transactions error:', error);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

/**
 * Get loan details
 * GET /api/loan/:phoneNumber
 */
router.get('/loan/:phoneNumber', validateAPIRequest, async (req, res) => {
    try {
        const { phoneNumber } = req.params;
        const phoneHash = hashPhoneNumber(phoneNumber);
        
        const loanDetails = await blockchainService.getLoanDetails(phoneHash);

        if (!loanDetails) {
            return res.status(404).json({ error: 'No loan found' });
        }

        res.json({
            phoneNumber,
            loan: loanDetails
        });

    } catch (error) {
        console.error('[API] Loan error:', error);
        res.status(500).json({ error: 'Failed to fetch loan details' });
    }
});

/**
 * Check registration status
 * GET /api/check/:phoneNumber
 */
router.get('/check/:phoneNumber', validateAPIRequest, async (req, res) => {
    try {
        const { phoneNumber } = req.params;
        const phoneHash = hashPhoneNumber(phoneNumber);
        
        const isRegistered = await blockchainService.checkRegistration(phoneHash);

        res.json({
            phoneNumber,
            registered: isRegistered
        });

    } catch (error) {
        console.error('[API] Check error:', error);
        res.status(500).json({ error: 'Failed to check registration' });
    }
});

/**
 * Get loan quote
 * GET /api/loan-quote
 */
router.get('/loan-quote', validateAPIRequest, async (req, res) => {
    try {
        const { amount, duration } = req.query;
        
        if (!amount || !duration) {
            return res.status(400).json({ error: 'Amount and duration required' });
        }

        const quote = await blockchainService.getLoanQuote(
            parseFloat(amount),
            parseInt(duration)
        );

        res.json({
            principal: parseFloat(amount),
            duration: parseInt(duration),
            ...quote
        });

    } catch (error) {
        console.error('[API] Quote error:', error);
        res.status(500).json({ error: 'Failed to calculate quote' });
    }
});

/**
 * Get session statistics
 * GET /api/stats/sessions
 */
router.get('/stats/sessions', validateAPIRequest, (req, res) => {
    const stats = sessionManager.getStats();
    res.json(stats);
});

/**
 * Get system status
 * GET /api/status
 */
router.get('/status', async (req, res) => {
    try {
        const gasPrice = await blockchainService.getGasPrice();
        
        res.json({
            status: 'operational',
            timestamp: new Date().toISOString(),
            blockchain: {
                connected: true,
                gasPrice: `${gasPrice} gwei`
            },
            sessions: sessionManager.getStats()
        });

    } catch (error) {
        res.json({
            status: 'degraded',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

/**
 * Get transfer fee
 * GET /api/fee
 */
router.get('/fee', validateAPIRequest, async (req, res) => {
    try {
        const { amount } = req.query;
        
        if (!amount) {
            return res.status(400).json({ error: 'Amount required' });
        }

        const fee = await blockchainService.calculateTransferFee(parseFloat(amount));

        res.json({
            amount: parseFloat(amount),
            fee,
            total: parseFloat(amount) + fee,
            unit: 'RBTC'
        });

    } catch (error) {
        console.error('[API] Fee error:', error);
        res.status(500).json({ error: 'Failed to calculate fee' });
    }
});

module.exports = router;

