const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'club_registration'
    });

    try {
        console.log('Migrating database...');

        // 1. Create settings table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS settings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                setting_key VARCHAR(100) NOT NULL UNIQUE,
                setting_value TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // 2. Initialize default settings
        const defaultSettings = [
            ['registration_open', '1'],
            ['school_name', 'โรงเรียนศรีกระนวนวิทยาคม'],
            ['academic_year', '2569'],
            ['system_announcement', 'ยินดีต้อนรับสู่ระบบรับสมัครชุมนุมออนไลน์']
        ];

        for (const [key, value] of defaultSettings) {
            await connection.query(
                'INSERT IGNORE INTO settings (setting_key, setting_value) VALUES (?, ?)',
                [key, value]
            );
        }

        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
