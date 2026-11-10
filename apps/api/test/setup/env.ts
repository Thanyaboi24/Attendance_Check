// Runs before every test file (after global setup has exported DATABASE_URL).
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-0123456789';
process.env.ENABLE_JOBS = 'false';
process.env.ENABLE_SWAGGER = 'false';
// Prisma loads apps/api/.env; an empty SMTP_HOST keeps emails in MailService.outbox.
process.env.SMTP_HOST = '';
process.env.ALLOW_MOCK_LOCATION = 'false';
