const mysql = require('mysql2/promise');

(async () => {
  try {
    const conn = await mysql.createConnection({
      host: 'cd-cynosdbmysql-grp-333otp80.sql.tencentcdb.com',
      port: 29057,
      user: 'root',
      password: 'Nickis-2323',
      connectTimeout: 10000,
    });
    const [rows] = await conn.query('SELECT VERSION() v');
    console.log('Connected. MySQL version:', rows[0].v);
    const [dbs] = await conn.query('SHOW DATABASES');
    console.log('Databases:', dbs.map(d => d.Database).join(', '));
    await conn.end();
  } catch (e) {
    console.error('DB ERROR:', e.message);
    process.exit(1);
  }
})();
