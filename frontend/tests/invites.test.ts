import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'crypto';
import * as staffList from '@/app/api/staff/route';
import * as staffById from '@/app/api/staff/[id]/route';
import * as invite from '@/app/api/staff/invite/route';
import * as validate from '@/app/api/staff/invite/validate/route';
import * as accept from '@/app/api/staff/invite/accept/route';
import { sendEmail } from '@/lib/email';
import { call, ids, loginAs, q, resetAndSeed } from './helpers/harness';

const A = ids.A;
const g = globalThis as unknown as { __user?: string | null; __clerk: Record<string, unknown> };

/**
 * Staff invitations. The emailed link carries a random token; only its hash is stored, it expires,
 * and it can only be accepted by a login that owns the invited (verified) email address.
 */
const inviteBody = { name: 'New Hire', email: 'New.Hire@Example.test', role: 'waiter' };
const sha = (t: string) => createHash('sha256').update(t).digest('hex');
const sentToken = () => vi.mocked(sendEmail).mock.calls.at(-1)![0].html.match(/accept-invite\/([0-9a-f]{48})/)![1];
const invites = () => q<{ id: string; email: string; token_hash: string; expires_at: Date; accepted_at: Date | null; role: string }>(`select * from staff_invites order by created_at`);

async function sendInvite() {
  loginAs('managerA');
  const r = await call(invite.POST, 'POST', '/api/staff/invite', { body: inviteBody });
  expect(r.status).toBe(200);
  return sentToken();
}

/** A Clerk login that owns this email address (verified or not). */
function clerkUser(id: string, email: string, verified = true) {
  g.__clerk[id] = {
    publicMetadata: {}, firstName: 'N', lastName: 'H', primaryEmailAddressId: 'e1',
    emailAddresses: [{ id: 'e1', emailAddress: email, verification: { status: verified ? 'verified' : 'unverified' } }],
  };
}

beforeEach(resetAndSeed);

