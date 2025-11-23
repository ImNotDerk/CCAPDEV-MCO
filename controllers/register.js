const User = require('../models/users.js');
const bcrypt = require('bcrypt');

const saltRounds = 10; // Define the number of salt rounds for hashing

// Password complexity validation function
function validatePassword(password) {
    const errors = [];
    
    // Minimum 8 characters
    if (password.length < 8) {
        errors.push('Password must be at least 8 characters long');
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

    // Validate required fields
    if (!securityQuestion || !securityAnswer || securityAnswer.trim() === '') {
        return res.redirect('/?error=registration&details=' + encodeURIComponent('Security question and answer are required'));
    }

    // Validate security answer length
    if (securityAnswer.length > 100) {
        return res.redirect('/?error=registration&details=' + encodeURIComponent('Security answer must be 100 characters or less'));
    }

    // Validate password complexity
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
        const errorMessage = passwordValidation.errors.join('. ');
        return res.redirect('/?error=password&details=' + encodeURIComponent(errorMessage));
    }

    // Check if passwords match
    if (password !== password2) {
        return res.redirect('/?error=password&details=' + encodeURIComponent('Passwords do not match'));
    }

    // Hash password
    bcrypt.hash(password, saltRounds, async function(err, hash) {
        if (err) {
            // Handle hashing error
            console.error(err);
            return res.redirect('/?error=server&details=' + encodeURIComponent('Error hashing password'));
        }

        // Hash security answer
        bcrypt.hash(securityAnswer.trim().toLowerCase(), saltRounds, async function(err2, answerHash) {
            if (err2) {
                console.error(err2);
                return res.redirect('/?error=server&details=' + encodeURIComponent('Error processing security answer'));
            }

            // Create a new user document with the hashed password and security answer
            const newUser = new User({ 
                fname, 
                lname, 
                id, 
                email: email.toLowerCase().trim(), 
                password: hash,
                securityQuestion: securityQuestion,
                securityAnswer: answerHash,
                passwordHistory: [{ password: hash, createdAt: new Date() }],
                passwordCreatedAt: new Date()
            });

            // Save the user document to the database
            try {
                await newUser.save();
                res.redirect('/?success=registered');
            } catch (err) {
                // Handle duplicate email or ID errors
                if (err.code === 11000) {
                    const field = Object.keys(err.keyPattern)[0];
                    const errorMsg = field === 'email' ? 'Email already exists' : 'ID number already exists';
                    return res.redirect('/?error=registration&details=' + encodeURIComponent(errorMsg));
                }
                // If there's an error, redirect back to login page with error message
                res.redirect('/?error=registration&details=' + encodeURIComponent('Error saving user'));
            }
        });
    });
}

module.exports = { handleRegistration };