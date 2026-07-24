// Building the app (env.ts) requires these to be set even though the
// route-guard test never opens a real connection — buildApp() doesn't touch
// the DB until a route handler actually runs a query.
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET ??= 'test-secret-do-not-use-outside-tests';
