const User = require('../models/users.js');
const bcrypt = require('bcrypt');
const logger = require('../utils/logger');

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 30;

async function handleLogin(req, res) {
    try {
        const loginId = req.body.loginId;
        const password = req.body.loginPass;
        
        // Generic error message for security
        const genericError = 'Invalid username and/or password';
        
        if (!loginId || !password) {
            logger.logAuth('LOGIN_ATTEMPT', 'anonymous', false, { reason: 'Missing credentials' });
            return res.redirect('/LoginPage?error=invalid');
        }

        const user = await User.findOne({ id: loginId });
        
        if (!user) {
            logger.logAuth('LOGIN_ATTEMPT', loginId, false, { reason: 'User not found' });
            return res.redirect('/LoginPage?error=invalid');
        }

        // Check if account is locked
        if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
            const minutesLeft = Math.ceil((user.accountLockedUntil - new Date()) / 60000);
            logger.logAuth('LOGIN_ATTEMPT', user.id, false, { reason: 'Account locked', minutesLeft });
            return res.redirect(`/LoginPage?error=locked&details=${encodeURIComponent(`Account is locked. Please try again in ${minutesLeft} minute(s).`)}`);
        }

        // If lockout period has passed, reset it
        if (user.accountLockedUntil && user.accountLockedUntil <= new Date()) {
            user.accountLockedUntil = null;
            user.failedLoginAttempts = 0;
            await user.save();
        }

        const result = await bcrypt.compare(password, user.password);
        
        if (result) {
            // Successful login
            const previousLastLogin = user.lastLogin;
            
            // Update last login and activity
            user.lastLogin = new Date();
            user.lastActivity = new Date();
            user.failedLoginAttempts = 0; // Reset failed attempts
            user.accountLockedUntil = null; // Clear lockout if any
            await user.save();

            // Log successful login
            logger.logAuth('LOGIN_SUCCESS', user.id, true, { 
                accountType: user.accountType,
                previousLastLogin: previousLastLogin 
            });

            req.session.userId = user._id;
            req.session.lastActivity = new Date();
            
            // Save session before redirecting
            req.session.save((err) => {
                if (err) {
                    logger.logAuth('LOGIN_ATTEMPT', user.id, false, { reason: 'Session save error' });
                    console.error('Session save error:', err);
                    return res.redirect('/LoginPage?error=server');
                }
                    // Handle role-based redirects
                    // Support both new and legacy role names
                    const userRole = user.accountType || (user._legacyRole === 'ADMIN' ? 'ADMINISTRATOR' : 'ROLE_B');
                    
                    if(userRole === "ADMINISTRATOR" || userRole === "ADMIN") {
                        return res.redirect('/admin/index');
                    }
                    return res.redirect('/home');
            });
        } else {
            // Failed login
            user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
            
            // Lock account after MAX_FAILED_ATTEMPTS
            if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
                const lockoutUntil = new Date();
                lockoutUntil.setMinutes(lockoutUntil.getMinutes() + LOCKOUT_DURATION_MINUTES);
                user.accountLockedUntil = lockoutUntil;
                
                logger.logLockout(user.id, `Failed attempts: ${user.failedLoginAttempts}`);
                logger.logAuth('LOGIN_ATTEMPT', user.id, false, { 
                    reason: 'Invalid password',
                    failedAttempts: user.failedLoginAttempts,
                    accountLocked: true
                });
            } else {
                logger.logAuth('LOGIN_ATTEMPT', user.id, false, { 
                    reason: 'Invalid password',
                    failedAttempts: user.failedLoginAttempts
                });
            }
            
            await user.save();
            return res.redirect('/LoginPage?error=invalid');
        }
    } catch (err) {
        console.error(err);
        logger.logAuth('LOGIN_ATTEMPT', req.body.loginId || 'unknown', false, { 
            reason: 'Server error',
            error: err.message 
        });
        return res.redirect('/LoginPage?error=server');
    }
}

module.exports = { handleLogin };
