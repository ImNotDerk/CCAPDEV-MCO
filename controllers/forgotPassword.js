const User = require('../models/users.js');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const logger = require('../utils/logger');

const saltRounds = 10;
const TOKEN_EXPIRY_HOURS = 1; // Token expires in 1 hour
const MAX_RESET_REQUESTS_PER_HOUR = 3; // Rate limiting
const PASSWORD_HISTORY_LIMIT = 5;

/**
 * Generate cryptographically secure random token
 */
function generateResetToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Validate password complexity (same as registration)
 */
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
 * Handle forgot password request
 * Security: Generic response - don't reveal if email exists
 */
async function handleForgotPassword(req, res) {
    try {
        const { email } = req.body;

        // Validate email format
        if (!email || typeof email !== 'string') {
            logger.logPasswordReset('PASSWORD_RESET_REQUEST', 'anonymous', false, { reason: 'Invalid email format' });
            return res.render('forgotPassword', {
                layout: 'login',
                title: 'Forgot Password',
                message: 'If an account with that email exists, a password reset link has been sent.',
                messageType: 'info'
            });
        }

        // Validate email length
        if (email.length > 100) {
            logger.logValidation('email', email, 'Exceeds maximum length', 'anonymous');
            return res.render('forgotPassword', {
                layout: 'login',
                title: 'Forgot Password',
                message: 'If an account with that email exists, a password reset link has been sent.',
                messageType: 'info'
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            logger.logPasswordReset('PASSWORD_RESET_REQUEST', email, false, { reason: 'Invalid email format' });
            return res.render('forgotPassword', {
                layout: 'login',
                title: 'Forgot Password',
                message: 'If an account with that email exists, a password reset link has been sent.',
                messageType: 'info'
            });
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() });

        // Generic response - don't reveal if user exists
        // Always show success message for security
        const genericMessage = 'If an account with that email exists, a password reset link has been sent. Please check your email.';

        if (!user) {
            // Log but don't reveal to user
            logger.logPasswordReset('PASSWORD_RESET_REQUEST', email, false, { reason: 'Email not found' });
            return res.render('forgotPassword', {
                layout: 'login',
                title: 'Forgot Password',
                message: genericMessage,
                messageType: 'info'
            });
        }

        // Rate limiting - check if too many requests
        const now = new Date();
        if (user.lastPasswordResetRequest) {
            const timeSinceLastRequest = (now - user.lastPasswordResetRequest) / (1000 * 60 * 60); // hours
            if (timeSinceLastRequest < 1 && user.passwordResetAttempts >= MAX_RESET_REQUESTS_PER_HOUR) {
                logger.logPasswordReset('PASSWORD_RESET_REQUEST', user.id, false, { reason: 'Rate limit exceeded' });
                return res.render('forgotPassword', {
                    layout: 'login',
                    title: 'Forgot Password',
                    message: genericMessage,
                    messageType: 'info'
                });
            }
            
            // Reset counter if more than 1 hour has passed
            if (timeSinceLastRequest >= 1) {
                user.passwordResetAttempts = 0;
            }
        }

        // Generate secure reset token
        const resetToken = generateResetToken();
        const tokenExpiry = new Date();
        tokenExpiry.setHours(tokenExpiry.getHours() + TOKEN_EXPIRY_HOURS);

        // Store token and expiry
        user.passwordResetToken = resetToken;
        user.passwordResetTokenExpires = tokenExpiry;
        user.passwordResetAttempts = (user.passwordResetAttempts || 0) + 1;
        user.lastPasswordResetRequest = now;
        await user.save();

        // Log successful token generation
        logger.logPasswordReset('PASSWORD_RESET_REQUEST', user.id, true, { email: user.email });

        // In production, send email with reset link
        // For development, log the reset link
        const resetLink = `${req.protocol}://${req.get('host')}/reset-password?token=${resetToken}`;
        console.log(`\n=== PASSWORD RESET LINK (DEVELOPMENT ONLY) ===`);
        console.log(`For user: ${user.email}`);
        console.log(`Reset link: ${resetLink}`);
        console.log(`Token expires: ${tokenExpiry.toLocaleString()}`);
        console.log(`===============================================\n`);

        return res.render('forgotPassword', {
            layout: 'login',
            title: 'Forgot Password',
            message: genericMessage,
            messageType: 'success',
            // Only show link in development
            devResetLink: process.env.NODE_ENV !== 'production' ? resetLink : null
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        logger.logPasswordReset('PASSWORD_RESET_REQUEST', req.body.email || 'unknown', false, { 
            reason: 'Server error',
            error: error.message 
        });
        return res.render('forgotPassword', {
            layout: 'login',
            title: 'Forgot Password',
            message: 'If an account with that email exists, a password reset link has been sent.',
            messageType: 'info'
        });
    }
}

/**
 * Handle password reset with token
 */
async function handleResetPassword(req, res) {
    try {
        const { token } = req.query;
        const { password, confirmPassword } = req.body;

        // If token provided, show reset form
        if (req.method === 'GET' && token) {
            const user = await User.findOne({ 
                passwordResetToken: token,
                passwordResetTokenExpires: { $gt: new Date() }
            });

            if (!user) {
                logger.logPasswordReset('PASSWORD_RESET_ATTEMPT', 'unknown', false, { reason: 'Invalid or expired token' });
                return res.render('resetPassword', {
                    layout: 'login',
                    title: 'Reset Password',
                    error: 'Invalid or expired reset token. Please request a new password reset.',
                    token: null
                });
            }

            return res.render('resetPassword', {
                layout: 'login',
                title: 'Reset Password',
                token: token,
                error: null
            });
        }

        // Handle POST - actual password reset
        if (req.method === 'POST') {
            const resetToken = req.body.token || token;

            if (!resetToken) {
                return res.render('resetPassword', {
                    layout: 'login',
                    title: 'Reset Password',
                    error: 'Reset token is required.',
                    token: null
                });
            }

            // Find user with valid token
            const user = await User.findOne({ 
                passwordResetToken: resetToken,
                passwordResetTokenExpires: { $gt: new Date() }
            });

            if (!user) {
                logger.logPasswordReset('PASSWORD_RESET_ATTEMPT', 'unknown', false, { reason: 'Invalid or expired token' });
                return res.render('resetPassword', {
                    layout: 'login',
                    title: 'Reset Password',
                    error: 'Invalid or expired reset token. Please request a new password reset.',
                    token: null
                });
            }

            // Validate passwords provided
            if (!password || !confirmPassword) {
                return res.render('resetPassword', {
                    layout: 'login',
                    title: 'Reset Password',
                    error: 'Both password fields are required.',
                    token: resetToken
                });
            }

            // Check passwords match
            if (password !== confirmPassword) {
                logger.logPasswordChange(user.id, false, 'Passwords do not match during reset');
                return res.render('resetPassword', {
                    layout: 'login',
                    title: 'Reset Password',
                    error: 'Passwords do not match.',
                    token: resetToken
                });
            }

            // Validate password complexity
            const validation = validatePassword(password);
            if (!validation.isValid) {
                logger.logPasswordChange(user.id, false, 'Password complexity validation failed during reset');
                const errorMessage = validation.errors.join('. ');
                return res.render('resetPassword', {
                    layout: 'login',
                    title: 'Reset Password',
                    error: errorMessage,
                    token: resetToken
                });
            }

            // Check password reuse
            const reuseCheck = await checkPasswordReuse(user._id, password);
            if (!reuseCheck.canUse) {
                logger.logPasswordChange(user.id, false, reuseCheck.reason);
                return res.render('resetPassword', {
                    layout: 'login',
                    title: 'Reset Password',
                    error: reuseCheck.reason,
                    token: resetToken
                });
            }

            // Hash new password
            const hash = await bcrypt.hash(password, saltRounds);

            // Update password and history
            const passwordHistory = user.passwordHistory || [];
            passwordHistory.push({ password: hash, createdAt: new Date() });
            
            // Keep only last N passwords
            if (passwordHistory.length > PASSWORD_HISTORY_LIMIT) {
                passwordHistory.shift();
            }

            // Update user
            user.password = hash;
            user.passwordHistory = passwordHistory;
            user.passwordCreatedAt = new Date();
            user.passwordResetToken = null; // Clear token after use
            user.passwordResetTokenExpires = null;
            user.failedLoginAttempts = 0; // Reset failed attempts
            user.accountLockedUntil = null; // Clear lockout
            await user.save();

            logger.logPasswordChange(user.id, true, 'Password reset successful');
            logger.logPasswordReset('PASSWORD_RESET_SUCCESS', user.id, true);

            return res.render('resetPassword', {
                layout: 'login',
                title: 'Reset Password',
                success: true,
                message: 'Your password has been reset successfully. You can now log in with your new password.'
            });
        }

        // No token provided
        return res.redirect('/forgotpassword');
    } catch (error) {
        console.error('Reset password error:', error);
        logger.logPasswordReset('PASSWORD_RESET_ATTEMPT', 'unknown', false, { 
            reason: 'Server error',
            error: error.message 
        });
        return res.render('resetPassword', {
            layout: 'login',
            title: 'Reset Password',
            error: 'An error occurred. Please try again.',
            token: null
        });
    }
}

module.exports = {
    handleForgotPassword,
    handleResetPassword
};

