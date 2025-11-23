const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const UserSchema = new mongoose.Schema({
    fname: {
        type: String,
        required: true
    },
    lname: {
        type: String,
        required: true
    },
    id: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    description1: {
        type: String,
        required: false,
        default: 'Hello, world!',
    },
    profilepic:{
        type: String,
        required: false,
        default: 'https://images.ctfassets.net/h6goo9gw1hh6/2sNZtFAWOdP1lmQ33VwRN3/24e953b920a9cd0ff2e1d587742a2472/1-intro-photo-final.jpg?w=1200&h=992&q=70&fm=webp'
    },
    accountType:{
        type: String,
        enum: ['ADMINISTRATOR', 'ROLE_A', 'ROLE_B', 'ADMIN', 'STUDENT'], // Include old values for migration
        required: true,
        default: 'ROLE_B'
    },
    // For backward compatibility, also support old role names
    // ADMIN -> ADMINISTRATOR, STUDENT -> ROLE_B
    _legacyRole: {
        type: String,
        enum: ['STUDENT', 'ADMIN'],
        required: false
    },
    lastLogin: {
        type: Date,
        default: null
    },
    lastActivity: {
        type: Date,
        default: null
    },
    passwordHistory: [{
        password: String,
        createdAt: { type: Date, default: Date.now }
    }],
    passwordCreatedAt: {
        type: Date,
        default: Date.now
    },
    failedLoginAttempts: {
        type: Number,
        default: 0
    },
    accountLockedUntil: {
        type: Date,
        default: null
    },
    passwordResetToken: {
        type: String,
        default: null
    },
    passwordResetTokenExpires: {
        type: Date,
        default: null
    },
    passwordResetAttempts: {
        type: Number,
        default: 0
    },
    lastPasswordResetRequest: {
        type: Date,
        default: null
    },
    securityQuestion: {
        type: String,
        required: false,
        enum: [
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
        ]
    },
    securityAnswer: {
        type: String,
        required: false
    }
});

// Pre-save hook to migrate old role names to new ones
UserSchema.pre('save', function(next) {
    // Migrate old role names to new ones
    if (this.accountType === 'ADMIN') {
        this._legacyRole = 'ADMIN'; // Store original for reference
        this.accountType = 'ADMINISTRATOR';
    } else if (this.accountType === 'STUDENT') {
        this._legacyRole = 'STUDENT'; // Store original for reference
        this.accountType = 'ROLE_B';
    }
    next();
});

// Pre-update hook for findOneAndUpdate, updateOne, etc.
UserSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function(next) {
    const update = this.getUpdate();
    
    // Handle direct accountType updates
    if (update && update.accountType) {
        if (update.accountType === 'ADMIN') {
            update.accountType = 'ADMINISTRATOR';
            update._legacyRole = 'ADMIN';
        } else if (update.accountType === 'STUDENT') {
            update.accountType = 'ROLE_B';
            update._legacyRole = 'STUDENT';
        }
    }
    
    // Handle $set updates
    if (update && update.$set && update.$set.accountType) {
        if (update.$set.accountType === 'ADMIN') {
            update.$set.accountType = 'ADMINISTRATOR';
            update.$set._legacyRole = 'ADMIN';
        } else if (update.$set.accountType === 'STUDENT') {
            update.$set.accountType = 'ROLE_B';
            update.$set._legacyRole = 'STUDENT';
        }
    }
    
    next();
});

module.exports = mongoose.model('User', UserSchema);
