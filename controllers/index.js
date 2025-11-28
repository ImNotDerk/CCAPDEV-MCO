const express = require('express');
const authLogin = require('./login.js');
const authRegister = require ('./register.js');
const router = express.Router();
const Laboratory = require('../models/laboratories.js');
const User = require('../models/users.js');
const Reservations = require('../models/reservations.js');
const reserve = require('./reservation.js');
const reservations = require('../models/reservations.js');
const labsController = require('./laboratory.js');
const helpDesk = require('../models/helpDesk.js');
const { requireAuth, optionalAuth } = require('../middleware/auth.js');
const passwordChange = require('./passwordChange.js');
const forgotPassword = require('./forgotPassword.js');
const logger = require('../utils/logger');
const ErrorHandler = require('../utils/errorHandler');

function errorFn(error) {
    console.error(error);
}

router.get('/', function(req, resp){
    // Check for obfuscated error/success tokens
    let error = null;
    let errorDetails = null;
    let success = null;
    
    if (req.query.err) {
        const errorData = ErrorHandler.getError(req, req.query.err);
        if (errorData) {
            error = errorData.type;
            errorDetails = errorData.message;
        }
    }
    
    if (req.query.msg) {
        const successMsg = ErrorHandler.getSuccess(req, req.query.msg);
        if (successMsg) {
            success = successMsg;
        }
    }
    
    // Fallback to old format for backward compatibility
    if (!error && req.query.error) {
        error = req.query.error;
        errorDetails = req.query.details;
    }
    if (!success && req.query.success) {
        success = req.query.success;
    }
    
    resp.render('LoginPage',{
        layout: 'login',
        title: 'Lab Reservation',
        error: error,
        errorDetails: errorDetails,
        success: success
    });
});

router.post('/login', function (req,resp) {
    authLogin.handleLogin(req, resp);
});

router.get('/logout', function (req, resp) {
    req.session.destroy(function(err) {
        if (err) {
            console.error('Error destroying session:', err);
        }
        // Clear the session cookie explicitly
        resp.clearCookie('connect.sid');
        resp.redirect('/LoginPage');
    });
});

router.post('/register', function (req,resp){
    authRegister.handleRegistration(req, resp);
});

router.get('/reservation', requireAuth, async (req,resp) =>{
    // Update last activity
    await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
    
    const labs = await Laboratory.find({}).lean();
    const reserveDates = await reserve.getNextFiveWeekdays();

    resp.render('Reservation', {
        layout: 'reservation',
        title: 'Reservations',
        user: req.user,
        labs,
        reserveDate: reserveDates
    });
});

router.get('/helpdesk', requireAuth, async (req,resp) => {
    await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
    resp.render('helpdesk',{
        layout: 'helpdesk',
        title: 'Helpdesk',
        user: req.user,
    });
});

router.post('/submit-helpdesk', requireAuth, async (req, res) => {
    await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
    const { userID, userEmail, title, description} = req.body;
    
    // Validate input length
    if (title && title.length > 200) {
        logger.logValidation('title', title, 'Exceeds maximum length of 200 characters', req.user.id);
        const token = ErrorHandler.setError(req, 'validation', 'Title must be 200 characters or less');
        return res.redirect('/helpdesk?err=' + token);
    }
    if (description && description.length > 2000) {
        logger.logValidation('description', description, 'Exceeds maximum length of 2000 characters', req.user.id);
        const token = ErrorHandler.setError(req, 'validation', 'Description must be 2000 characters or less');
        return res.redirect('/helpdesk?err=' + token);
    }

    try {
        res.render('helpdesk', {
            layout: 'helpdesk',
            title: 'Helpdesk',
            user: req.user,
        });
        try {
            const sendConcern = await helpDesk.insertMany(
                { UserID: userID, email: userEmail, title: title, description: description}
                );

                console.log(sendConcern);
        } catch (error) {console.log(error);}
    } catch (error) {
        console.error(error);
        res.status(500).send('Error processing Helpdesk concern.')
    }
});

