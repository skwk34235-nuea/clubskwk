const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function run() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            multipleStatements: true
        });

        const schema = fs.readFileSync(path.join(__dirname, 'database/schema.sql'), 'utf-8');
        await connection.query(schema);
        console.log('Database initialized successfully.');
        process.exit(0);
    } catch (e) {
        console.error('Error initializing database:', e);
        process.exit(1);
    }
}
run();
