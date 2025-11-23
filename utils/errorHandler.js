const crypto = require('crypto');

/**
 * Error message obfuscation utility
 * Stores error messages in session and uses tokens in URLs
 */
class ErrorHandler {
    /**
     * Generate a secure random token for error messages
     */
    static generateToken() {
        return crypto.randomBytes(16).toString('hex');
    }

    /**
     * Store error message in session and return token
     */
    static setError(req, type, message) {
        if (!req.session) {
            req.session = {};
        }
        if (!req.session.errors) {
            req.session.errors = {};
        }

        const token = this.generateToken();
        req.session.errors[token] = {
            type: type,
            message: message,
            timestamp: Date.now()
        };

        // Clean up old errors (older than 5 minutes)
        this.cleanupErrors(req);

        return token;
    }

    /**
     * Get error message from session using token
     */
    static getError(req, token) {
        if (!req.session || !req.session.errors || !token) {
            return null;
        }

        const error = req.session.errors[token];
        if (!error) {
            return null;
        }

        // Check if error is expired (5 minutes)
        const age = Date.now() - error.timestamp;
        if (age > 5 * 60 * 1000) {
            delete req.session.errors[token];
            return null;
        }

        // Delete after reading (one-time use)
        delete req.session.errors[token];

        return {
            type: error.type,
            message: error.message
        };
    }

    /**
     * Clean up old error messages
     */
    static cleanupErrors(req) {
        if (!req.session || !req.session.errors) {
            return;
        }

        const now = Date.now();
        for (const token in req.session.errors) {
            const age = now - req.session.errors[token].timestamp;
            if (age > 5 * 60 * 1000) { // 5 minutes
                delete req.session.errors[token];
            }
        }
    }

    /**
     * Store success message in session and return token
     */
    static setSuccess(req, message) {
        if (!req.session) {
            req.session = {};
        }
        if (!req.session.messages) {
            req.session.messages = {};
        }

        const token = this.generateToken();
        req.session.messages[token] = {
            message: message,
            timestamp: Date.now()
        };

        // Clean up old messages
        this.cleanupMessages(req);

        return token;
    }

    /**
     * Get success message from session using token
     */
    static getSuccess(req, token) {
        if (!req.session || !req.session.messages || !token) {
            return null;
        }

        const message = req.session.messages[token];
        if (!message) {
            return null;
        }

        // Check if message is expired (5 minutes)
        const age = Date.now() - message.timestamp;
        if (age > 5 * 60 * 1000) {
            delete req.session.messages[token];
            return null;
        }

        // Delete after reading (one-time use)
        delete req.session.messages[token];

        return message.message;
    }

    /**
     * Clean up old success messages
     */
    static cleanupMessages(req) {
        if (!req.session || !req.session.messages) {
            return;
        }

        const now = Date.now();
        for (const token in req.session.messages) {
            const age = now - req.session.messages[token].timestamp;
            if (age > 5 * 60 * 1000) { // 5 minutes
                delete req.session.messages[token];
            }
        }
    }
}

module.exports = ErrorHandler;

