const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
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
        const [settingsRows] = await pool.query('SELECT setting_key, setting_value FROM settings');
        
        const [recentUsers] = await pool.query('SELECT id, username, firstname, lastname, role, created_at FROM users ORDER BY created_at DESC LIMIT 5');
        const config = {};
        settingsRows.forEach((row) => {
            config[row.setting_key] = row.setting_value;
        });

        res.render('admin/dashboard', {
            stats: {
                users: userCount[0].count,
                clubs: clubCount[0].count,
                members: memberCount[0].count
            },
            recentUsers,
            config,
            success: req.query.success || null
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
        res.render('admin/users', {
            users,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (e) {
        console.error(e);
        res.status(500).send('Internal Server Error');
    }
});

router.get('/users/create', (req, res) => {
    res.render('admin/user_form', {
        mode: 'create',
        userData: {
            username: '',
            firstname: '',
            lastname: '',
            role: 'student'
        },
        error: null
    });
});

router.post('/users/create', async (req, res) => {
    const { username, password, firstname, lastname, role } = req.body;

    if (!username || !password || !firstname || !lastname || !['admin', 'teacher', 'student'].includes(role)) {
        return res.render('admin/user_form', {
            mode: 'create',
            userData: { username, firstname, lastname, role },
            error: 'กรุณากรอกข้อมูลผู้ใช้ให้ครบถ้วนและเลือกบทบาทให้ถูกต้อง'
        });
    }

    try {
        const [existingUsers] = await pool.query('SELECT id FROM users WHERE username = ?', [username.trim()]);
        if (existingUsers.length > 0) {
            return res.render('admin/user_form', {
                mode: 'create',
                userData: { username, firstname, lastname, role },
                error: 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query(
            'INSERT INTO users (username, password, firstname, lastname, role) VALUES (?, ?, ?, ?, ?)',
            [username.trim(), hashedPassword, firstname.trim(), lastname.trim(), role]
        );

        res.redirect('/admin/users?success=created');
    } catch (e) {
        console.error(e);
        res.render('admin/user_form', {
            mode: 'create',
            userData: { username, firstname, lastname, role },
            error: 'ไม่สามารถสร้างผู้ใช้ใหม่ได้'
        });
    }
});

router.get('/users/:id/edit', async (req, res) => {
    const { id } = req.params;
    try {
        const [users] = await pool.query(
            'SELECT id, username, firstname, lastname, role FROM users WHERE id = ?',
            [id]
        );

        if (users.length === 0) {
            return res.redirect('/admin/users?error=not_found');
        }

        res.render('admin/user_form', {
            mode: 'edit',
            userData: users[0],
            error: null
        });
    } catch (e) {
        console.error(e);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/users/:id/edit', async (req, res) => {
    const { id } = req.params;
    const { username, password, firstname, lastname, role } = req.body;

    if (!username || !firstname || !lastname || !['admin', 'teacher', 'student'].includes(role)) {
        return res.render('admin/user_form', {
            mode: 'edit',
            userData: { id, username, firstname, lastname, role },
            error: 'กรุณากรอกข้อมูลผู้ใช้ให้ครบถ้วนและเลือกบทบาทให้ถูกต้อง'
        });
    }

    try {
        const [existingUsers] = await pool.query(
            'SELECT id FROM users WHERE username = ? AND id != ?',
            [username.trim(), id]
        );
        if (existingUsers.length > 0) {
            return res.render('admin/user_form', {
                mode: 'edit',
                userData: { id, username, firstname, lastname, role },
                error: 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว'
            });
        }

        let query = 'UPDATE users SET username = ?, firstname = ?, lastname = ?, role = ?';
        const params = [username.trim(), firstname.trim(), lastname.trim(), role];

        if (password && password.trim()) {
            query += ', password = ?';
            params.push(await bcrypt.hash(password, 10));
        }

        query += ' WHERE id = ?';
        params.push(id);

        await pool.query(query, params);
        res.redirect('/admin/users?success=updated');
    } catch (e) {
        console.error(e);
        res.render('admin/user_form', {
            mode: 'edit',
            userData: { id, username, firstname, lastname, role },
            error: 'ไม่สามารถอัปเดตข้อมูลผู้ใช้ได้'
        });
    }
});

router.post('/users/:id/delete', async (req, res) => {
    const { id } = req.params;

    if (String(req.session.user.id) === String(id)) {
        return res.redirect('/admin/users?error=self_delete');
    }

    try {
        await pool.query('DELETE FROM users WHERE id = ?', [id]);
        res.redirect('/admin/users?success=deleted');
    } catch (e) {
        console.error(e);
        res.redirect('/admin/users?error=delete_failed');
    }
});

// Club Management
router.get('/clubs', async (req, res) => {
    try {
        const [clubs] = await pool.query(`
            SELECT
                c.id,
                c.name,
                c.description,
                c.max_students,
                c.status,
                c.created_at,
                u.firstname AS teacher_firstname,
                u.lastname AS teacher_lastname,
                (
                    SELECT COUNT(*)
                    FROM memberships m
                    WHERE m.club_id = c.id AND m.status = 'approved'
                ) AS approved_students,
                (
                    SELECT COUNT(*)
                    FROM memberships m
                    WHERE m.club_id = c.id AND m.status = 'pending'
                ) AS pending_students
            FROM clubs c
            JOIN users u ON u.id = c.teacher_id
            ORDER BY c.created_at DESC
        `);

        res.render('admin/clubs', {
            clubs,
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (e) {
        console.error(e);
        res.status(500).send('Internal Server Error');
    }
});

router.get('/clubs/create', async (req, res) => {
    try {
        const [teachers] = await pool.query(
            'SELECT id, firstname, lastname FROM users WHERE role = "teacher" ORDER BY firstname, lastname'
        );

        res.render('admin/club_form', {
            mode: 'create',
            club: {
                name: '',
                description: '',
                teacher_id: '',
                max_students: 30,
                status: 'open'
            },
            teachers,
            error: null
        });
    } catch (e) {
        console.error(e);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/clubs/create', async (req, res) => {
    const { name, description, teacher_id, max_students, status } = req.body;

    try {
        const [teachers] = await pool.query(
            'SELECT id, firstname, lastname FROM users WHERE role = "teacher" ORDER BY firstname, lastname'
        );

        if (!name || !teacher_id || !max_students || !['open', 'closed'].includes(status)) {
            return res.render('admin/club_form', {
                mode: 'create',
                club: { name, description, teacher_id, max_students, status },
                teachers,
                error: 'กรุณากรอกข้อมูลชุมนุมให้ครบถ้วน'
            });
        }

        await pool.query(
            'INSERT INTO clubs (name, description, teacher_id, max_students, status) VALUES (?, ?, ?, ?, ?)',
            [name.trim(), description?.trim() || '', teacher_id, Number(max_students), status]
        );

        res.redirect('/admin/clubs?success=created');
    } catch (e) {
        console.error(e);
        const [teachers] = await pool.query(
            'SELECT id, firstname, lastname FROM users WHERE role = "teacher" ORDER BY firstname, lastname'
        );
        res.render('admin/club_form', {
            mode: 'create',
            club: { name, description, teacher_id, max_students, status },
            teachers,
            error: 'ไม่สามารถสร้างชุมนุมใหม่ได้'
        });
    }
});

router.get('/clubs/:id/edit', async (req, res) => {
    const { id } = req.params;
    try {
        const [[clubRows], [teachers]] = await Promise.all([
            pool.query('SELECT id, name, description, teacher_id, max_students, status FROM clubs WHERE id = ?', [id]),
            pool.query('SELECT id, firstname, lastname FROM users WHERE role = "teacher" ORDER BY firstname, lastname')
        ]);

        if (clubRows.length === 0) {
            return res.redirect('/admin/clubs?error=not_found');
        }

        res.render('admin/club_form', {
            mode: 'edit',
            club: clubRows[0],
            teachers,
            error: null
        });
    } catch (e) {
        console.error(e);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/clubs/:id/edit', async (req, res) => {
    const { id } = req.params;
    const { name, description, teacher_id, max_students, status } = req.body;

    try {
        const [teachers] = await pool.query(
            'SELECT id, firstname, lastname FROM users WHERE role = "teacher" ORDER BY firstname, lastname'
        );

        if (!name || !teacher_id || !max_students || !['open', 'closed'].includes(status)) {
            return res.render('admin/club_form', {
                mode: 'edit',
                club: { id, name, description, teacher_id, max_students, status },
                teachers,
                error: 'กรุณากรอกข้อมูลชุมนุมให้ครบถ้วน'
            });
        }

        await pool.query(
            'UPDATE clubs SET name = ?, description = ?, teacher_id = ?, max_students = ?, status = ? WHERE id = ?',
            [name.trim(), description?.trim() || '', teacher_id, Number(max_students), status, id]
        );

        res.redirect('/admin/clubs?success=updated');
    } catch (e) {
        console.error(e);
        const [teachers] = await pool.query(
            'SELECT id, firstname, lastname FROM users WHERE role = "teacher" ORDER BY firstname, lastname'
        );
        res.render('admin/club_form', {
            mode: 'edit',
            club: { id, name, description, teacher_id, max_students, status },
            teachers,
            error: 'ไม่สามารถอัปเดตข้อมูลชุมนุมได้'
        });
    }
});

router.post('/clubs/:id/delete', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM clubs WHERE id = ?', [id]);
        res.redirect('/admin/clubs?success=deleted');
    } catch (e) {
        console.error(e);
        res.redirect('/admin/clubs?error=delete_failed');
    }
});

router.post('/registration/toggle', async (req, res) => {
    const nextState = req.body.mode === 'open' ? '1' : '0';
    const clubStatus = nextState === '1' ? 'open' : 'closed';

    try {
        await pool.query('UPDATE settings SET setting_value = ? WHERE setting_key = ?', [nextState, 'registration_open']);
        await pool.query('UPDATE clubs SET status = ?', [clubStatus]);
        res.redirect(`/admin?success=registration_${nextState === '1' ? 'opened' : 'closed'}`);
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
        res.render('admin/settings', {
            config,
            success: req.query.success === 'true'
        });
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
            const normalizedValue = Array.isArray(value) ? value[value.length - 1] : value;
            await pool.query(
                'UPDATE settings SET setting_value = ? WHERE setting_key = ?',
                [normalizedValue, key]
            );
        }
        res.redirect('/admin/settings?success=true');
    } catch (e) {
        console.error(e);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
