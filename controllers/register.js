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
    const { fname, lname, id, email, password, password2 } = req.body;

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

    bcrypt.hash(password, saltRounds, function(err, hash) {
        if (err) {
            // Handle hashing error
            console.error(err);
            return res.redirect('/?error=server&details=' + encodeURIComponent('Error hashing password'));
        }

        // Create a new user document with the hashed password
        // Store password in history and set creation date
        const newUser = new User({ 
            fname, 
            lname, 
            id, 
            email, 
            password: hash,
            passwordHistory: [{ password: hash, createdAt: new Date() }],
            passwordCreatedAt: new Date()
        });

        // Save the user document to the database
        newUser.save()
            .then(() => {
                // If user is successfully saved, redirect to the main page or dashboard
                res.redirect('/?success=registered');
            })
            .catch(err => {
                // Handle duplicate email or ID errors
                if (err.code === 11000) {
                    const field = Object.keys(err.keyPattern)[0];
                    const errorMsg = field === 'email' ? 'Email already exists' : 'ID number already exists';
                    return res.redirect('/?error=registration&details=' + encodeURIComponent(errorMsg));
                }
                // If there's an error, redirect back to login page with error message
                res.redirect('/?error=registration&details=' + encodeURIComponent('Error saving user'));
            });
    });
}

module.exports = { handleRegistration };