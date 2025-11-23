/**
 * Input Validation Middleware
 * Rejects invalid input rather than sanitizing
 */

/**
 * Validate string length
 */
function validateLength(field, min, max) {
    return (req, res, next) => {
        const value = req.body[field] || req.query[field];
        if (value !== undefined && value !== null) {
            if (typeof value !== 'string') {
                return res.status(400).json({ 
                    error: 'Invalid input',
                    message: `${field} must be a string`
                });
            }
            if (value.length < min || value.length > max) {
                return res.status(400).json({ 
                    error: 'Invalid input',
                    message: `${field} must be between ${min} and ${max} characters`
                });
            }
        }
        next();
    };
}

/**
 * Validate numeric range
 */
function validateRange(field, min, max) {
    return (req, res, next) => {
        const value = req.body[field] || req.query[field];
        if (value !== undefined && value !== null) {
            const num = Number(value);
            if (isNaN(num)) {
                return res.status(400).json({ 
                    error: 'Invalid input',
                    message: `${field} must be a number`
                });
            }
            if (num < min || num > max) {
                return res.status(400).json({ 
                    error: 'Invalid input',
                    message: `${field} must be between ${min} and ${max}`
                });
            }
        }
        next();
    };
}

/**
 * Validate email format
 */
function validateEmail(field = 'email') {
    return (req, res, next) => {
        const value = req.body[field];
        if (value !== undefined && value !== null) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(value)) {
                return res.status(400).json({ 
                    error: 'Invalid input',
                    message: `${field} must be a valid email address`
                });
            }
        }
        next();
    };
}

/**
 * Validate allowed characters (alphanumeric and specified special chars)
 */
function validateChars(field, allowedPattern) {
    return (req, res, next) => {
        const value = req.body[field] || req.query[field];
        if (value !== undefined && value !== null) {
            const regex = new RegExp(allowedPattern);
            if (!regex.test(value)) {
                return res.status(400).json({ 
                    error: 'Invalid input',
                    message: `${field} contains invalid characters`
                });
            }
        }
        next();
    };
}

/**
 * Validate required fields
 */
function validateRequired(...fields) {
    return (req, res, next) => {
        const missing = fields.filter(field => {
            const value = req.body[field];
            return value === undefined || value === null || value === '';
        });
        
        if (missing.length > 0) {
            return res.status(400).json({ 
                error: 'Invalid input',
                message: `Missing required fields: ${missing.join(', ')}`
            });
        }
        next();
    };
}

module.exports = {
    validateLength,
    validateRange,
    validateEmail,
    validateChars,
    validateRequired
};

