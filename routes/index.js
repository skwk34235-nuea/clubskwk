const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/', async (req, res) => {
    try {
        // Fetch public clubs or stats if needed
        const [clubs] = await pool.query('SELECT name, max_students, (SELECT COUNT(*) FROM memberships WHERE club_id = clubs.id AND status = "approved") AS current_students FROM clubs WHERE status = "open"');
        res.render('index', { clubs });
    } catch (error) {
        console.error(error);
        res.render('index', { clubs: [] });
    }
});

module.exports = router;
