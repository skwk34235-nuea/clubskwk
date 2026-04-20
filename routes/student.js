const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireRole } = require('../middlewares/authMiddleware');

// All routes here require student role
router.use(requireRole('student'));

// Student Dashboard - Their Membership Status
router.get('/', async (req, res) => {
    try {
        const [membership] = await pool.query(`
            SELECT m.*, c.name as club_name, c.description, u.firstname as teacher_firstname, u.lastname as teacher_lastname
            FROM memberships m
            JOIN clubs c ON m.club_id = c.id
            JOIN users u ON c.teacher_id = u.id
            WHERE m.student_id = ?
        `, [req.session.user.id]);

        res.render('student/dashboard', { membership: membership[0] || null });
    } catch (e) {
        console.error(e);
        res.status(500).send('Internal Server Error');
    }
});

// Club Detail View
router.get('/club/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [clubs] = await pool.query(`
            SELECT c.*, u.firstname as teacher_firstname, u.lastname as teacher_lastname,
            (SELECT COUNT(*) FROM memberships WHERE club_id = c.id AND status = 'approved') as current_students
            FROM clubs c
            JOIN users u ON c.teacher_id = u.id
            WHERE c.id = ?
        `, [id]);

        if (clubs.length === 0) return res.redirect('/');

        // Check if current student is already a member or has a pending request
        const [membership] = await pool.query('SELECT status FROM memberships WHERE student_id = ? AND club_id = ?', [req.session.user.id, id]);
        
        // Also check if they have ANY membership (since UNIQUE KEY on student_id)
        const [anyMembership] = await pool.query('SELECT club_id FROM memberships WHERE student_id = ?', [req.session.user.id]);

        res.render('student/club_detail', { 
            club: clubs[0], 
            membership: membership[0] || null,
            hasAnyMembership: anyMembership.length > 0 
        });
    } catch (e) {
        console.error(e);
        res.status(500).send('Internal Server Error');
    }
});

// Join Club Action
router.post('/club/:id/join', async (req, res) => {
    const { id } = req.params;
    
    // Check global registration status
    if (res.locals.sysSettings.registration_open !== '1') {
        return res.redirect('/student?error=registration_closed');
    }

    try {
        // Check if already joined any club
        const [existing] = await pool.query('SELECT id FROM memberships WHERE student_id = ?', [req.session.user.id]);
        if (existing.length > 0) return res.redirect('/student');

        // Check if club is open and not full
        const [club] = await pool.query(`
            SELECT max_students, 
            (SELECT COUNT(*) FROM memberships WHERE club_id = ? AND status = 'approved') as current 
            FROM clubs WHERE id = ? AND status = 'open'
        `, [id, id]);

        if (club.length === 0 || club[0].current >= club[0].max_students) {
            return res.redirect('/');
        }

        // Insert membership (pending)
        await pool.query('INSERT INTO memberships (student_id, club_id, status) VALUES (?, ?, ?)', [req.session.user.id, id, 'pending']);
        
        res.redirect('/student');
    } catch (e) {
        console.error(e);
        res.status(500).send('Internal Server Error');
    }
});

// Withdraw Action
router.post('/club/:id/leave', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM memberships WHERE student_id = ? AND club_id = ?', [req.session.user.id, id]);
        
        // Broadcast update via socket
        if (req.io) {
            const [stats] = await pool.query('SELECT COUNT(*) as current, (SELECT max_students FROM clubs WHERE id = ?) as max FROM memberships WHERE club_id = ? AND status = "approved"', [id, id]);
            req.io.emit('clubs_update', {
                clubId: id,
                current_students: stats[0].current,
                max_students: stats[0].max
            });
        }

        res.redirect('/student');
    } catch (e) {
        console.error(e);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