router.get('/home', requireAuth, async (req, res) => {
    try {
        // Update last activity
        await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
        
        const user = req.user;

        let reservations =  await Laboratory.aggregate([
            {
                $unwind: "$reservationData", 
            },
            {
                $unwind: "$reservationData.reservationList", 
            },
            {
                $match: {
                "reservationData.reservationList.UserID": user.id,
                },
            },
            {
                $project: {
                _id: 0, // Exclude the _id field
                labName: "$name",
                reservation: "$reservationData.reservationList" ,
                },
            },
        ]);

        console.log(reservations);
        
        // Format dates for display
        const lastLoginDisplay = user.lastLoginPrevious || user.lastLogin;
        const formattedUser = {
            ...user,
            lastLoginFormatted: lastLoginDisplay ? new Date(lastLoginDisplay).toLocaleString() : 'Never',
            lastActivityFormatted: user.lastActivity ? new Date(user.lastActivity).toLocaleString() : 'Never'
        };
        
        res.render('main', { 
            layout:'index', 
            title: 'Home',
            reservations, 
            user: formattedUser });
    } catch (error) {
        errorFn(error);
        const token = ErrorHandler.setError(req, 'server', 'An error occurred. Please try again.');
        res.redirect('/?err=' + token);
    }
});

router.post('/home', requireAuth, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
        const user = req.user;

        let reservations =  await Laboratory.aggregate([
            {
                $unwind: "$reservationData", 
            },
            {
                $unwind: "$reservationData.reservationList", 
            },
            {
                $match: {
                "reservationData.reservationList.UserID": user.id,
                },
            },
            {
                $project: {
                _id: 0, // Exclude the _id field
                reservation: "$reservationData.reservationList" ,
                },
            },
        ]);

        const lastLoginDisplay = user.lastLoginPrevious || user.lastLogin;
        const formattedUser = {
            ...user,
            lastLoginFormatted: lastLoginDisplay ? new Date(lastLoginDisplay).toLocaleString() : 'Never',
            lastActivityFormatted: user.lastActivity ? new Date(user.lastActivity).toLocaleString() : 'Never'
        };

        res.render('main', { 
            layout:'index', 
            title: 'Home',
            reservations, 
            user: formattedUser });
    } catch (error) {
        errorFn(error);
        const token = ErrorHandler.setError(req, 'server', 'An error occurred. Please try again.');
        res.redirect('/?err=' + token);
    }
});

router.get('/Profile', requireAuth, async (req,resp) =>{
    await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
    const user = await User.findById(req.user._id).lean();
    
    // Determine layout based on user role
    const userRole = user.accountType || (user._legacyRole === 'ADMIN' ? 'ADMINISTRATOR' : 'ROLE_B');
    const isAdmin = userRole === 'ADMINISTRATOR' || userRole === 'ROLE_A' || user._legacyRole === 'ADMIN';
    const layout = isAdmin ? 'admin' : 'profile';
    
    const lastLoginDisplay = user.lastLoginPrevious || user.lastLogin;
    resp.render('Profile',{
    layout: layout,
    title: 'Profile',
    user,
    lastLogin: lastLoginDisplay ? new Date(lastLoginDisplay).toLocaleString() : null,
    lastActivity: user.lastActivity,
    isAdmin: isAdmin
    });
});

router.get('/EditProfile', requireAuth, async (req,resp) =>{
    await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
    const user = await User.findById(req.user._id).lean();
    
    // Determine layout based on user role
    const userRole = user.accountType || (user._legacyRole === 'ADMIN' ? 'ADMINISTRATOR' : 'ROLE_B');
    const isAdmin = userRole === 'ADMINISTRATOR' || userRole === 'ROLE_A' || user._legacyRole === 'ADMIN';
    const layout = isAdmin ? 'admin' : 'editprofile';
    
    // Calculate password age
    let passwordAgeInfo = null;
    if (user.passwordCreatedAt) {
        const daysSinceCreation = Math.floor((new Date() - new Date(user.passwordCreatedAt)) / (1000 * 60 * 60 * 24));
        const hoursSinceCreation = Math.floor((new Date() - new Date(user.passwordCreatedAt)) / (1000 * 60 * 60));
        
        if (daysSinceCreation < 1) {
            const hoursLeft = 24 - hoursSinceCreation;
            passwordAgeInfo = `Your password was created ${hoursSinceCreation} hour(s) ago. Password must be at least 1 day old before it can be changed. Please try again in ${hoursLeft} hour(s).`;
        } else {
            passwordAgeInfo = `Your password is ${daysSinceCreation} day(s) old.`;
        }
    }
    
    // Check for obfuscated error/success tokens
    let error = null;
    let details = null;
    let success = null;
    
    if (req.query.err) {
        const errorData = ErrorHandler.getError(req, req.query.err);
        if (errorData) {
            error = errorData.type;
            details = errorData.message;
        }
    }
    
    if (req.query.msg) {
        const successMsg = ErrorHandler.getSuccess(req, req.query.msg);
        if (successMsg) {
            success = successMsg;
        }
    }
    
    // Fallback to old format for backward compatibility
    if (!error && req.query.error) {
        error = req.query.error;
        details = req.query.details ? decodeURIComponent(req.query.details) : null;
    }
    if (!success && req.query.success) {
        success = req.query.success ? decodeURIComponent(req.query.success) : null;
    }
    
    resp.render('EditProfile',{
        layout: layout,
        title: 'Edit Profile',
        user: user,
        error: error,
        details: details,
        success: success,
        passwordAgeInfo: passwordAgeInfo
    });
});

