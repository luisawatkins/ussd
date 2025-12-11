/**
 * Session Manager
 * 
 * Manages USSD sessions in memory.
 * Sessions are automatically cleaned up after expiration.
 */

// Session storage
const sessions = new Map();

// Session configuration
const SESSION_TIMEOUT = 180000; // 3 minutes (USSD sessions are short-lived)
const CLEANUP_INTERVAL = 60000; // Clean up every minute

/**
 * Session data structure
 */
class Session {
    constructor(sessionId, phoneNumber) {
        this.sessionId = sessionId;
        this.phoneNumber = phoneNumber;
        this.state = 'main';
        this.data = {};
        this.createdAt = Date.now();
        this.lastActivity = Date.now();
        this.menuPath = [];
    }

    /**
     * Update last activity timestamp
     */
    touch() {
        this.lastActivity = Date.now();
    }

    /**
     * Check if session has expired
     */
    isExpired() {
        return Date.now() - this.lastActivity > SESSION_TIMEOUT;
    }

    /**
     * Reset session to initial state
     */
    reset() {
        this.state = 'main';
        this.data = {};
        this.menuPath = [];
        this.touch();
    }
}

/**
 * Create a new session
 * @param {string} sessionId - Unique session ID from AT
 * @param {string} phoneNumber - User's phone number
 * @returns {Session} New session instance
 */
function createSession(sessionId, phoneNumber) {
    const session = new Session(sessionId, phoneNumber);
    sessions.set(sessionId, session);
    
    console.log(`[Session] Created: ${sessionId} for ${phoneNumber}`);
    return session;
}

/**
 * Get an existing session
 * @param {string} sessionId - Session ID to retrieve
 * @returns {Session|null} Session instance or null
 */
function getSession(sessionId) {
    const session = sessions.get(sessionId);
    
    if (session) {
        if (session.isExpired()) {
            deleteSession(sessionId);
            return null;
        }
        session.touch();
    }
    
    return session || null;
}

/**
 * Update session state
 * @param {string} sessionId - Session ID
 * @param {string} state - New state
 * @param {Object} data - Additional data to store
 */
function updateSession(sessionId, state, data = {}) {
    const session = sessions.get(sessionId);
    
    if (session) {
        session.state = state;
        session.data = { ...session.data, ...data };
        session.menuPath.push(state);
        session.touch();
    }
}

/**
 * Delete a session
 * @param {string} sessionId - Session ID to delete
 */
function deleteSession(sessionId) {
    const deleted = sessions.delete(sessionId);
    
    if (deleted) {
        console.log(`[Session] Deleted: ${sessionId}`);
    }
}

/**
 * Get session count
 * @returns {number} Number of active sessions
 */
function getSessionCount() {
    return sessions.size;
}

/**
 * Get session statistics
 * @returns {Object} Session statistics
 */
function getStats() {
    let activeCount = 0;
    let expiredCount = 0;
    
    for (const session of sessions.values()) {
        if (session.isExpired()) {
            expiredCount++;
        } else {
            activeCount++;
        }
    }
    
    return {
        total: sessions.size,
        active: activeCount,
        expired: expiredCount
    };
}

/**
 * Cleanup expired sessions
 */
function cleanupExpiredSessions() {
    let cleaned = 0;
    
    for (const [sessionId, session] of sessions.entries()) {
        if (session.isExpired()) {
            sessions.delete(sessionId);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        console.log(`[Session] Cleaned up ${cleaned} expired sessions`);
    }
}

// Start cleanup interval
const cleanupTimer = setInterval(cleanupExpiredSessions, CLEANUP_INTERVAL);

// Cleanup on process exit
process.on('exit', () => {
    clearInterval(cleanupTimer);
});

module.exports = {
    createSession,
    getSession,
    updateSession,
    deleteSession,
    getSessionCount,
    getStats,
    cleanupExpiredSessions,
    Session
};

