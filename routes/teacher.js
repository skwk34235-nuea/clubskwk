const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireRole } = require('../middlewares/authMiddleware');

// All routes here require teacher role
router.use(requireRole('teacher'));

// Teacher Dashboard - Their Clubs
router.get('/', async (req, res) => {
    try {
        const [clubs] = await pool.query(`
            SELECT c.*, 
            (SELECT COUNT(*) FROM memberships WHERE club_id = c.id AND status = 'approved') as current_students
            FROM clubs c
            WHERE c.teacher_id = ?
            ORDER BY c.created_at DESC
        `, [req.session.user.id]);

        res.render('teacher/dashboard', { clubs });
    } catch (e) {
        console.error(e);
        res.status(500).send('Internal Server Error');
    }
});

// Create Club View
router.get('/club/create', (req, res) => {
    res.render('teacher/create_club', { error: null });
});

// Create Club Action
router.post('/club/create', async (req, res) => {
    const { name, description, max_students } = req.body;
    try {
        await pool.query(
            'INSERT INTO clubs (name, description, teacher_id, max_students, status) VALUES (?, ?, ?, ?, ?)',
            [name, description, req.session.user.id, max_students, 'open']
        );
        res.redirect('/teacher');
    } catch (e) {
        console.error(e);
        res.render('teacher/create_club', { error: 'ไม่สามารถสร้างชุมนุมได้ กรุณาลองใหม่อีกครั้ง' });
    }
});

// Manage Specific Club Members
router.get('/club/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // Verify ownership
        const [clubCheck] = await pool.query('SELECT * FROM clubs WHERE id = ? AND teacher_id = ?', [id, req.session.user.id]);
        if (clubCheck.length === 0) return res.redirect('/teacher');

        const [members] = await pool.query(`
            SELECT m.*, u.firstname, u.lastname, u.username
            FROM memberships m
            JOIN users u ON m.student_id = u.id
            WHERE m.club_id = ?
            ORDER BY m.registered_at DESC
        `, [id]);

        res.render('teacher/manage_club', {
            club: clubCheck[0],
            members,
            error: req.query.error || null,
            success: req.query.success || null
        });
    } catch (e) {
        console.error(e);
        res.status(500).send('Internal Server Error');
    }
});

// Member Action (Approve/Reject)
router.post('/club/:club_id/member/:student_id/:action', async (req, res) => {
    const { club_id, student_id, action } = req.params;
    if (!['approve', 'reject'].includes(action)) {
        return res.status(400).send('Invalid action');
    }

    const status = action === 'approve' ? 'approved' : 'rejected';
    
    try {
        // Verify ownership
        const [clubCheck] = await pool.query('SELECT * FROM clubs WHERE id = ? AND teacher_id = ?', [club_id, req.session.user.id]);
        if (clubCheck.length === 0) return res.status(403).send('Unauthorized');

        const [membershipRows] = await pool.query(
            'SELECT status FROM memberships WHERE club_id = ? AND student_id = ?',
            [club_id, student_id]
        );
        if (membershipRows.length === 0) {
            return res.redirect(`/teacher/club/${club_id}?error=member_not_found`);
        }

        if (action === 'approve' && membershipRows[0].status !== 'approved') {
            const [stats] = await pool.query(
                'SELECT COUNT(*) as currentApproved FROM memberships WHERE club_id = ? AND status = "approved"',
                [club_id]
            );

            if (stats[0].currentApproved >= clubCheck[0].max_students) {
                return res.redirect(`/teacher/club/${club_id}?error=club_full`);
            }
        }

        await pool.query('UPDATE memberships SET status = ? WHERE club_id = ? AND student_id = ?', [status, club_id, student_id]);
        
        // Broadcast update via socket if approved
        if (req.io) {
            const [stats] = await pool.query('SELECT COUNT(*) as current, (SELECT max_students FROM clubs WHERE id = ?) as max FROM memberships WHERE club_id = ? AND status = "approved"', [club_id, club_id]);
            req.io.emit('clubs_update', {
                clubId: club_id,
                current_students: stats[0].current,
                max_students: stats[0].max
            });
        }

        res.redirect(`/teacher/club/${club_id}?success=member_updated`);
    } catch (e) {
        console.error(e);
        res.status(500).send('Internal Server Error');
    }
});

// Edit Club View
router.get('/club/:id/edit', async (req, res) => {
    const { id } = req.params;
    try {
        const [clubs] = await pool.query('SELECT * FROM clubs WHERE id = ? AND teacher_id = ?', [id, req.session.user.id]);
        if (clubs.length === 0) return res.redirect('/teacher');
        res.render('teacher/edit_club', { club: clubs[0], error: null });
    } catch (e) {
        console.error(e);
        res.status(500).send('Internal Server Error');
    }
});

// Update Club Action
router.post('/club/:id/edit', async (req, res) => {
    const { id } = req.params;
    const { name, description, max_students, status } = req.body;
    try {
        await pool.query(
            'UPDATE clubs SET name = ?, description = ?, max_students = ?, status = ? WHERE id = ? AND teacher_id = ?',
            [name, description, max_students, status, id, req.session.user.id]
        );
        res.redirect('/teacher');
    } catch (e) {
        console.error(e);
        res.render('teacher/edit_club', { club: { id, name, description, max_students, status }, error: 'ไม่สามารถบันทึกข้อมูลได้' });
    }
});

// Delete Club Action
router.post('/club/:id/delete', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM clubs WHERE id = ? AND teacher_id = ?', [id, req.session.user.id]);
        res.redirect('/teacher');
    } catch (e) {
        console.error(e);
        res.status(500).send('Internal Server Error');
    }
});

// Printable Member List View
router.get('/club/:id/print', async (req, res) => {
    const { id } = req.params;
    try {
        const [clubs] = await pool.query('SELECT * FROM clubs WHERE id = ? AND teacher_id = ?', [id, req.session.user.id]);
        if (clubs.length === 0) return res.redirect('/teacher');

        const [members] = await pool.query(`
            SELECT u.firstname, u.lastname, u.username, m.status, m.registered_at
            FROM memberships m
            JOIN users u ON m.student_id = u.id
            WHERE m.club_id = ? AND m.status = 'approved'
            ORDER BY u.firstname ASC
        `, [id]);

        res.render('teacher/print_members', { club: clubs[0], members });
    } catch (e) {
        console.error(e);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
