
import express from 'express';
const router = express.Router();

// take user name from DB



router.get('/private-zone', (req, res) => {
    if (req.session && req.session.user) {
        res.render('privatezone/views/index.ejs', {
            page: 'dashboard',
            user: req.session.user
        });
        console.log('Private zone accessed');
    } else {
        res.redirect('/login');
    }

    console.log(req.session);
});



router.get('/private-zone/profile', (req, res) => {
    if (req.session && req.session.user) {
        res.render('privatezone/views/index.ejs', {
            page: 'profile',
            user: req.session.user
        });
        console.log('Profile accessed');
    } else {
        res.redirect('/login');
    }
});















router.get('/private-zone/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
        }
        res.redirect('/');
    });
});

export default router;