describe('creating an invitation', () => {
  it('stores only a hash of the token, a 7 day expiry and a lower-cased email', async () => {
    const token = await sendInvite();
    const [row] = await invites();
    expect(token).toMatch(/^[0-9a-f]{48}$/);
    expect(row.token_hash).toBe(sha(token));
    expect(row.email).toBe('new.hire@example.test');
    const days = (new Date(row.expires_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    expect(JSON.stringify(await q(`select * from staff_invites`))).not.toContain(token); // the raw token exists nowhere in the database
    expect(await q(`select id from staff where email = 'new.hire@example.test'`)).toHaveLength(0); // no staff row yet
  });

  it('escapes HTML in the email', async () => {
    loginAs('managerA');
    await call(invite.POST, 'POST', '/api/staff/invite', { body: { ...inviteBody, name: '<script>alert(1)</script>' } });
    const { html } = vi.mocked(sendEmail).mock.calls.at(-1)![0];
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('removes the invitation if the email cannot be sent', async () => {
    loginAs('managerA');
    vi.mocked(sendEmail).mockResolvedValueOnce({ success: false } as never);
    expect((await call(invite.POST, 'POST', '/api/staff/invite', { body: inviteBody })).status).toBe(502);
    expect(await invites()).toHaveLength(0);
  });

  it('re-inviting replaces the open invitation, and the old link stops working', async () => {
    const first = await sendInvite();
    const second = await sendInvite();
    expect(await invites()).toHaveLength(1);
    expect((await call(validate.GET, 'GET', `/api/staff/invite/validate?token=${first}`)).status).toBe(404);
    expect((await call(validate.GET, 'GET', `/api/staff/invite/validate?token=${second}`)).status).toBe(200);
  });

  it('refuses to invite someone who is already on the team', async () => {
    loginAs('managerA');
    const r = await call(invite.POST, 'POST', '/api/staff/invite', { body: { ...inviteBody, email: 'W@a.test' } }); // Waiter A, different capitals
    expect(r.status).toBe(409);
  });

  it('cannot grant the owner role', async () => {
    loginAs('managerA');
    expect((await call(invite.POST, 'POST', '/api/staff/invite', { body: { ...inviteBody, role: 'owner' } })).status).toBe(400);
  });
});

describe('seeing and cancelling invitations', () => {
  it('validation shows only the role, and distinguishes expired and used links', async () => {
    const token = await sendInvite();
    const v = await call(validate.GET, 'GET', `/api/staff/invite/validate?token=${token}`);
    expect(v.json).toEqual({ success: true, staff: { role: 'waiter' } });

    await q(`update staff_invites set expires_at = now() - interval '1 minute'`);
    expect((await call(validate.GET, 'GET', `/api/staff/invite/validate?token=${token}`)).status).toBe(410);

    await q(`update staff_invites set expires_at = now() + interval '1 day', accepted_at = now()`);
    expect((await call(validate.GET, 'GET', `/api/staff/invite/validate?token=${token}`)).status).toBe(400);
  });

  it('the team list shows pending invitations, without any token or hash', async () => {
    const token = await sendInvite();
    const list = await call(staffList.GET, 'GET', '/api/staff');
    const pending = list.json.find((m: { email: string }) => m.email === 'new.hire@example.test');
    expect(pending).toMatchObject({ isActive: false, role: 'waiter', clerkId: 'pending' });
    expect(JSON.stringify(list.json)).not.toContain(token);
    expect(JSON.stringify(list.json)).not.toContain(sha(token));
  });

  it('expired invitations drop off the team list', async () => {
    await sendInvite();
    await q(`update staff_invites set expires_at = now() - interval '1 minute'`);
    const list = await call(staffList.GET, 'GET', '/api/staff');
    expect(list.json.find((m: { email: string }) => m.email === 'new.hire@example.test')).toBeUndefined();
  });

  it('can be cancelled from the team list, but not by another tenant', async () => {
    await sendInvite();
    const [row] = await invites();

    loginAs('ownerB');
    expect((await call(staffById.DELETE, 'DELETE', `/api/staff/${row.id}`, { params: { id: row.id } })).status).toBe(404);
    expect(await invites()).toHaveLength(1);

    loginAs('managerA');
    expect((await call(staffById.DELETE, 'DELETE', `/api/staff/${row.id}`, { params: { id: row.id } })).status).toBe(200);
    expect(await invites()).toHaveLength(0);
  });
});

describe('accepting an invitation', () => {
  const accept1 = (token: string) => call(accept.POST, 'POST', '/api/staff/invite/accept', { body: { token } });

  it('creates the staff member from the invitation, once, for the invited address', async () => {
    const token = await sendInvite();
    clerkUser('user_newhire', 'NEW.hire@example.test'); // capitals do not matter
    g.__user = 'user_newhire';
    expect((await accept1(token)).status).toBe(200);

    expect(await q(`select clerk_id, role, is_active, tenant_id, name from staff where email = 'new.hire@example.test'`))
      .toEqual([{ clerk_id: 'user_newhire', role: 'waiter', is_active: true, tenant_id: A.tenant, name: 'New Hire' }]);
    expect((await invites())[0].accepted_at).not.toBeNull();
    expect((await accept1(token)).status).toBe(404); // the link is spent
  });

  it('refuses a login with a different email address, and one with an unverified address', async () => {
    const token = await sendInvite();
    clerkUser('user_other', 'someone.else@example.test');
    g.__user = 'user_other';
    const wrong = await accept1(token);
    expect(wrong.status).toBe(403);
    expect(wrong.json.error).toMatch(/different email/i);

    clerkUser('user_spoof', 'new.hire@example.test', false);
    g.__user = 'user_spoof';
    expect((await accept1(token)).status).toBe(403);

    expect(await q(`select id from staff where email = 'new.hire@example.test'`)).toHaveLength(0);
    expect((await invites())[0].accepted_at).toBeNull(); // still open for the real person
  });

  it('refuses an expired invitation, and a login that already belongs to a team', async () => {
    const token = await sendInvite();
    clerkUser('user_newhire', 'new.hire@example.test');
    g.__user = 'user_newhire';

    await q(`update staff_invites set expires_at = now() - interval '1 minute'`);
    expect((await accept1(token)).status).toBe(410);

    await q(`update staff_invites set expires_at = now() + interval '1 day'`);
    await q(`insert into staff (tenant_id, clerk_id, email, name, role) values ('${ids.B.tenant}', 'user_newhire', 'x@b.test', 'Already', 'waiter')`);
    expect((await accept1(token)).status).toBe(409);
  });

  it('rejects malformed tokens and requires a login', async () => {
    g.__user = 'user_x';
    expect((await accept1('short')).status).toBe(400);
    g.__user = null;
    expect((await accept1('a'.repeat(48))).status).toBe(401);
    expect((await call(validate.GET, 'GET', '/api/staff/invite/validate?token=abc')).status).toBe(400);
    expect((await call(validate.GET, 'GET', '/api/staff/invite/validate')).status).toBe(400);
  });
});
