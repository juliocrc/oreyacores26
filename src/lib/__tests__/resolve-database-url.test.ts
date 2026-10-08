import { resolveCliDatabaseUrl, resolveRuntimeDatabaseUrl } from '../resolve-database-url';
import { getAuthSecret } from '../auth';

describe('resolve database URL selection', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = { ...originalEnv };
  });

  it('prefers Vercel/Postgres env vars over a local SQLite database URL', () => {
    process.env.DATABASE_URL = 'file:./local.db';
    process.env.POSTGRES_URL = 'postgres://user:pass@ep-example-123456.us-east-1.aws.neon.tech/neondb?sslmode=require';

    expect(resolveRuntimeDatabaseUrl()).toEqual({
      connectionString: 'postgres://user:pass@ep-example-123456.us-east-1.aws.neon.tech/neondb?sslmode=require',
      source: 'POSTGRES_URL',
    });
  });

  it('prefers direct URL for Prisma CLI migrations and admin scripts', () => {
    process.env.DATABASE_URL = 'postgres://local-user:local-pass@localhost:5432/app';
    process.env.DIRECT_URL = 'postgres://prod-user:prod-pass@prod-host:5432/app';

    expect(resolveCliDatabaseUrl()).toEqual({
      connectionString: 'postgres://prod-user:prod-pass@prod-host:5432/app',
      source: 'DIRECT_URL',
    });
  });

  it('falls back to a development secret when auth env vars are missing', () => {
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    process.env = { ...process.env, NODE_ENV: 'test' };

    expect(() => getAuthSecret()).not.toThrow();
    expect(getAuthSecret()).toBe('development-auth-secret');
  });

  it('does not allow the development auth secret in production', () => {
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    process.env = { ...process.env, NODE_ENV: 'production' };

    expect(() => getAuthSecret()).toThrow('AUTH_SECRET or NEXTAUTH_SECRET must be set in production');
  });
});
