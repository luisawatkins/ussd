/**
 * USSD Route Handler
 * 
 * Handles incoming USSD requests from Africa's Talking gateway.
 * Routes requests to appropriate menu handlers based on user input.
 */

const express = require('express');
const router = express.Router();
const { handleUSSDRequest } = require('../handlers/menuHandler');
const { validateUSSDRequest } = require('../middleware/validation');

/**
 * USSD Callback Endpoint
 * 
 * Africa's Talking sends POST requests here with:
 * - sessionId: Unique session identifier
 * - phoneNumber: User's phone number
 * - serviceCode: USSD short code
 * - text: User's cumulative input (separated by *)
 * - networkCode: Telecom network identifier
 */
router.post('/', validateUSSDRequest, async (req, res) => {
    const { sessionId, phoneNumber, serviceCode, text, networkCode } = req.body;

    console.log(`[USSD] Session: ${sessionId}, Phone: ${phoneNumber}, Input: "${text}"`);

    try {
        // Process the USSD request
        const response = await handleUSSDRequest({
            sessionId,
            phoneNumber,
            serviceCode,
            text: text || '',
            networkCode
        });

        // Send response with correct content type
        res.set('Content-Type', 'text/plain');
        res.send(response);

    } catch (error) {
        console.error('[USSD] Error processing request:', error);
        
        // Send user-friendly error message
        res.set('Content-Type', 'text/plain');
        res.send('END An error occurred. Please try again later.');
    }
});

/**
 * USSD Notification Endpoint
 * 
 * Receives session end notifications from Africa's Talking
 */
router.post('/notification', async (req, res) => {
    const {
        sessionId,
        phoneNumber,
        status,
        cost,
        durationInMillis,
        hopsCount,
        input,
        lastAppResponse,
        errorMessage
    } = req.body;

    console.log(`[USSD Notification] Session: ${sessionId}, Status: ${status}`);

    // Log session analytics
    if (status === 'Success') {
        console.log(`[Analytics] Completed session - Duration: ${durationInMillis}ms, Hops: ${hopsCount}`);
    } else if (status === 'Failed') {
        console.error(`[Analytics] Failed session - Error: ${errorMessage}`);
    }

    // Acknowledge receipt
    res.status(200).send('OK');
});

module.exports = router;

