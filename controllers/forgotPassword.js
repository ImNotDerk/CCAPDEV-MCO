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
 * Handle forgot password request - Step 1: Email verification
 * Security: Generic response - don't reveal if email exists
 */
async function handleForgotPassword(req, res) {
    try {
        const { email, step } = req.body;

        // Step 2: Show security question if email provided (from query or body)
        const emailToVerify = email || req.query.email;
        const stepToProcess = step || req.query.step;
        
        if (stepToProcess === 'verify-email' && emailToVerify) {
            const normalizedEmail = emailToVerify.toLowerCase().trim();
            const user = await User.findOne({ email: normalizedEmail });

            // Generic message even if user doesn't exist (security)
            if (!user || !user.securityQuestion) {
                logger.logPasswordReset('PASSWORD_RESET_REQUEST', user ? user.id : 'unknown', false, { 
                    reason: user ? 'No security question set' : 'User not found' 
                });
                return res.render('forgotPassword', {
                    layout: 'login',
                    title: 'Forgot Password',
                    message: 'If an account with that email exists and has a security question set, you will be able to reset your password.',
                    messageType: 'info'
                });
            }

            // Show security question
            return res.render('forgotPasswordSecurity', {
                layout: 'login',
                title: 'Answer Security Question',
                email: normalizedEmail,
                securityQuestion: user.securityQuestion,
                error: null
            });
        }

        // Step 1: Initial email entry
        if (!email || typeof email !== 'string') {
            return res.render('forgotPassword', {
                layout: 'login',
                title: 'Forgot Password',
                message: null,
                messageType: null
            });
        }

        // This code path should not be reached - step should be 'verify-email'
        // But handle it gracefully
        return res.render('forgotPassword', {
            layout: 'login',
            title: 'Forgot Password',
            message: null,
            messageType: null
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
 * Handle security answer verification for forgot password
 */
async function handleSecurityAnswerVerification(req, res) {
    try {
        const { email, securityQuestion, securityAnswer } = req.body;

        if (!email || !securityQuestion || !securityAnswer) {
            return res.render('forgotPasswordSecurity', {
                layout: 'login',
                title: 'Answer Security Question',
                email: email || '',
                securityQuestion: securityQuestion || '',
                error: 'All fields are required.'
            });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail });

        if (!user || !user.securityQuestion || !user.securityAnswer) {
            logger.logPasswordReset('PASSWORD_RESET_ATTEMPT', user ? user.id : 'unknown', false, { 
                reason: 'User not found or security question not set' 
            });
            return res.render('forgotPasswordSecurity', {
                layout: 'login',
                title: 'Answer Security Question',
                email: normalizedEmail,
                securityQuestion: securityQuestion,
                error: 'Invalid request. Please start over.'
            });
        }

        // Verify security question matches
        if (user.securityQuestion !== securityQuestion) {
            logger.logPasswordReset('PASSWORD_RESET_ATTEMPT', user.id, false, { 
                reason: 'Security question mismatch' 
            });
            return res.render('forgotPasswordSecurity', {
                layout: 'login',
                title: 'Answer Security Question',
                email: normalizedEmail,
                securityQuestion: securityQuestion,
                error: 'Invalid request. Please start over.'
            });
        }

        // Verify security answer
        const normalizedAnswer = securityAnswer.trim().toLowerCase();
        const isMatch = await bcrypt.compare(normalizedAnswer, user.securityAnswer);

        if (!isMatch) {
            logger.logPasswordReset('PASSWORD_RESET_ATTEMPT', user.id, false, { 
                reason: 'Incorrect security answer' 
            });
            return res.render('forgotPasswordSecurity', {
                layout: 'login',
                title: 'Answer Security Question',
                email: normalizedEmail,
                securityQuestion: securityQuestion,
                error: 'Incorrect security answer. Please try again.'
            });
        }

        // Security answer is correct - show password reset form
        logger.logPasswordReset('PASSWORD_RESET_VERIFIED', user.id, true);
        
        return res.render('resetPassword', {
            layout: 'login',
            title: 'Reset Password',
            email: normalizedEmail,
            token: null, // Not using token anymore
            error: null
        });
    } catch (error) {
        console.error('Security answer verification error:', error);
        logger.logPasswordReset('PASSWORD_RESET_ATTEMPT', 'unknown', false, { 
            reason: 'Server error',
            error: error.message 
        });
        return res.render('forgotPasswordSecurity', {
            layout: 'login',
            title: 'Answer Security Question',
            email: req.body.email || '',
            securityQuestion: req.body.securityQuestion || '',
            error: 'An error occurred. Please try again.'
        });
    }
}

/**
 * Handle password reset (updated to use email instead of token)
 */
async function handleResetPassword(req, res) {
    try {
        const { email, password, confirmPassword } = req.body;

        // If GET request, redirect to forgot password
        if (req.method === 'GET') {
            return res.redirect('/forgotpassword');
        }

        // Handle POST - actual password reset
        if (req.method === 'POST') {
            if (!email) {
                return res.render('resetPassword', {
                    layout: 'login',
                    title: 'Reset Password',
                    error: 'Email is required.',
                    email: null,
                    token: null
                });
            }

            const normalizedEmail = email.toLowerCase().trim();
            const user = await User.findOne({ email: normalizedEmail });

            if (!user || !user.securityQuestion) {
                logger.logPasswordReset('PASSWORD_RESET_ATTEMPT', 'unknown', false, { reason: 'User not found' });
                return res.render('resetPassword', {
                    layout: 'login',
                    title: 'Reset Password',
                    error: 'Invalid request. Please start over.',
                    email: null,
                    token: null
                });
            }

            // Validate passwords provided
            if (!password || !confirmPassword) {
                return res.render('resetPassword', {
                    layout: 'login',
                    title: 'Reset Password',
                    error: 'Both password fields are required.',
                    email: normalizedEmail,
                    token: null
                });
            }

            // Check passwords match
            if (password !== confirmPassword) {
                logger.logPasswordChange(user.id, false, 'Passwords do not match during reset');
                return res.render('resetPassword', {
                    layout: 'login',
                    title: 'Reset Password',
                    error: 'Passwords do not match.',
                    email: normalizedEmail,
                    token: null
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
                    email: normalizedEmail,
                    token: null
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
                    email: normalizedEmail,
                    token: null
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
            email: null,
            token: null
        });
    }
}

module.exports = {
    handleForgotPassword,
    handleResetPassword,
    handleSecurityAnswerVerification
};

