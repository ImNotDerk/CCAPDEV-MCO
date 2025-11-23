const User = require('../models/users.js');
const bcrypt = require('bcrypt');
const logger = require('../utils/logger');

const saltRounds = 10;

/**
 * Validate password complexity
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
 * Get all users (with role filtering)
 * Administrators can see all users
 * Role A can see Role B users
 */
async function getAllUsers(currentUser) {
    try {
        let query = {};
        
        // Role A can only see Role B users
        if (currentUser.accountType === 'ROLE_A') {
            query.accountType = 'ROLE_B';
        }
        // Administrator can see all users
        
        const users = await User.find(query)
            .select('-password -passwordHistory -passwordResetToken')
            .lean()
            .sort({ accountType: 1, fname: 1, lname: 1 });
        
        return users;
    } catch (error) {
        console.error('Error fetching users:', error);
        throw error;
    }
}

/**
 * Create a new user (Administrator only for ADMINISTRATOR and ROLE_A)
 */
async function createUser(req, res) {
    try {
        const adminUser = req.user;
        const { fname, lname, id, email, password, accountType } = req.body;

        // Only Administrator can create ADMINISTRATOR and ROLE_A accounts
        if (accountType === 'ADMINISTRATOR' || accountType === 'ROLE_A') {
            if (adminUser.accountType !== 'ADMINISTRATOR') {
                logger.logAccessControl(adminUser.id, '/admin/users/create', 'Attempted to create privileged account');
                return res.status(403).json({ 
                    error: 'Access Denied',
                    message: 'Only Administrators can create Administrator and Role A accounts.'
                });
            }
        }

        // Validate required fields
        if (!fname || !lname || !id || !email || !password || !accountType) {
            return res.status(400).json({ 
                error: 'Validation Error',
                message: 'All fields are required.'
            });
        }

        // Validate account type
        if (!['ADMINISTRATOR', 'ROLE_A', 'ROLE_B'].includes(accountType)) {
            return res.status(400).json({ 
                error: 'Validation Error',
                message: 'Invalid account type.'
            });
        }

        // Validate password
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.isValid) {
            return res.status(400).json({ 
                error: 'Validation Error',
                message: passwordValidation.errors.join('. ')
            });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ 
            $or: [{ id: id }, { email: email }] 
        });

        if (existingUser) {
            return res.status(400).json({ 
                error: 'Validation Error',
                message: 'User with this ID or email already exists.'
            });
        }

        // Hash password
        const hash = await bcrypt.hash(password, saltRounds);

        // Create user
        const newUser = new User({
            fname,
            lname,
            id,
            email: email.toLowerCase().trim(),
            password: hash,
            accountType,
            passwordHistory: [{ password: hash, createdAt: new Date() }],
            passwordCreatedAt: new Date()
        });

        await newUser.save();

        logger.logAuth('USER_CREATED', adminUser.id, true, { 
            createdUserId: newUser.id,
            createdUserEmail: newUser.email,
            accountType: accountType
        });

        res.status(201).json({ 
            success: true,
            message: 'User created successfully.',
            redirect: '/admin/users',
            user: {
                _id: newUser._id,
                fname: newUser.fname,
                lname: newUser.lname,
                id: newUser.id,
                email: newUser.email,
                accountType: newUser.accountType
            }
        });
    } catch (error) {
        console.error('Error creating user:', error);
        logger.logAuth('USER_CREATED', req.user.id, false, { 
            error: error.message 
        });
        res.status(500).json({ 
            error: 'Server Error',
            message: 'An error occurred while creating the user.'
        });
    }
}

/**
 * Update user role (Administrator only)
 */
