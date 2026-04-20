const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const path = require('path');
const dotenv = require('dotenv');
const pool = require('./config/db');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Configure Session Store
const sessionStore = new MySQLStore({
    createDatabaseTable: true
}, pool);

app.use(session({
    key: 'club_session_cookie',
    secret: process.env.SESSION_SECRET || 'secret123',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Inject User data and System Settings into local variables for all templates
app.use(async (req, res, next) => {
    try {
        res.locals.user = req.session.user || null;
        
        // Fetch global settings
        const [settingsRows] = await pool.query('SELECT setting_key, setting_value FROM settings');
        const sysSettings = {};
        settingsRows.forEach(row => {
            sysSettings[row.setting_key] = row.setting_value;
        });
        res.locals.sysSettings = sysSettings;
        
        next();
    } catch (err) {
        console.error('Settings Injection Error:', err);
        res.locals.sysSettings = {};
        next();
    }
});

// Socket.io integration
io.on('connection', (socket) => {
    console.log('A user connected: ' + socket.id);
    socket.on('disconnect', () => {
        console.log('User disconnected: ' + socket.id);
    });
});
// Attach io object to req so we can broadcast from controllers
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Routes Placeholder
app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
app.use('/admin', require('./routes/admin'));
app.use('/teacher', require('./routes/teacher'));
app.use('/student', require('./routes/student'));

// 404 Handler
app.use((req, res) => {
    res.status(404).render('errors/404');
});

// 500 Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('errors/500');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