router.post('/Profile', requireAuth, async (req,resp) =>{
    await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
    const user = await User.findById(req.user._id).lean();
    let img = '';
    if (user.profilepic && user.profilepic.data) {
        img = `data:${user.profilepic.contentType};base64,${user.profilepic.data.toString('base64')}`;
    }
    
    // Determine layout based on user role
    const userRole = user.accountType || (user._legacyRole === 'ADMIN' ? 'ADMINISTRATOR' : 'ROLE_B');
    const isAdmin = userRole === 'ADMINISTRATOR' || userRole === 'ROLE_A' || user._legacyRole === 'ADMIN';
    const layout = isAdmin ? 'admin' : 'profile';
    
    resp.render('Profile',{
    layout: layout,
    title: 'Profile',
    user,
    img
    });
});

router.post('/updateProfile', requireAuth, async (req, resp) => {
    await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
    const { fname, lname, id, email, description1, profilepic} = req.body;
    const userId = req.user._id;
    
    // Validate input lengths
    if (fname && fname.length > 50) {
        logger.logValidation('fname', fname, 'Exceeds maximum length', req.user.id);
        const token = ErrorHandler.setError(req, 'validation', 'First name must be 50 characters or less');
        return resp.redirect('/EditProfile?err=' + token);
    }
    if (lname && lname.length > 50) {
        logger.logValidation('lname', lname, 'Exceeds maximum length', req.user.id);
        const token = ErrorHandler.setError(req, 'validation', 'Last name must be 50 characters or less');
        return resp.redirect('/EditProfile?err=' + token);
    }
    if (description1 && description1.length > 500) {
        logger.logValidation('description1', description1, 'Exceeds maximum length', req.user.id);
        const token = ErrorHandler.setError(req, 'validation', 'Description must be 500 characters or less');
        return resp.redirect('/EditProfile?err=' + token);
    }

    let updateFields = {};

    if (fname) updateFields.fname = fname;
    if (lname) updateFields.lname = lname;
    if (id) updateFields.id = id;
    if (email) updateFields.email = email;
    if (description1) updateFields.description1 = description1;
    if (profilepic) updateFields.profilepic = profilepic

    if (Object.keys(updateFields).length > 0) {
        try {
            await User.findOneAndUpdate(
                { _id: userId },
                updateFields,
                { new: true }
            );
            resp.redirect(`/Profile`); 
        } catch (error) {
            errorFn(error);
        }
    } else {
        resp.redirect(`/Profile`); 
    }
});

