const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

router.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/');
    res.render('auth/login', { error: null });
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
        if (users.length === 0) {
            return res.render('auth/login', { error: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง' });
        }

        const user = users[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.render('auth/login', { error: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง' });
        }

        req.session.user = {
            id: user.id,
            username: user.username,
            firstname: user.firstname,
            lastname: user.lastname,
            role: user.role
        };

        if (user.role === 'admin') res.redirect('/admin');
        else if (user.role === 'teacher') res.redirect('/teacher');
        else res.redirect('/');
    } catch (e) {
        console.error(e);
        res.render('auth/login', { error: 'เกิดข้อผิดพลาดของระบบ' });
    }
});

router.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('club_session_cookie');
        res.redirect('/');
    });
});

router.get('/logout', (req, res) => {
    res.redirect('/');
});

router.get('/profile', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    try {
        const [users] = await pool.query('SELECT username, firstname, lastname, role FROM users WHERE id = ?', [req.session.user.id]);
        res.render('auth/profile', { profile: users[0], error: null, success: req.query.success === 'true' });
    } catch (e) {
        console.error(e);
        res.status(500).send('Internal Server Error');
    }
});

router.post('/profile', async (req, res) => {
    if (!req.session.user) return res.redirect('/auth/login');
    const { firstname, lastname, password } = req.body;

    try {
        let query = 'UPDATE users SET firstname = ?, lastname = ?';
        const params = [firstname, lastname];

        if (password && password.trim() !== '') {
            const hashedPassword = await bcrypt.hash(password, 10);
            query += ', password = ?';
            params.push(hashedPassword);
        }

        query += ' WHERE id = ?';
        params.push(req.session.user.id);

        await pool.query(query, params);

        req.session.user.firstname = firstname;
        req.session.user.lastname = lastname;

        res.redirect('/auth/profile?success=true');
    } catch (e) {
        console.error(e);
        res.render('auth/profile', {
            profile: { ...req.session.user, firstname, lastname },
            error: 'ไม่สามารถบันทึกข้อมูลได้',
            success: false
        });
    }
});

module.exports = router;