async function updateUserRole(req, res) {
    try {
        const adminUser = req.user;
        const { userId } = req.params;
        const { accountType } = req.body;

        // Only Administrator can change roles
        if (adminUser.accountType !== 'ADMINISTRATOR') {
            logger.logAccessControl(adminUser.id, `/admin/users/${userId}/role`, 'Attempted to change user role');
            return res.status(403).json({ 
                error: 'Access Denied',
                message: 'Only Administrators can change user roles.'
            });
        }

        // Validate account type
        if (!['ADMINISTRATOR', 'ROLE_A', 'ROLE_B'].includes(accountType)) {
            return res.status(400).json({ 
                error: 'Validation Error',
                message: 'Invalid account type.'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ 
                error: 'Not Found',
                message: 'User not found.'
            });
        }

        const oldRole = user.accountType;
        user.accountType = accountType;
        await user.save();

        logger.logAuth('USER_ROLE_CHANGED', adminUser.id, true, { 
            targetUserId: user.id,
            oldRole: oldRole,
            newRole: accountType
        });

        // If it's a form submission (not AJAX), redirect
        if (req.headers['content-type'] && req.headers['content-type'].includes('application/x-www-form-urlencoded')) {
            return res.redirect('/admin/users?success=role&message=' + encodeURIComponent('User role updated successfully.'));
        }

        res.json({ 
            success: true,
            message: 'User role updated successfully.',
            redirect: '/admin/users'
        });
    } catch (error) {
        console.error('Error updating user role:', error);
        res.status(500).json({ 
            error: 'Server Error',
            message: 'An error occurred while updating the user role.'
        });
    }
}

/**
 * Require re-authentication for critical actions
 */
async function requireReAuth(userId, currentPassword) {
    try {
        if (!userId) {
            return { authenticated: false, reason: 'User ID is required' };
        }
        
        if (!currentPassword || typeof currentPassword !== 'string' || currentPassword.trim() === '') {
            return { authenticated: false, reason: 'Password is required' };
        }

        // Convert userId to string if it's an ObjectId
        const userIdStr = userId && userId.toString ? userId.toString() : String(userId);

        const user = await User.findById(userIdStr);
        if (!user) {
            return { authenticated: false, reason: 'User not found' };
        }

        if (!user.password) {
            return { authenticated: false, reason: 'User password not found' };
        }

        // Trim password and compare
        const trimmedPassword = currentPassword.trim();
        const isMatch = await bcrypt.compare(trimmedPassword, user.password);
        
        return { 
            authenticated: isMatch, 
            reason: isMatch ? null : 'Password is incorrect' 
        };
    } catch (error) {
        console.error('Re-authentication error:', error);
        return { authenticated: false, reason: 'Authentication error occurred: ' + error.message };
    }
}

/**
 * Show re-authentication form for user deletion
 */
async function showDeleteConfirmation(req, res) {
    try {
        const { userId } = req.params;
        const user = await User.findById(userId)
            .select('-password -passwordHistory -passwordResetToken')
            .lean();

        if (!user) {
            return res.status(404).render('404', {
                layout: 'editprofile',
                title: 'Not Found',
                user: req.user,
                message: 'User not found.'
            });
        }

        res.render('confirmDeleteUser', {
            layout: 'admin',
            title: 'Confirm User Deletion',
            user: req.user,
            targetUser: user
        });
    } catch (error) {
        console.error('Error showing delete confirmation:', error);
        res.status(500).render('500', { layout: false, title: 'Server Error' });
    }
}

/**
 * Delete user (Administrator only for ADMINISTRATOR and ROLE_A)
 * Requires re-authentication
 */
