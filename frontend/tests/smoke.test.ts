import { beforeEach, describe, expect, it } from 'vitest';
import { GET as getMenu } from '@/app/api/menu/route';
import { call, ids, loginAs, resetAndSeed } from './helpers/harness';

// Proves the test foundation itself works: real schema, real route, faked login.
describe('test harness', () => {
  beforeEach(resetAndSeed);

  it('serves a signed-in owner their own menu and nobody else\'s', async () => {
    loginAs('ownerA');
    const { status, json } = await call(getMenu, 'GET', '/api/menu');
    expect(status).toBe(200);
    expect(json.map((m: { id: string }) => m.id)).toEqual([ids.A.item]);
  });

  it('returns 401 when nobody is signed in', async () => {
    loginAs(null);
    expect((await call(getMenu, 'GET', '/api/menu')).status).toBe(401);
  });
});
