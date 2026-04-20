const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireRole } = require('../middlewares/authMiddleware');

// All routes here require admin role
router.use(requireRole('admin'));

// Admin Dashboard - Overview
router.get('/', async (req, res) => {
    try {
        const [userCount] = await pool.query('SELECT COUNT(*) as count FROM users');
        const [clubCount] = await pool.query('SELECT COUNT(*) as count FROM clubs');
        const [memberCount] = await pool.query('SELECT COUNT(*) as count FROM memberships WHERE status = "approved"');
        
        const [recentUsers] = await pool.query('SELECT id, username, firstname, lastname, role, created_at FROM users ORDER BY created_at DESC LIMIT 5');

        res.render('admin/dashboard', {
            stats: {
                users: userCount[0].count,
                clubs: clubCount[0].count,
                members: memberCount[0].count
            },
            recentUsers
        });
    } catch (e) {
        console.error(e);
        res.status(500).send('Internal Server Error');
    }
});

// User Management
router.get('/users', async (req, res) => {
    try {
        const [users] = await pool.query('SELECT id, username, firstname, lastname, role, created_at FROM users ORDER BY created_at DESC');
        res.render('admin/users', { users });
    } catch (e) {
        console.error(e);
        res.status(500).send('Internal Server Error');
    }
});

// Update User Role
router.post('/users/:id/role', async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;
    
    if (!['admin', 'teacher', 'student'].includes(role)) {
        return res.status(400).send('Invalid role');
    }

    try {
        await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, id]);
        res.redirect('/admin/users');
    } catch (e) {
        console.error(e);
        res.status(500).send('Internal Server Error');
    }
});

// System Settings View
router.get('/settings', async (req, res) => {
    try {
        const [settingsRows] = await pool.query('SELECT * FROM settings');
        const config = {};
        settingsRows.forEach(row => {
            config[row.setting_key] = row.setting_value;
        });
        res.render('admin/settings', { config });
    } catch (e) {
        console.error(e);
        res.status(500).send('Internal Server Error');
    }
});

// Update System Settings
router.post('/settings', async (req, res) => {
    const settings = req.body;
    try {
        for (const [key, value] of Object.entries(settings)) {
            await pool.query(
                'UPDATE settings SET setting_value = ? WHERE setting_key = ?',
                [value, key]
            );
        }
        res.redirect('/admin/settings?success=true');
    } catch (e) {
        console.error(e);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