async function deleteUser(req, res) {
    try {
        const adminUser = req.user;
        const { userId } = req.params;
        // Get password from request body
        const password = req.body.password; // Re-authentication password

        // Require re-authentication
        if (!password || typeof password !== 'string' || password.trim() === '') {
            return res.status(400).json({ 
                error: 'Validation Error',
                message: 'Password is required for this action.',
                requiresReAuth: true
            });
        }

        // Get the admin user's MongoDB _id (handle both string and ObjectId)
        const adminUserId = adminUser._id ? (adminUser._id.toString ? adminUser._id.toString() : String(adminUser._id)) : null;
        if (!adminUserId) {
            console.error('Admin user ID not found in req.user');
            return res.status(500).json({ 
                error: 'Server Error',
                message: 'Unable to verify authentication. Please log out and log back in.'
            });
        }

        // Verify re-authentication
        const reAuth = await requireReAuth(adminUserId, password);
        
        if (!reAuth.authenticated) {
            logger.logAuth('USER_DELETE_ATTEMPT', adminUser.id, false, { 
                reason: 'Re-authentication failed: ' + (reAuth.reason || 'Unknown'),
                targetUserId: userId 
            });
            return res.status(401).json({ 
                error: 'Authentication Failed',
                message: reAuth.reason || 'Incorrect password. Please try again.',
                requiresReAuth: true
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ 
                error: 'Not Found',
                message: 'User not found.'
            });
        }

        // Prevent self-deletion
        const userMongoId = user._id.toString ? user._id.toString() : String(user._id);
        const adminMongoId = adminUser._id ? (adminUser._id.toString ? adminUser._id.toString() : String(adminUser._id)) : null;
        if (userMongoId === adminMongoId) {
            return res.status(400).json({ 
                error: 'Validation Error',
                message: 'You cannot delete your own account.'
            });
        }

        // Only Administrator can delete ADMINISTRATOR and ROLE_A accounts
        if (user.accountType === 'ADMINISTRATOR' || user.accountType === 'ROLE_A') {
            if (adminUser.accountType !== 'ADMINISTRATOR' && adminUser._legacyRole !== 'ADMIN') {
                logger.logAccessControl(adminUser.id, `/admin/users/${userId}/delete`, 'Attempted to delete privileged account');
                return res.status(403).json({ 
                    error: 'Access Denied',
                    message: 'Only Administrators can delete Administrator and Role A accounts.'
                });
            }
        }

        // Role A can delete Role B users
        if (user.accountType === 'ROLE_B' && adminUser.accountType === 'ROLE_A') {
            // Allowed
        } else if (adminUser.accountType !== 'ADMINISTRATOR' && adminUser._legacyRole !== 'ADMIN') {
            logger.logAccessControl(adminUser.id, `/admin/users/${userId}/delete`, 'Insufficient permissions');
            return res.status(403).json({ 
                error: 'Access Denied',
                message: 'You do not have permission to delete this user.'
            });
        }

        const deletedUserInfo = {
            id: user.id,
            email: user.email,
            accountType: user.accountType
        };

        await User.findByIdAndDelete(userId);

        logger.logAuth('USER_DELETED', adminUser.id, true, { 
            deletedUserId: deletedUserInfo.id,
            deletedUserEmail: deletedUserInfo.email,
            deletedUserRole: deletedUserInfo.accountType
        });

        res.json({ 
            success: true,
            message: 'User deleted successfully.',
            redirect: '/admin/users'
        });
    } catch (error) {
        console.error('Error deleting user:', error);
        console.error('Error stack:', error.stack);
        const userId = req.user ? req.user.id : 'unknown';
        logger.logAuth('USER_DELETE_ATTEMPT', userId, false, { 
            reason: 'Server error',
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ 
            error: 'Server Error',
            message: 'An error occurred while deleting the user. Please try again.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

/**
 * Get user details
 */
async function getUserDetails(req, res) {
    try {
        const adminUser = req.user;
        const { userId } = req.params;

        const user = await User.findById(userId)
            .select('-password -passwordHistory -passwordResetToken')
            .lean();

        if (!user) {
            return res.status(404).json({ 
                error: 'Not Found',
                message: 'User not found.'
            });
        }

        // Role A can only view Role B users
        if (adminUser.accountType === 'ROLE_A' && user.accountType !== 'ROLE_B') {
            logger.logAccessControl(adminUser.id, `/admin/users/${userId}`, 'Attempted to view non-Role B user');
            return res.status(403).json({ 
                error: 'Access Denied',
                message: 'You can only view Role B users.'
            });
        }

        res.json({ user });
    } catch (error) {
        console.error('Error fetching user details:', error);
        res.status(500).json({ 
            error: 'Server Error',
            message: 'An error occurred while fetching user details.'
        });
    }
}

module.exports = {
    getAllUsers,
    createUser,
    updateUserRole,
    deleteUser,
    getUserDetails,
    showDeleteConfirmation
};

