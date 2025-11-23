const express = require('express');
const authLogin = require('./login.js');
const authRegister = require ('./register.js');
const adminRouter = express.Router();
const Laboratory = require('../models/laboratories.js');
const User = require('../models/users.js');
const Reservations = require('../models/reservations.js');
const reserve = require('./reservation.js');
const reservations = require('../models/reservations.js');
const labsController = require('./laboratory.js');
const helpdesk = require('../models/helpDesk.js');
const { requireAuth, requireRole } = require('../middleware/auth.js');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const userManagement = require('./adminUserManagement.js');

// All admin routes require authentication
adminRouter.use(requireAuth);

// Role-based access: ADMINISTRATOR, ROLE_A, or legacy ADMIN
function requireAdminRole(req, res, next) {
    const userRole = req.user.accountType || (req.user._legacyRole === 'ADMIN' ? 'ADMINISTRATOR' : 'ROLE_B');
    if (['ADMINISTRATOR', 'ROLE_A'].includes(userRole) || req.user._legacyRole === 'ADMIN') {
        return next();
    }
    logger.logAccessControl(req.user.id, req.path, 'Insufficient role for admin access');
    return res.status(403).render('403', {
        layout: 'editprofile',
        title: 'Access Denied',
        user: req.user,
        message: 'You do not have permission to access this resource.'
    });
}

// Apply role check to all admin routes
adminRouter.use(requireAdminRole);

adminRouter.get('/index', async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
        const user = req.user;
        let reservations =  await Laboratory.aggregate([
            {
                $unwind: "$reservationData", // Deconstruct the reservationData array
            },
            {
                $unwind: "$reservationData.reservationList", // Deconstruct the reservationList array
            },
            {
                $match: {
                "reservationData.reservationList.isOccupied": true,
                },
            },
            {
                $project: {
                _id: 0, // Exclude the _id field
                labName: "$name",
                reservation: "$reservationData.reservationList" , // Include only the reservationList field
                },
            },
        ]);
        
        res.render('adminIndex', { 
            layout:'admin', 
            title: 'Admin Home',
            reservations,
            user
        });
    } catch (error) {
        console.log(error);
    }
});

adminRouter.post('/addreservation', async (req, res) => {
    await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
    res.redirect('/admin/reservation');
});

