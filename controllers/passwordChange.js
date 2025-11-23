const User = require('../models/users.js');
const bcrypt = require('bcrypt');
const logger = require('../utils/logger');

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
 * Require re-authentication before password change
 */
async function requireReAuth(userId, currentPassword) {
    const user = await User.findById(userId);
    if (!user) {
        return { authenticated: false, reason: 'User not found' };
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
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
        const userId = req.session.userId;
        if (!userId) {
            return res.redirect('/?error=session');
        }

        const { currentPassword, newPassword, confirmPassword } = req.body;

        // Validate required fields
        if (!currentPassword || !newPassword || !confirmPassword) {
            logger.logPasswordChange(userId, false, 'Missing required fields');
            return res.redirect('/Profile?error=password&details=' + encodeURIComponent('All password fields are required'));
        }

        // Re-authentication check
        const reAuth = await requireReAuth(userId, currentPassword);
        if (!reAuth.authenticated) {
            logger.logPasswordChange(userId, false, 'Re-authentication failed');
            return res.redirect('/Profile?error=password&details=' + encodeURIComponent('Current password is incorrect'));
        }

        const user = await User.findById(userId);

        // Check password aging
        const agingCheck = checkPasswordAging(user);
        if (!agingCheck.canChange) {
            logger.logPasswordChange(userId, false, agingCheck.reason);
            return res.redirect('/Profile?error=password&details=' + encodeURIComponent(agingCheck.reason));
        }

        // Validate password complexity
        const validation = validatePassword(newPassword);
        if (!validation.isValid) {
            logger.logPasswordChange(userId, false, 'Password complexity validation failed');
            const errorMessage = validation.errors.join('. ');
            return res.redirect('/Profile?error=password&details=' + encodeURIComponent(errorMessage));
        }

        // Check password match
        if (newPassword !== confirmPassword) {
            logger.logPasswordChange(userId, false, 'Passwords do not match');
            return res.redirect('/Profile?error=password&details=' + encodeURIComponent('New passwords do not match'));
        }

        // Check password reuse
        const reuseCheck = await checkPasswordReuse(userId, newPassword);
        if (!reuseCheck.canUse) {
            logger.logPasswordChange(userId, false, reuseCheck.reason);
            return res.redirect('/Profile?error=password&details=' + encodeURIComponent(reuseCheck.reason));
        }

        // Hash new password
        const hash = await bcrypt.hash(newPassword, saltRounds);

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

        logger.logPasswordChange(userId, true, 'Password changed successfully');
        return res.redirect('/Profile?success=password');
    } catch (error) {
        console.error('Password change error:', error);
        logger.logPasswordChange(req.session.userId || 'unknown', false, 'Server error');
        return res.redirect('/Profile?error=server&details=' + encodeURIComponent('An error occurred. Please try again.'));
    }
}

module.exports = {
    handlePasswordChange,
    requireReAuth,
    checkPasswordAging,
    checkPasswordReuse
};