// Update Security Question Route
router.post('/update-security-question', requireAuth, async (req, resp) => {
    await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
    const { currentSecurityAnswer, securityQuestion, newSecurityAnswer } = req.body;
    const userId = req.user._id;

    try {
        const user = await User.findById(userId);
        if (!user) {
            const token = ErrorHandler.setError(req, 'security', 'User not found');
            return resp.redirect('/EditProfile?err=' + token);
        }

        // Check if user has a security question set
        const hasSecurityQuestion = user.securityQuestion && user.securityAnswer;
        
        // Validate required fields
        if (hasSecurityQuestion) {
            // If security question exists, require current answer
            if (!currentSecurityAnswer || !securityQuestion || !newSecurityAnswer) {
                const token = ErrorHandler.setError(req, 'security', 'All fields are required');
                return resp.redirect('/EditProfile?err=' + token);
            }
        } else {
            // If no security question exists, only require new question and answer
            if (!securityQuestion || !newSecurityAnswer) {
                const token = ErrorHandler.setError(req, 'security', 'Security question and answer are required');
                return resp.redirect('/EditProfile?err=' + token);
            }
        }

        // Validate security answer length
        if (newSecurityAnswer.length > 100) {
            logger.writeLog('WARN', 'SECURITY_QUESTION_CHANGE', 'Security answer validation failed - exceeds length limit', {
                userId: userId.toString(),
                email: user.email,
                answerLength: newSecurityAnswer.length,
                timestamp: new Date().toISOString()
            });
            const token = ErrorHandler.setError(req, 'security', 'Security answer must be 100 characters or less');
            return resp.redirect('/EditProfile?err=' + token);
        }

        // Validate security answer is not empty after trimming
        if (!newSecurityAnswer.trim()) {
            logger.writeLog('WARN', 'SECURITY_QUESTION_CHANGE', 'Security answer validation failed - empty answer', {
                userId: userId.toString(),
                email: user.email,
                timestamp: new Date().toISOString()
            });
            const token = ErrorHandler.setError(req, 'security', 'Security answer cannot be empty');
            return resp.redirect('/EditProfile?err=' + token);
        }

        // Verify current security answer only if one exists
        if (hasSecurityQuestion) {
            const bcrypt = require('bcrypt');
            const normalizedCurrentAnswer = currentSecurityAnswer.trim().toLowerCase();
            const isCurrentAnswerMatch = await bcrypt.compare(normalizedCurrentAnswer, user.securityAnswer);
            
            if (!isCurrentAnswerMatch) {
                logger.writeLog('WARN', 'SECURITY_QUESTION_CHANGE', 'Incorrect current security answer provided', {
                    userId: userId.toString(),
                    email: user.email,
                    timestamp: new Date().toISOString()
                });
                console.log('Security question change failed - incorrect current answer:', {
                    userId: userId.toString(),
                    email: user.email
                });
                const token = ErrorHandler.setError(req, 'security', 'Current security answer is incorrect');
                return resp.redirect('/EditProfile?err=' + token);
            }
        }

        // Validate security question is in the enum
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

        if (!VALID_SECURITY_QUESTIONS.includes(securityQuestion)) {
            logger.writeLog('WARN', 'SECURITY_QUESTION_CHANGE', 'Invalid security question selected', {
                userId: userId.toString(),
                email: user.email,
                selectedQuestion: securityQuestion,
                timestamp: new Date().toISOString()
            });
            const token = ErrorHandler.setError(req, 'security', 'Invalid security question selected');
            return resp.redirect('/EditProfile?err=' + token);
        }

        // Hash new security answer
        const bcrypt = require('bcrypt');
        const saltRounds = 10;
        const normalizedNewAnswer = newSecurityAnswer.trim().toLowerCase();
        const hashedNewAnswer = await bcrypt.hash(normalizedNewAnswer, saltRounds);

        // Log before update
        const action = hasSecurityQuestion ? 'UPDATE' : 'SET';
        const oldQuestion = user.securityQuestion || 'None';
        
        console.log('Security question change attempt:', {
            userId: userId.toString(),
            email: user.email,
            action: action,
            oldQuestion: oldQuestion,
            newQuestion: securityQuestion
        });

        // Update security question and answer
        user.securityQuestion = securityQuestion;
        user.securityAnswer = hashedNewAnswer;
        
        try {
            // Save using Mongoose save method
            const savedUser = await user.save();
            
            // Verify the save was successful by querying the database
            const updatedUser = await User.findById(userId);
            if (!updatedUser) {
                throw new Error('User not found after save');
            }
            
            if (updatedUser.securityQuestion !== securityQuestion) {
                // If save didn't work, try using findByIdAndUpdate as fallback
                console.warn('Security question not updated via save(), trying findByIdAndUpdate...');
                await User.findByIdAndUpdate(userId, {
                    securityQuestion: securityQuestion,
                    securityAnswer: hashedNewAnswer
                }, { new: true, runValidators: true });
                
                // Verify again
                const recheckedUser = await User.findById(userId);
                if (!recheckedUser || recheckedUser.securityQuestion !== securityQuestion) {
                    throw new Error('Security question was not saved correctly even with findByIdAndUpdate');
                }
            }

            // Log successful change with details
            logger.writeLog('INFO', 'SECURITY_QUESTION_CHANGE', `Security question ${action === 'SET' ? 'set' : 'updated'} successfully`, {
                userId: userId.toString(),
                email: user.email,
                action: action,
                oldQuestion: oldQuestion,
                newQuestion: securityQuestion,
                timestamp: new Date().toISOString()
            });

            console.log('Security question change successful:', {
                userId: userId.toString(),
                email: user.email,
                action: action,
                newQuestion: securityQuestion
            });

            const successMessage = hasSecurityQuestion 
                ? 'Security question updated successfully!' 
                : 'Security question set successfully!';
            const token = ErrorHandler.setSuccess(req, successMessage);
            return resp.redirect('/EditProfile?msg=' + token);
        } catch (saveError) {
            console.error('Error saving security question:', saveError);
            logger.writeLog('ERROR', 'SECURITY_QUESTION_CHANGE', 'Failed to save security question', {
                userId: userId.toString(),
                email: user.email,
                action: action,
                error: saveError.message,
                stack: saveError.stack,
                timestamp: new Date().toISOString()
            });
            const token = ErrorHandler.setError(req, 'server', 'Failed to save security question. Please try again.');
            return resp.redirect('/EditProfile?err=' + token);
        }
    } catch (error) {
        console.error('Security question update error:', error);
        logger.writeLog('ERROR', 'SECURITY_QUESTION_CHANGE', 'Failed to update security question - exception caught', {
            userId: userId ? userId.toString() : 'unknown',
            email: req.user ? req.user.email : 'unknown',
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
        const token = ErrorHandler.setError(req, 'server', 'An error occurred. Please try again.');
        return resp.redirect('/EditProfile?err=' + token);
    }
});

router.get('/LoginPage', function(req, resp){
    const error = req.query.error;
    const errorDetails = req.query.details;
    const success = req.query.success;
    resp.render('LoginPage',{
        layout: 'login',
        title: 'Lab Reservation',
        error: error,
        errorDetails: errorDetails,
        success: success
    });
});

// Forgot Password Routes
router.get('/forgotpassword', function(req, resp) {
    resp.render('forgotPassword', {
        layout: 'login',
        title: 'Forgot Password',
        message: null,
        messageType: null
    });
});

router.post('/forgotpassword', async function(req, resp) {
    await forgotPassword.handleForgotPassword(req, resp);
});

// Forgot password - verify security answer
router.post('/forgotpassword-verify', async function(req, resp) {
    await forgotPassword.handleSecurityAnswerVerification(req, resp);
});

// Reset Password Routes
router.get('/reset-password', async function(req, resp) {
    await forgotPassword.handleResetPassword(req, resp);
});

router.post('/reset-password', async function(req, resp) {
    await forgotPassword.handleResetPassword(req, resp);
});

// Change Password Routes
router.get('/change-password', requireAuth, async (req, resp) => {
    await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
    const user = await User.findById(req.user._id).lean();
    
    // Determine layout based on user role
    const userRole = user.accountType || (user._legacyRole === 'ADMIN' ? 'ADMINISTRATOR' : 'ROLE_B');
    const isAdmin = userRole === 'ADMINISTRATOR' || userRole === 'ROLE_A' || user._legacyRole === 'ADMIN';
    const layout = isAdmin ? 'admin' : 'profile';
    
    // Calculate password age
    let passwordAgeInfo = null;
    if (user.passwordCreatedAt) {
        const daysSinceCreation = Math.floor((new Date() - new Date(user.passwordCreatedAt)) / (1000 * 60 * 60 * 24));
        const hoursSinceCreation = Math.floor((new Date() - new Date(user.passwordCreatedAt)) / (1000 * 60 * 60));
        
        if (daysSinceCreation < 1) {
            const hoursLeft = 24 - hoursSinceCreation;
            passwordAgeInfo = `Your password was created ${hoursSinceCreation} hour(s) ago. Password must be at least 1 day old before it can be changed. Please try again in ${hoursLeft} hour(s).`;
        } else {
            passwordAgeInfo = `Your password is ${daysSinceCreation} day(s) old.`;
        }
    }
    
    resp.render('changePassword', {
        layout: layout,
        title: 'Change Password',
        user: user,
        error: req.query.error ? decodeURIComponent(req.query.error) : null,
        details: req.query.details ? decodeURIComponent(req.query.details) : null,
        success: req.query.success === 'changed' ? true : null,
        passwordAgeInfo: passwordAgeInfo
    });
});

router.post('/change-password', requireAuth, async (req, resp) => {
    await passwordChange.handlePasswordChange(req, resp);
});

router.get('/AboutUs', requireAuth, async (req, resp) => {
    await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
    resp.render('AboutUs', {
        layout: 'helpdesk',
        title: 'About Us',
        user: req.user
    });
});

router.post('/selectlab', requireAuth, async (req, res) => {
    await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
    const userId = req.user._id;
    const reqLabName = req.body.labName;
    const selectedDate = req.body.selectedDate;
    const selectedTime = req.body.time;

    req.session.date = selectedDate;
    req.session.time = selectedTime;

    let labDetails = [];

    let reqReservationList = await Laboratory.aggregate([{ $match: { name: reqLabName, },},{ $unwind: "$reservationData", }, { $unwind: "$reservationData.reservationList", }, 
    { $match: { "reservationData.reservationList.date": selectedDate, "reservationData.reservationList.time": selectedTime }, }, 
    { $project: { _id: 0, reservation: "$reservationData.reservationList", }, }, ]);

    if(reqReservationList.length == 0) {
        await labsController.checkExistingReservationList(reqReservationList, reqLabName, selectedDate, selectedTime);
        reqReservationList = await Laboratory.aggregate([{ $match: { name: reqLabName, },},{ $unwind: "$reservationData", }, { $unwind: "$reservationData.reservationList", }, 
                                                         { $match: { "reservationData.reservationList.date": selectedDate, "reservationData.reservationList.time": selectedTime }, }, 
                                                         { $project: { _id: 0, reservation: "$reservationData.reservationList", }, }, ] );
    }

    labDetails = await Laboratory.aggregate([
        { $match: { name: reqLabName } },
        { $unwind: "$reservationData" },
        { $unwind: "$reservationData.reservationList" },
        { $match: { "reservationData.reservationList.date": selectedDate, "reservationData.reservationList.time": selectedTime } },
        { $project: { _id: 0, "usage": "$reservationData.usage", "capacity": "$capacity", "status": "$reservationData.status" } },
        { $limit: 1 }
    ]);


    labDetails = await reserve.updateDetails(labDetails);


    
    const user = await User.findById(userId).lean();
    const reserveDates = await reserve.getNextFiveWeekdays();
    req.session.selectedLabName = reqLabName;  // set lab name to current session; global variable
    try {


        res.render('Reservation', {
            layout: 'reservation',
            title: 'Reservation',
            user, // pass the user's details to the template
            reserveDate: reserveDates,
            labName: reqLabName,
            labDetails,
            reqReservationList, // pass the selected lab's details to the template
            labs: await Laboratory.find({}).lean(), // Pass the list of labs again for the dropdown
            date: selectedDate,
            time: selectedTime
        });
    } catch(error) { errorFn(error);}
});

router.post('/404', optionalAuth, async (req, resp) => {
    // Determine layout based on user role if user is logged in
    let layout = 'editprofile';
    if (req.user) {
        const userRole = req.user.accountType || (req.user._legacyRole === 'ADMIN' ? 'ADMINISTRATOR' : 'ROLE_B');
        const isAdmin = userRole === 'ADMINISTRATOR' || userRole === 'ROLE_A' || req.user._legacyRole === 'ADMIN';
        layout = isAdmin ? 'admin' : 'editprofile';
    }
    
    resp.render('404', {
        layout: layout,
        title: '404',
        user: req.user || null
    });
});

router.get('/404', optionalAuth, async (req, resp) => {
    // Determine layout based on user role if user is logged in
    let layout = 'editprofile';
    if (req.user) {
        const userRole = req.user.accountType || (req.user._legacyRole === 'ADMIN' ? 'ADMINISTRATOR' : 'ROLE_B');
        const isAdmin = userRole === 'ADMINISTRATOR' || userRole === 'ROLE_A' || req.user._legacyRole === 'ADMIN';
        layout = isAdmin ? 'admin' : 'editprofile';
    }
    
    resp.render('404', {
        layout: layout,
        title: '404',
        user: req.user || null
    });
});

router.post('/reserve', requireAuth, async (req, resp) => {
    await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
    const SlotID = req.body.SlotID;
    
    resp.render('confirm-reservation', { 
        layout: 'reservation',
        SlotID, 
        user: req.user,
    });
});

router.post('/confirm-reservation', requireAuth, async (req, res) => {
    await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
    const SlotID = req.body.SlotID;
    const userId = req.user._id;
    const reqLabName = req.session.selectedLabName;
    const selectedDate = req.session.date;
    const selectedTime = req.session.time;
    const user = req.user;
    const labs = await Laboratory.find({}).lean();
    const reserveDates = await reserve.getNextFiveWeekdays();
    
    try {
        res.render('Reservation', {
            layout: 'reservation',
            title: 'Reservations',
            user,
            labs,
            reserveDate: reserveDates
        });
        try {

            const updatedDocument = await Laboratory.findOneAndUpdate(
                { 
                    name: reqLabName,
                }, 
                { 
                    $set: {
                        "reservationData.$[].reservationList.$[inner].UserID": user.id,
                        "reservationData.$[].reservationList.$[inner].isOccupied": true,
                    },

                },
                { 
                    arrayFilters: [
                        { 
                            "inner.SlotID": typeof SlotID === 'string' ? parseInt(SlotID, 10) : SlotID, 
                            "inner.date": String(selectedDate).trim(), 
                            "inner.time": String(selectedTime).trim(), 
                            "inner.isOccupied": false 
                        },
                    ],
                    new: true, 
                }
            );
            await Laboratory.findOneAndUpdate( // increment usage
                {
                    name: reqLabName,
                },
                {
                    $inc: {
                        "reservationData.$[outer].usage": 1
                    }
                },
                { 
                    arrayFilters: [
                        { "outer.reservationList.date": selectedDate, "outer.reservationList.time": selectedTime },
                    ],
                    new: true, 
                }
            )
    
        } catch(error) {console.log(error);}


    } catch (error) {
        console.error(error);
        res.status(500).send('Error processing reservation.');
    }
});


router.post('/deleteReserve', requireAuth, async (req, res) => {
    await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
    const { labName, SlotID, date, time } = req.body;

    try {
        await Laboratory.findOneAndUpdate(
            { 
                name: labName,
            },
            {
                $set: {
                    "reservationData.$[].reservationList.$[inner].UserID":  "", 
                    "reservationData.$[].reservationList.$[inner].isOccupied": false 
                },
            },
            {
                arrayFilters: [
                    { "inner.SlotID": SlotID, "inner.date": date, "inner.time": time },
                ],
                new: true
            }
        );
        await Laboratory.findOneAndUpdate(
            {
                name: labName,
            },
            {
                $inc: {
                    "reservationData.$[outer].usage": -1
                }
            },
            { 
                arrayFilters: [
                    { "outer.reservationList.date": date, "outer.reservationList.time": time },
                ],
                new: true, 
            }
        )
        

        console.log("Reservation deleted successfully");
        res.redirect("/home");
    } catch (error) {
        console.error("Error deleting reservation:", error);
        res.status(500).send("Error deleting reservation");
    }
});

router.post('/editReserve', requireAuth, async (req, res) => {
    await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
    const { labName, SlotID, date, time } = req.body;
    try {
        await Laboratory.findOneAndUpdate(
            { 
                name: labName,
            },
            {
                $set: {
                    "reservationData.$[].reservationList.$[inner].UserID":  "", 
                    "reservationData.$[].reservationList.$[inner].isOccupied": false 
                },
                $inc: {
                    "reservationData.$[].usage": -1
                },
            },
            {
                arrayFilters: [
                    { "inner.SlotID": SlotID, "inner.date": date, "inner.time": time },
                ],
                new: true
            }
        );
        await Laboratory.findOneAndUpdate( // increment usage
                {
                    name: labName,
                },
                {
                    $inc: {
                        "reservationData.$[outer].usage": 1
                    }
                },
                { 
                    arrayFilters: [
                        { "outer.reservationList.date": date, "outer.reservationList.time": time },
                    ],
                    new: true, 
                }
            )

        console.log("Reservation deleted successfully");
        res.redirect("/reservation");
    } catch (error) {
        console.error("Error deleting reservation:", error);
        res.status(500).send("Error deleting reservation");
    }
});

module.exports = router;