// This file runs before ANY module is loaded by Jest.
// Setting env vars here guarantees JWT_SECRET is available
// when authController.js reads it at module load time.
process.env.JWT_SECRET             = 'integration-test-secret';
process.env.JWT_ACCESS_EXPIRES_IN  = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '30d';
process.env.DATABASE_URL           = 'postgresql://fake:fake@localhost:5432/fake';
process.env.REDIS_HOST             = 'localhost';
process.env.PORT                   = '3099';