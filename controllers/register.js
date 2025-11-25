const User = require('../models/users.js');
const bcrypt = require('bcrypt');
const logger = require('../utils/logger');
const ErrorHandler = require('../utils/errorHandler');
const { validateIdNumber } = require('../utils/idValidator');

const saltRounds = 10; // Define the number of salt rounds for hashing

// Valid security questions from the User model enum
const VALID_SECURITY_QUESTIONS = [
    'What is the name of a college you applied to but didn\'t attend?',
    'What was the name of the first school you remember attending?',
    'Where was the destination of your most memorable school field trip?',
    'What was your maths teacher\'s surname in your 8th year of school?',
    'What was the name of your first stuffed toy?',
    'What was your driving instructor\'s first name?',
    'What was the street name of the first house you lived in?',
    'What was the name of your best friend in elementary school?',
    'What was the model of your first bicycle?',
    'What was the name of the hospital where you were born?',
    'What was your favorite subject in high school?',
    'What was the name of your first employer?',
    'What was the make and model of your first car?',
    'What was the name of the town where your grandparents lived?',
    'What was the name of your first childhood friend?',
    'What was the brand of your first computer or gaming console?'
];

// Password complexity validation function
function validatePassword(password) {
    const errors = [];
    
    // Minimum 8 characters
    if (password.length < 8) {
        errors.push('Password must be at least 8 characters long');
    }

    if (password.length > 50) {
        errors.push('Password must not exceed 50 characters');
    }
    
    // At least one uppercase letter
    if (!/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }
    
    // At least one lowercase letter
    if (!/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }
    
    // At least one number
    if (!/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
    }
    
    // At least one special character
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        errors.push('Password must contain at least one special character (!@#$%^&*()_+-=[]{}|;:,.<>?)');
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

async function handleRegistration(req, res) {
    const { fname, lname, id, email, password, password2, securityQuestion, securityAnswer } = req.body;
    const normalizedEmail = email ? email.toLowerCase().trim() : '';

    // Log registration attempt
    console.log('Registration attempt:', { 
        email: normalizedEmail || 'missing', 
        id: id || 'missing',
        hasPassword: !!password,
        hasSecurityQuestion: !!securityQuestion
    });

    // Validate required fields
    if (!fname || !fname.trim()) {
        logger.logValidation('fname', fname, 'First name is required', 'anonymous');
        console.error('Registration error: First name is required');
        const token = ErrorHandler.setError(req, 'registration', 'First name is required');
        return res.redirect('/?err=' + token);
    }

    if (!lname || !lname.trim()) {
        logger.logValidation('lname', lname, 'Last name is required', 'anonymous');
        console.error('Registration error: Last name is required');
        const token = ErrorHandler.setError(req, 'registration', 'Last name is required');
        return res.redirect('/?err=' + token);
    }

    if (!id || !id.trim()) {
        logger.logValidation('id', id, 'ID is required', 'anonymous');
        console.error('Registration error: ID is required');
        const token = ErrorHandler.setError(req, 'registration', 'ID number is required');
        return res.redirect('/?err=' + token);
    }

    const idValidation = validateIdNumber(id);
    if (!idValidation.isValid) {
        const errorMessage = idValidation.errors.join('. ');
        logger.logValidation('id', id, errorMessage, 'anonymous');
        console.error('Registration error: Invalid ID number:', errorMessage);
        const token = ErrorHandler.setError(req, 'registration', errorMessage);
        return res.redirect('/?err=' + token);
    }

    const normalizedId = idValidation.normalized;

    if (!normalizedEmail) {
        logger.logValidation('email', email, 'Email is required', 'anonymous');
        console.error('Registration error: Email is required');
        const token = ErrorHandler.setError(req, 'registration', 'Email is required');
        return res.redirect('/?err=' + token);
    }

    if (!password) {
        logger.logValidation('password', '***', 'Password is required', 'anonymous');
        console.error('Registration error: Password is required');
        const token = ErrorHandler.setError(req, 'registration', 'Password is required');
        return res.redirect('/?err=' + token);
    }

    if (!securityQuestion || !securityAnswer || securityAnswer.trim() === '') {
        logger.logValidation('securityQuestion', securityQuestion || 'missing', 'Security question and answer are required', 'anonymous');
        console.error('Registration error: Security question and answer are required');
        const token = ErrorHandler.setError(req, 'registration', 'Security question and answer are required');
        return res.redirect('/?err=' + token);
    }

    // Validate security question is in the enum
    if (!VALID_SECURITY_QUESTIONS.includes(securityQuestion)) {
        logger.logValidation('securityQuestion', securityQuestion, 'Invalid security question selected', 'anonymous');
        console.error('Registration error: Invalid security question:', securityQuestion);
        const token = ErrorHandler.setError(req, 'registration', 'Invalid security question selected. Please select a valid question.');
        return res.redirect('/?err=' + token);
    }

    // Validate security answer length
    if (securityAnswer.length > 100) {
        logger.logValidation('securityAnswer', securityAnswer.substring(0, 20) + '...', 'Security answer exceeds maximum length', 'anonymous');
        console.error('Registration error: Security answer too long');
        const token = ErrorHandler.setError(req, 'registration', 'Security answer must be 100 characters or less');
        return res.redirect('/?err=' + token);
    }

    // Validate password complexity
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
        const errorMessage = passwordValidation.errors.join('. ');
        logger.logValidation('password', '***', errorMessage, 'anonymous');
        console.error('Registration error: Password validation failed:', errorMessage);
        const token = ErrorHandler.setError(req, 'password', errorMessage);
        return res.redirect('/?err=' + token);
    }

    // Check if passwords match
    if (password !== password2) {
        logger.logValidation('password2', '***', 'Passwords do not match', 'anonymous');
        console.error('Registration error: Passwords do not match');
        const token = ErrorHandler.setError(req, 'password', 'Passwords do not match');
        return res.redirect('/?err=' + token);
    }

    // Hash password
    bcrypt.hash(password, saltRounds, async function(err, hash) {
        if (err) {
            // Handle hashing error
            console.error('Error hashing password:', err);
            logger.writeLog('ERROR', 'REGISTRATION', 'Password hashing failed', {
                email: normalizedEmail || 'unknown',
                error: err.message,
                stack: err.stack
            });
            const token = ErrorHandler.setError(req, 'server', 'Error hashing password');
            return res.redirect('/?err=' + token);
        }

        // Hash security answer
        bcrypt.hash(securityAnswer.trim().toLowerCase(), saltRounds, async function(err2, answerHash) {
            if (err2) {
                console.error('Error hashing security answer:', err2);
                logger.writeLog('ERROR', 'REGISTRATION', 'Security answer hashing failed', {
                    email: normalizedEmail || 'unknown',
                    error: err2.message,
                    stack: err2.stack
                });
                const token = ErrorHandler.setError(req, 'server', 'Error processing security answer');
                return res.redirect('/?err=' + token);
            }

            // Create a new user document with the hashed password and security answer
            const newUser = new User({ 
                fname: fname.trim(), 
                lname: lname.trim(), 
                id: normalizedId, 
                email: normalizedEmail, 
                password: hash,
                securityQuestion: securityQuestion,
                securityAnswer: answerHash,
                passwordHistory: [{ password: hash, createdAt: new Date() }],
                passwordCreatedAt: new Date()
            });

            // Save the user document to the database
            try {
                await newUser.save();
                console.log('User registered successfully:', { 
                    email: newUser.email, 
                    id: newUser.id,
                    userId: newUser._id 
                });
                logger.logAuth('REGISTRATION', newUser._id.toString(), true, {
                    email: newUser.email,
                    id: newUser.id
                });
                const token = ErrorHandler.setSuccess(req, 'Registration successful! You can now log in.');
                res.redirect('/?msg=' + token);
            } catch (err) {
                // Handle duplicate email or ID errors
                if (err.code === 11000) {
                    const field = Object.keys(err.keyPattern)[0];
                    const errorMsg = field === 'email' ? 'Email already exists' : 'ID number already exists';
                    console.error('Registration error - Duplicate entry:', { field, email: normalizedEmail || 'unknown', id: normalizedId });
                    logger.logValidation(field, field === 'email' ? normalizedEmail : normalizedId, 'Duplicate entry', 'anonymous');
                    const token = ErrorHandler.setError(req, 'registration', errorMsg);
                    return res.redirect('/?err=' + token);
                }
                
                // Handle validation errors
                if (err.name === 'ValidationError') {
                    const validationErrors = Object.values(err.errors).map(e => e.message).join(', ');
                    console.error('Registration error - Validation failed:', {
                        email: normalizedEmail || 'unknown',
                        errors: validationErrors,
                        fullError: err
                    });
                    logger.writeLog('ERROR', 'REGISTRATION', 'Validation error', {
                        email: normalizedEmail || 'unknown',
                        errors: validationErrors,
                        errorDetails: err.errors
                    });
                    const token = ErrorHandler.setError(req, 'registration', 'Validation error: ' + validationErrors);
                    return res.redirect('/?err=' + token);
                }

                // Handle other errors
                console.error('Registration error - Failed to save user:', {
                    email: normalizedEmail || 'unknown',
                    error: err.message,
                    errorName: err.name,
                    errorCode: err.code,
                    stack: err.stack,
                    fullError: err
                });
                logger.writeLog('ERROR', 'REGISTRATION', 'Failed to save user', {
                    email: normalizedEmail || 'unknown',
                    error: err.message,
                    errorName: err.name,
                    errorCode: err.code,
                    errorStack: err.stack
                });
                const token = ErrorHandler.setError(req, 'registration', 'Error saving user: ' + err.message);
                res.redirect('/?err=' + token);
            }
        });
    });
}

module.exports = { handleRegistration };