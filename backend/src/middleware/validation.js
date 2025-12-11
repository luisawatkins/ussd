/**
 * Request Validation Middleware
 * 
 * Validates incoming USSD requests from Africa's Talking.
 */

/**
 * Validate USSD request from Africa's Talking
 */
function validateUSSDRequest(req, res, next) {
    const { sessionId, phoneNumber, serviceCode } = req.body;

    // Check required fields
    if (!sessionId) {
        console.error('[Validation] Missing sessionId');
        return res.status(400).send('END Invalid request: Missing session ID');
    }

    if (!phoneNumber) {
        console.error('[Validation] Missing phoneNumber');
        return res.status(400).send('END Invalid request: Missing phone number');
    }

    if (!serviceCode) {
        console.error('[Validation] Missing serviceCode');
        return res.status(400).send('END Invalid request: Missing service code');
    }

    // Validate phone number format
    const phoneRegex = /^\+?\d{10,15}$/;
    if (!phoneRegex.test(phoneNumber.replace(/\s/g, ''))) {
        console.error(`[Validation] Invalid phone format: ${phoneNumber}`);
        return res.status(400).send('END Invalid phone number format');
    }

    // Validate session ID format (alphanumeric)
    const sessionRegex = /^[a-zA-Z0-9\-_]+$/;
    if (!sessionRegex.test(sessionId)) {
        console.error(`[Validation] Invalid session format: ${sessionId}`);
        return res.status(400).send('END Invalid session');
    }

    // Validate text input (if present)
    if (req.body.text) {
        // USSD text may contain numbers, *, #, +, and decimal point
        const textRegex = /^[0-9*#\+\.]*$/;
        if (!textRegex.test(req.body.text)) {
            console.error(`[Validation] Invalid text input: ${req.body.text}`);
            return res.status(400).send('END Invalid input');
        }

        // Limit input length
        if (req.body.text.length > 182) { // USSD max is 182 characters
            console.error('[Validation] Input too long');
            return res.status(400).send('END Input too long');
        }
    }

    next();
}

/**
 * Validate API request with API key
 */
function validateAPIRequest(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
        return res.status(401).json({ error: 'API key required' });
    }

    // In production, validate against stored API keys
    const validApiKey = process.env.INTERNAL_API_KEY;
    
    if (apiKey !== validApiKey) {
        return res.status(403).json({ error: 'Invalid API key' });
    }

    next();
}

/**
 * Validate Africa's Talking webhook signature
 * (For production security)
 */
function validateATSignature(req, res, next) {
    // Africa's Talking signs webhook requests
    // In production, verify the signature here
    
    // For development, skip validation
    if (process.env.NODE_ENV === 'development') {
        return next();
    }

    const signature = req.headers['x-africastalking-signature'];
    
    if (!signature) {
        console.warn('[Validation] Missing AT signature');
        // In production, reject unsigned requests
        // return res.status(401).send('END Unauthorized');
    }

    // TODO: Implement signature verification
    // const isValid = verifyATSignature(req.body, signature);
    
    next();
}

/**
 * Rate limiting check (in addition to express-rate-limit)
 */
function checkRateLimit(req, res, next) {
    // Additional rate limiting logic can be implemented here
    // e.g., per-phone-number rate limiting
    
    next();
}

/**
 * Sanitize user input
 */
function sanitizeInput(req, res, next) {
    if (req.body.text) {
        // Remove any potentially harmful characters
        req.body.text = req.body.text.replace(/[<>'"]/g, '');
    }

    if (req.body.phoneNumber) {
        // Normalize phone number
        req.body.phoneNumber = req.body.phoneNumber.replace(/\s/g, '');
    }

    next();
}

module.exports = {
    validateUSSDRequest,
    validateAPIRequest,
    validateATSignature,
    checkRateLimit,
    sanitizeInput
};