adminRouter.post('/confirm-reservation', async (req, res) => {
    await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
    const SlotID = req.body.SlotID;
    const userId = req.user._id;
    const reqLabName = req.session.selectedLabName;
    const selectedDate = req.session.date;
    const selectedTime = req.session.time;
    const user = req.user;
    const labs = await Laboratory.find({}).lean();
    const reserveDates = await reserve.getNextFiveWeekdays(); 
    let newUser = req.session.newUser;
   
    if(!newUser){
        newUser = "[hidden]";
    };
  
    try {
        res.render('ReservationAdmin', {
            layout: 'reservationadmin',
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
                        "reservationData.$[].reservationList.$[inner].UserID": newUser,
                        "reservationData.$[].reservationList.$[inner].isOccupied": true,
                    },

                },
                { 
                    arrayFilters: [
                        { "inner.SlotID": SlotID, "inner.date": selectedDate, "inner.time": selectedTime, "inner.isOccupied": false },
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

adminRouter.get('/reservation', async (req, resp) => {
    await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
    const user = req.user;
    const labs = await Laboratory.find({}).lean();
    const reserveDates = await reserve.getNextFiveWeekdays();
    resp.render('ReservationAdmin', {
        layout: 'reservationadmin',
        title: 'Admin Reservation',
        labs,
        user,
        reserveDate: reserveDates
    });
})

adminRouter.post('/reserve', async (req, resp) => {
    await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
    const user = req.user;
    const SlotID = req.body.SlotID;
    resp.render('confirm-reservation-admin', { 
        layout: 'reservationadmin',
        SlotID, 
        user,
    });
});



adminRouter.post('/deleteReserve', async (req, res) => {
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
        res.redirect("/admin/index");
    } catch (error) {
        console.error("Error deleting reservation:", error);
        res.status(500).send("Error deleting reservation");
    }
});

adminRouter.post('/editReserve', async (req, res) => {
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
        res.redirect("/admin/reservation");
    } catch (error) {
        console.error("Error deleting reservation:", error);
        res.status(500).send("Error deleting reservation");
    }
});

adminRouter.post('/selectlab', async (req, res) => {
    await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
    const userId = req.user._id;
    const reqLabName = req.body.labName;
    const selectedDate = req.body.selectedDate;
    const selectedTime = req.body.time;
    const newUser = req.body.newID;
    req.session.newUser = newUser;
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

   

    
    const user = req.user;
    const reserveDates = await reserve.getNextFiveWeekdays();
    req.session.selectedLabName = reqLabName;  
    try {


        res.render('ReservationAdmin', {
            layout: 'reservationadmin',
            title: 'Reservation',
            newUser: newUser,
            user, 
            reserveDate: reserveDates,
            labName: reqLabName,
            labDetails,
            reqReservationList, 
            labs: await Laboratory.find({}).lean(),
            date: selectedDate,
            time: selectedTime
        });
    } catch(error) { errorFn(error);}
});

adminRouter.get('/AboutUs', async (req, resp) => {
    await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
    const user = req.user; 
    resp.render('AboutUs', {
        layout: 'helpdesk',
        title: 'About us',
        user
    });
});

adminRouter.get('/queries', async (req, resp) => {
    await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
    const user = req.user; 
    const queries = await helpdesk.find({}).lean();
    resp.render('queries', {
        layout: 'admin',
        title: 'Queries',
        queries,
        user
    });
});

// Admin logs view - Protected, ADMINISTRATOR only
adminRouter.get('/logs', async (req, resp) => {
    try {
        const userRole = req.user.accountType || (req.user._legacyRole === 'ADMIN' ? 'ADMINISTRATOR' : 'ROLE_B');
        
        // Only ADMINISTRATOR can access logs
        if (userRole !== 'ADMINISTRATOR' && req.user._legacyRole !== 'ADMIN') {
            logger.logAccessControl(req.user.id, '/admin/logs', 'Non-administrator attempted to access logs');
            return resp.status(403).render('403', {
                layout: 'editprofile',
                title: 'Access Denied',
                user: req.user,
                message: 'Only Administrators can access application logs.'
            });
        }
        
        await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
        
        const LOG_DIR = path.join(__dirname, '../logs');
        const logFiles = [];
        
        if (fs.existsSync(LOG_DIR)) {
            const files = fs.readdirSync(LOG_DIR);
            logFiles.push(...files.filter(f => f.endsWith('.log')));
        }
        
        resp.render('adminLogs', {
            layout: 'admin',
            title: 'Security Logs',
            user: req.user,
            logFiles: logFiles
        });
    } catch (error) {
        console.error('Error accessing logs:', error);
        logger.logAccessControl(req.user.id, '/admin/logs', 'Error accessing logs');
        resp.status(500).render('500', { layout: false, title: 'Server Error' });
    }
});

adminRouter.get('/logs/:filename', async (req, resp) => {
    try {
        const userRole = req.user.accountType || (req.user._legacyRole === 'ADMIN' ? 'ADMINISTRATOR' : 'ROLE_B');
        
        // Only ADMINISTRATOR can access logs
        if (userRole !== 'ADMINISTRATOR' && req.user._legacyRole !== 'ADMIN') {
            logger.logAccessControl(req.user.id, `/admin/logs/${req.params.filename}`, 'Non-administrator attempted to access logs');
            return resp.status(403).render('403', { layout: false, title: 'Access Denied' });
        }
        
        await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
        
        const LOG_DIR = path.join(__dirname, '../logs');
        const filename = req.params.filename;
        const filepath = path.join(LOG_DIR, filename);
        
        // Security: Prevent directory traversal
        if (!filepath.startsWith(LOG_DIR) || !filename.endsWith('.log')) {
            logger.logAccessControl(req.user.id, `/admin/logs/${filename}`, 'Invalid file access attempt');
            return resp.status(403).render('403', { layout: false, title: 'Access Denied' });
        }
        
        if (!fs.existsSync(filepath)) {
            return resp.status(404).render('404', { layout: false, title: 'Not Found' });
        }
        
        const logContent = fs.readFileSync(filepath, 'utf8');
        const lines = logContent.split('\n').filter(l => l.trim()).map(l => {
            try {
                return JSON.parse(l);
            } catch {
                return { raw: l };
            }
        });
        
        resp.render('adminLogView', {
            layout: 'admin',
            title: `Log: ${filename}`,
            user: req.user,
            filename: filename,
            logs: lines
        });
    } catch (error) {
        console.error('Error reading log file:', error);
        resp.status(500).render('500', { layout: false, title: 'Server Error' });
    }
});

// User Management Routes
// Get all users
adminRouter.get('/users', async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user._id, { lastActivity: new Date() });
        const users = await userManagement.getAllUsers(req.user);
        res.render('adminUsers', {
            layout: 'admin',
            title: 'User Management',
            user: req.user,
            users: users,
            isAdministrator: (req.user.accountType === 'ADMINISTRATOR' || req.user._legacyRole === 'ADMIN'),
            req: req // Pass req for query parameters
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).render('500', { layout: false, title: 'Server Error' });
    }
});

// Create user (POST)
adminRouter.post('/users/create', async (req, res) => {
    await userManagement.createUser(req, res);
});

// Update user role (POST)
adminRouter.post('/users/:userId/role', async (req, res) => {
    await userManagement.updateUserRole(req, res);
});

// Show delete confirmation with re-authentication (GET)
adminRouter.get('/users/:userId/delete', async (req, res) => {
    await userManagement.showDeleteConfirmation(req, res);
});

// Delete user (POST) - requires re-authentication
adminRouter.post('/users/:userId/delete', async (req, res) => {
    await userManagement.deleteUser(req, res);
});

// Get user details (GET)
adminRouter.get('/users/:userId', async (req, res) => {
    await userManagement.getUserDetails(req, res);
});

module.exports = adminRouter;