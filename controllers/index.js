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

function errorFn(error) {
    console.error(error);
}

router.get('/', function(req, resp){
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

router.post('/login', function (req,resp) {
    authLogin.handleLogin(req, resp);
});

router.get('/logout', function (req, resp) {
    req.session.destroy();
    resp.redirect('/LoginPage');
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
        return res.redirect('/helpdesk?error=validation&details=' + encodeURIComponent('Title must be 200 characters or less'));
    }
    if (description && description.length > 2000) {
        logger.logValidation('description', description, 'Exceeds maximum length of 2000 characters', req.user.id);
        return res.redirect('/helpdesk?error=validation&details=' + encodeURIComponent('Description must be 2000 characters or less'));
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
        const formattedUser = {
            ...user,
            lastLoginFormatted: user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never',
            lastActivityFormatted: user.lastActivity ? new Date(user.lastActivity).toLocaleString() : 'Never'
        };
        
        res.render('main', { 
            layout:'index', 
            title: 'Home',
            reservations, 
            user: formattedUser });
    } catch (error) {
        errorFn(error);
        res.redirect('/?error=server');
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

        res.render('main', { 
            layout:'index', 
            title: 'Home',
            reservations, user });
    } catch (error) {
        errorFn(error);
        res.redirect('/?error=server');
    }
});

router.get('/Profile', requireAuth, async (req,resp) =>{
    await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
    const user = await User.findById(req.user._id).lean();
    
    // Determine layout based on user role
    const userRole = user.accountType || (user._legacyRole === 'ADMIN' ? 'ADMINISTRATOR' : 'ROLE_B');
    const isAdmin = userRole === 'ADMINISTRATOR' || userRole === 'ROLE_A' || user._legacyRole === 'ADMIN';
    const layout = isAdmin ? 'admin' : 'profile';
    
    resp.render('Profile',{
    layout: layout,
    title: 'Profile',
    user,
    lastLogin: user.lastLogin,
    lastActivity: user.lastActivity
    });
});

router.get('/EditProfile', requireAuth, async (req,resp) =>{
    await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
    
    // Determine layout based on user role
    const userRole = req.user.accountType || (req.user._legacyRole === 'ADMIN' ? 'ADMINISTRATOR' : 'ROLE_B');
    const isAdmin = userRole === 'ADMINISTRATOR' || userRole === 'ROLE_A' || req.user._legacyRole === 'ADMIN';
    const layout = isAdmin ? 'admin' : 'editprofile';
    
    resp.render('EditProfile',{
        layout: layout,
        title: 'Edit Profile',
        user: req.user,
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
        return res.redirect('/EditProfile?error=validation&details=' + encodeURIComponent('First name must be 50 characters or less'));
    }
    if (lname && lname.length > 50) {
        logger.logValidation('lname', lname, 'Exceeds maximum length', req.user.id);
        return res.redirect('/EditProfile?error=validation&details=' + encodeURIComponent('Last name must be 50 characters or less'));
    }
    if (description1 && description1.length > 500) {
        logger.logValidation('description1', description1, 'Exceeds maximum length', req.user.id);
        return res.redirect('/EditProfile?error=validation&details=' + encodeURIComponent('Description must be 500 characters or less'));
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
        layout: false,
        title: 'Forgot Password',
        message: null,
        messageType: null
    });
});

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
const passwordChange = require('./passwordChange.js');

router.get('/change-password', requireAuth, async (req, resp) => {
    await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
    const user = await User.findById(req.user._id).lean();
    
    // Determine layout based on user role
    const userRole = user.accountType || (user._legacyRole === 'ADMIN' ? 'ADMINISTRATOR' : 'ROLE_B');
    const isAdmin = userRole === 'ADMINISTRATOR' || userRole === 'ROLE_A' || user._legacyRole === 'ADMIN';
    const layout = isAdmin ? 'admin' : 'profile';
    
    // Check if user has security question set
    if (!user.securityQuestion || !user.securityAnswer) {
        return resp.render('changePassword', {
            layout: layout,
            title: 'Change Password',
            user: user,
            error: 'Security question not set',
            details: 'Please contact administrator to set up your security question.'
        });
    }
    
    resp.render('changePassword', {
        layout: layout,
        title: 'Change Password',
        user: user,
        error: req.query.error ? decodeURIComponent(req.query.error) : null,
        details: req.query.details ? decodeURIComponent(req.query.details) : null,
        success: req.query.success ? decodeURIComponent(req.query.success) : null
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