const User = require('../models/users.js');
const bcrypt = require('bcrypt');
const logger = require('../utils/logger');
const ErrorHandler = require('../utils/errorHandler');

const saltRounds = 10;
const MIN_PASSWORD_AGE_DAYS = 1;
const PASSWORD_HISTORY_LIMIT = 5; // Keep last 5 passwords

// Password complexity validation (same as register)
function validatePassword(password) {
    const errors = [];
    
    if (password.length < 8) {
        errors.push('Password must be at least 8 characters long');
    }
    
    if (!/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
    }
    
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        errors.push('Password must contain at least one special character');
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

/**
 * Check if password was used recently (prevent reuse)
 */
async function checkPasswordReuse(userId, newPassword) {
    const user = await User.findById(userId);
    if (!user || !user.passwordHistory || user.passwordHistory.length === 0) {
        return { canUse: true };
    }

    // Check against password history
    for (const oldPassword of user.passwordHistory) {
        const isMatch = await bcrypt.compare(newPassword, oldPassword.password);
        if (isMatch) {
            return { 
                canUse: false, 
                reason: 'This password was recently used. Please choose a different one.' 
            };
        }
    }

    return { canUse: true };
}

/**
 * Check if password is old enough to be changed (password aging)
 */
function checkPasswordAging(user) {
    if (!user.passwordCreatedAt) {
        return { canChange: true };
    }

    const daysSinceCreation = (new Date() - user.passwordCreatedAt) / (1000 * 60 * 60 * 24);
    
    if (daysSinceCreation < MIN_PASSWORD_AGE_DAYS) {
        const hoursLeft = Math.ceil((MIN_PASSWORD_AGE_DAYS - daysSinceCreation) * 24);
        return { 
            canChange: false, 
            reason: `Password must be at least ${MIN_PASSWORD_AGE_DAYS} day(s) old before it can be changed. Please try again in ${hoursLeft} hour(s).` 
        };
    }

    return { canChange: true };
}

/**
 * Require re-authentication using old password before password change
 */
async function requireReAuth(userId, oldPassword) {
    const user = await User.findById(userId);
    if (!user) {
        return { authenticated: false, reason: 'User not found' };
    }

    if (!oldPassword) {
        return { 
            authenticated: false, 
            reason: 'Current password is required' 
        };
    }

    // Compare old password with current password
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    
    return { 
        authenticated: isMatch, 
        reason: isMatch ? null : 'Current password is incorrect' 
    };
}

/**
 * Handle password change
 */
async function handlePasswordChange(req, res) {
    try {
        if (!req.user || !req.user._id) {
            logger.logPasswordChange('unknown', false, 'No user in request');
            return res.redirect('/?error=session');
        }
        const userId = req.user._id;

        const { oldPassword, newPassword, confirmPassword } = req.body;

        // Log password change attempt
        console.log('Password change attempt:', { 
            userId: userId.toString(), 
            hasOldPassword: !!oldPassword,
            hasNewPassword: !!newPassword
        });

        // Validate required fields
        if (!oldPassword || !newPassword || !confirmPassword) {
            logger.logPasswordChange(userId.toString(), false, 'Missing required fields');
            const token = ErrorHandler.setError(req, 'password', 'All fields are required');
            return res.redirect('/EditProfile?err=' + token);
        }

        const user = await User.findById(userId);
        if (!user) {
            logger.logPasswordChange(userId.toString(), false, 'User not found');
            const token = ErrorHandler.setError(req, 'password', 'User not found');
            return res.redirect('/EditProfile?err=' + token);
        }

        // Check password aging
        const agingCheck = checkPasswordAging(user);
        if (!agingCheck.canChange) {
            const daysSinceCreation = user.passwordCreatedAt 
                ? Math.floor((new Date() - user.passwordCreatedAt) / (1000 * 60 * 60 * 24))
                : 0;
            logger.writeLog('WARN', 'PASSWORD_CHANGE', 'Password change blocked - password too new', {
                userId: userId.toString(),
                email: user.email,
                daysSinceCreation: daysSinceCreation,
                reason: agingCheck.reason
            });
            logger.logPasswordChange(userId.toString(), false, agingCheck.reason);
            const token = ErrorHandler.setError(req, 'password', agingCheck.reason);
            return res.redirect('/EditProfile?err=' + token);
        }

        // Re-authentication check using old password
        const reAuth = await requireReAuth(userId, oldPassword);
        if (!reAuth.authenticated) {
            logger.writeLog('WARN', 'PASSWORD_CHANGE', 'Re-authentication failed - incorrect old password', {
                userId: userId.toString(),
                email: user.email,
                reason: reAuth.reason
            });
            logger.logPasswordChange(userId.toString(), false, 'Re-authentication failed: ' + reAuth.reason);
            const token = ErrorHandler.setError(req, 'password', reAuth.reason || 'Current password is incorrect');
            return res.redirect('/EditProfile?err=' + token);
        }

        // Validate password complexity
        const validation = validatePassword(newPassword);
        if (!validation.isValid) {
            const errorMessage = validation.errors.join('. ');
            logger.writeLog('WARN', 'PASSWORD_CHANGE', 'Password complexity validation failed', {
                userId: userId.toString(),
                email: user.email,
                errors: validation.errors
            });
            logger.logPasswordChange(userId.toString(), false, 'Password complexity validation failed');
            const token = ErrorHandler.setError(req, 'password', errorMessage);
            return res.redirect('/EditProfile?err=' + token);
        }

        // Check password match
        if (newPassword !== confirmPassword) {
            logger.writeLog('WARN', 'PASSWORD_CHANGE', 'New passwords do not match', {
                userId: userId.toString(),
                email: user.email
            });
            logger.logPasswordChange(userId.toString(), false, 'Passwords do not match');
            const token = ErrorHandler.setError(req, 'password', 'New passwords do not match');
            return res.redirect('/EditProfile?err=' + token);
        }

        // Check if new password is same as old password
        const isSameAsOld = await bcrypt.compare(newPassword, user.password);
        if (isSameAsOld) {
            logger.writeLog('WARN', 'PASSWORD_CHANGE', 'New password same as current password', {
                userId: userId.toString(),
                email: user.email
            });
            logger.logPasswordChange(userId.toString(), false, 'New password cannot be the same as current password');
            const token = ErrorHandler.setError(req, 'password', 'New password cannot be the same as your current password');
            return res.redirect('/EditProfile?err=' + token);
        }

        // Check password reuse
        const reuseCheck = await checkPasswordReuse(userId, newPassword);
        if (!reuseCheck.canUse) {
            logger.writeLog('WARN', 'PASSWORD_CHANGE', 'Password reuse detected', {
                userId: userId.toString(),
                email: user.email,
                reason: reuseCheck.reason
            });
            logger.logPasswordChange(userId.toString(), false, reuseCheck.reason);
            const token = ErrorHandler.setError(req, 'password', reuseCheck.reason);
            return res.redirect('/EditProfile?err=' + token);
        }

        // Hash new password
        const hash = await bcrypt.hash(newPassword, saltRounds);

        // Calculate password age before change
        const oldPasswordAge = user.passwordCreatedAt 
            ? Math.floor((new Date() - user.passwordCreatedAt) / (1000 * 60 * 60 * 24))
            : 0;

        // Update password and history
        const passwordHistory = user.passwordHistory || [];
        passwordHistory.push({ password: hash, createdAt: new Date() });
        
        // Keep only last N passwords
        if (passwordHistory.length > PASSWORD_HISTORY_LIMIT) {
            passwordHistory.shift();
        }

        user.password = hash;
        user.passwordHistory = passwordHistory;
        user.passwordCreatedAt = new Date();
        await user.save();

        // Log successful password change with details
        logger.writeLog('INFO', 'PASSWORD_CHANGE', 'Password changed successfully', {
            userId: userId.toString(),
            email: user.email,
            oldPasswordAge: oldPasswordAge,
            passwordHistoryCount: passwordHistory.length
        });
        logger.logPasswordChange(userId.toString(), true, 'Password changed successfully');
        
        console.log('Password changed successfully:', {
            userId: userId.toString(),
            email: user.email,
            oldPasswordAge: oldPasswordAge + ' days'
        });

        // Redirect to EditProfile with success message
        const token = ErrorHandler.setSuccess(req, 'Your password has been changed successfully!');
        return res.redirect('/EditProfile?msg=' + token);
    } catch (error) {
        console.error('Password change error:', error);
        const userId = req.user ? req.user._id.toString() : 'unknown';
        logger.writeLog('ERROR', 'PASSWORD_CHANGE', 'Server error during password change', {
            userId: userId,
            error: error.message,
            stack: error.stack
        });
        logger.logPasswordChange(userId, false, 'Server error: ' + error.message);
        const token = ErrorHandler.setError(req, 'server', 'An error occurred. Please try again.');
        return res.redirect('/EditProfile?err=' + token);
    }
}

module.exports = {
    handlePasswordChange,
    requireReAuth,
    checkPasswordAging,
    checkPasswordReuse,
    validatePassword
};

