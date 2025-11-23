const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../logs');

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Logger utility for security events
 * Logs are stored in files and can only be accessed by admins
 */
class Logger {
    constructor() {
        this.logFile = path.join(LOG_DIR, `security-${new Date().toISOString().split('T')[0]}.log`);
    }

    /**
     * Write log entry
     */
    writeLog(level, category, message, metadata = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            category,
            message,
            ...metadata
        };

        const logLine = JSON.stringify(logEntry) + '\n';
        
        // Append to log file
        fs.appendFileSync(this.logFile, logLine, 'utf8');
        
        // Also log to console in development
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[${level}] [${category}] ${message}`, metadata);
        }
    }

    /**
     * Log authentication events
     */
    logAuth(event, userId, success, details = {}) {
        this.writeLog('INFO', 'AUTHENTICATION', event, {
            userId: userId || 'unknown',
            success,
            ...details
        });
    }

    /**
     * Log validation failures
     */
    logValidation(field, value, reason, userId = null) {
        this.writeLog('WARN', 'VALIDATION', 'Validation failure', {
            field,
            value: typeof value === 'string' ? value.substring(0, 50) : value, // Truncate for security
            reason,
            userId: userId || 'anonymous'
        });
    }

    /**
     * Log access control failures
     */
    logAccessControl(userId, resource, reason) {
        this.writeLog('WARN', 'ACCESS_CONTROL', 'Access denied', {
            userId,
            resource,
            reason
        });
    }

    /**
     * Log account lockout
     */
    logLockout(userId, reason) {
        this.writeLog('WARN', 'ACCOUNT_LOCKOUT', 'Account locked', {
            userId,
            reason
        });
    }

    /**
     * Log password change
     */
    logPasswordChange(userId, success, reason = null) {
        this.writeLog('INFO', 'PASSWORD_CHANGE', 'Password change attempt', {
            userId,
            success,
            reason
        });
    }

    /**
     * Log password reset request
     */
    logPasswordReset(event, userId, success, details = {}) {
        this.writeLog('INFO', 'PASSWORD_RESET', event, {
            userId: userId || 'unknown',
            success,
            ...details
        });
    }
}

// Export singleton instance
module.exports = new Logger();

