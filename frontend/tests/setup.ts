import { vi } from 'vitest';

// Environment the app code expects.
process.env.CLERK_SECRET_KEY = 'sk_test_unit';
process.env.NEXT_PUBLIC_APP_URL = 'https://kipd.test';

type G = {
  __user?: string | null;
  __clerk?: Record<string, unknown>;
  __clerkCreateUser?: ReturnType<typeof vi.fn>;
};
const g = globalThis as unknown as G;
g.__clerk = {};
g.__clerkCreateUser = vi.fn(async () => ({ id: 'user_created_by_test' }));

// The app's database import becomes the in-memory Postgres.
vi.mock('@/db', async () => {
  const m = await import('./helpers/db');
  await m.ready;
  return { db: m.testDb };
});

// Clerk: who is signed in is decided per test by loginAs().
vi.mock('@clerk/nextjs/server', () => ({ auth: () => ({ userId: g.__user ?? null }) }));

vi.mock('@clerk/backend', () => ({
  createClerkClient: () => ({
    users: {
      getUser: async (id: string) =>
        (g.__clerk as Record<string, unknown>)[id] ?? { publicMetadata: {}, firstName: 'Test', lastName: id, emailAddresses: [] },
      getUserList: async () => ({ data: [] }),
      createUser: (args: unknown) => g.__clerkCreateUser!(args),
      updateUser: async () => ({}),
    },
  }),
}));

vi.mock('@clerk/nextjs', () => ({
  clerkClient: {
    users: {
      createUser: (args: unknown) => g.__clerkCreateUser!(args),
      deleteUser: vi.fn(async () => ({})),
      getUser: async (id: string) => (g.__clerk as Record<string, unknown>)[id] ?? { emailAddresses: [] },
    },
  },
}));

// No real email in tests.
vi.mock('@/lib/email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email')>();
  return { ...actual, sendEmail: vi.fn(async () => ({ success: true })) };
});
