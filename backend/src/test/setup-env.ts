process.env.DATABASE_URL ??= process.env.TEST_DATABASE_URL ?? 'postgresql://test:test@localhost:55432/test'
process.env.CREDENTIAL_ENCRYPTION_KEY ??= Buffer.alloc(32, 1).toString('base64url')
process.env.EDUPLUS_WEBHOOK_SECRET ??= 'test-webhook-secret'
process.env.EDUPLUS_BASE_URL ??= 'https://eduplus.example.com'
process.env.EDUPLUS_APP_CODE ??= 'demo-school'
process.env.EDUPLUS_WORKBENCH_ORIGIN ??= 'https://eduplus.example.com'
process.env.APP_ORIGIN ??= 'https://exam.example.com'
