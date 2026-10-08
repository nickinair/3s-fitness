module.exports = {
  port: process.env.PORT || 8090,
  jwtSecret: process.env.JWT_SECRET || 'fitness-app-3s-secret-2026',
  db: {
    host: process.env.DB_HOST || 'cd-cynosdbmysql-grp-333otp80.sql.tencentcdb.com',
    port: Number(process.env.DB_PORT || 29057),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Nickis-2323',
    database: 'fitness_app',
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 2,
    idleTimeout: 30000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    timezone: '+08:00',
    dateStrings: true,
  },
};
