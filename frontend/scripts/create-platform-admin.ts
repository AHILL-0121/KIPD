/**
 * Makes an EXISTING Clerk user a platform admin (they can then open /admin and create tenants).
 *
 *   1. The person signs up at /sign-up first (so a Clerk user exists).
 *   2. npm run admin:create -- person@example.com            shows who it would change, changes nothing
 *   3. npm run admin:create -- person@example.com --yes      sets publicMetadata.platform_admin = true
 *
 * The flag lives in Clerk, not in the database, so it survives a database reset.
 * To remove admin rights, set platform_admin to false for that user in the Clerk dashboard.
 */
import * as dotenv from 'dotenv';
import { createClerkClient } from '@clerk/backend';

dotenv.config({ path: '.env.local' });

async function main() {
  const email = process.argv[2]?.toLowerCase();
  const apply = process.argv.includes('--yes');
  if (!email || email.startsWith('--')) throw new Error('Usage: npm run admin:create -- person@example.com [--yes]');
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error('CLERK_SECRET_KEY is not set (.env.local)');

  const clerk = createClerkClient({ secretKey });
  const { data } = await clerk.users.getUserList({ emailAddress: [email] });
  if (data.length === 0) throw new Error(`No Clerk user with email ${email}. Ask them to sign up first.`);
  if (data.length > 1) throw new Error(`More than one Clerk user matches ${email}. Resolve that in the Clerk dashboard first.`);

  const user = data[0];
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || '(no name)';
  console.log(`Found: ${name} <${email}> (${user.id})`);
  if (user.publicMetadata?.platform_admin === true) {
    console.log('Already a platform admin. Nothing to do.');
    return;
  }
  if (!apply) {
    console.log('\nDry run. Re-run with --yes to grant platform admin rights. Nothing was changed.');
    return;
  }
  await clerk.users.updateUser(user.id, { publicMetadata: { ...user.publicMetadata, platform_admin: true } });
  console.log('\nDone. They are now a platform admin (they may need to sign out and in again).');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
