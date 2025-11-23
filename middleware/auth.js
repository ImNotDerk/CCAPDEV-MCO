const User = require('../models/users.js');

/**
 * Authentication Middleware
 * Protects routes by ensuring user is logged in
 */
async function requireAuth(req, res, next) {
    try {
        // Check if session exists
        if (!req.session || !req.session.userId) {
            return res.redirect('/?error=session&details=Please log in to access this page');
        }

        // Verify user exists in database
        const user = await User.findById(req.session.userId).lean();
        if (!user) {
            req.session.destroy();
            return res.redirect('/?error=session&details=Your session is invalid. Please log in again');
        }

        // Attach user to request object for use in routes
        req.user = user;
        next();
    } catch (error) {
        // Fail securely - default to access denied
        console.error('Authentication error:', error);
        req.session.destroy();
        return res.redirect('/?error=server&details=An error occurred. Please try again');
    }
}

/**
 * Authorization Middleware
 * Checks if user has required role
 */
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        try {
            // First check authentication
            if (!req.user) {
                return res.redirect('/?error=session&details=Please log in to access this page');
            }

            // Support both new and legacy role names
            const userRole = req.user.accountType || (req.user._legacyRole === 'ADMIN' ? 'ADMINISTRATOR' : 'ROLE_B');
            
            // Map legacy roles to new roles for comparison
            const mappedAllowedRoles = allowedRoles.map(role => {
                if (role === 'ADMIN') return 'ADMINISTRATOR';
                if (role === 'STUDENT') return 'ROLE_B';
                return role;
            });
            
            // Check if user's role is allowed
            if (!mappedAllowedRoles.includes(userRole) && !allowedRoles.includes(userRole)) {
                // Log access control failure
                const logger = require('../utils/logger');
                logger.logAccessControl(req.user.id, req.path, `Role ${userRole} not in allowed roles: ${allowedRoles.join(', ')}`);
                return res.status(403).render('403', {
                    layout: 'editprofile',
                    title: 'Access Denied',
                    user: req.user,
                    message: 'You do not have permission to access this resource.'
                });
            }

            next();
        } catch (error) {
            // Fail securely - default to access denied
            console.error('Authorization error:', error);
            return res.status(403).render('403', {
                layout: 'editprofile',
                title: 'Access Denied',
                message: 'An error occurred while checking permissions.'
            });
        }
    };
}

/**
 * Optional Auth - Attach user if logged in, but don't require it
 */
async function optionalAuth(req, res, next) {
    try {
        if (req.session && req.session.userId) {
            const user = await User.findById(req.session.userId).lean();
            if (user) {
                req.user = user;
            }
        }
        next();
    } catch (error) {
        // Continue even if error - this is optional auth
        next();
    }
}

module.exports = {
    requireAuth,
    requireRole,
    optionalAuth
};

