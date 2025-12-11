/**
 * USSD DeFi on RSK - Backend Server
 * 
 * This server handles USSD requests from Africa's Talking gateway
 * and bridges them to the Rootstock blockchain.
 */

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');

// Import routes
const ussdRoutes = require('./routes/ussd');
const apiRoutes = require('./routes/api');

// Import services
const { initializeBlockchain } = require('./services/blockchain');

const app = express();
const PORT = process.env.PORT || 3000;

// ============ Middleware ============

// Security headers
app.use(helmet());

// CORS configuration
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    methods: ['GET', 'POST'],
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Body parsing
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
});

// ============ Routes ============

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// USSD callback endpoint (Africa's Talking)
app.use('/ussd', ussdRoutes);

// Internal API endpoints
app.use('/api', apiRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ============ Server Startup ============

async function startServer() {
    try {
        // Initialize blockchain connection
        console.log('Initializing blockchain connection...');
        await initializeBlockchain();
        console.log('✓ Blockchain connection established');

        // Start server
        app.listen(PORT, () => {
            console.log(`
╔══════════════════════════════════════════════════╗
║     USSD DeFi on RSK - Backend Server            ║
╠══════════════════════════════════════════════════╣
║  Server running on port ${PORT}                     ║
║  Environment: ${process.env.NODE_ENV || 'development'}                    ║
║  USSD Endpoint: /ussd                            ║
║  API Endpoint: /api                              ║
╚══════════════════════════════════════════════════╝
            `);
        });

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

module.exports = app;

