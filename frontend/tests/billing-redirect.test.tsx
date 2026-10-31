// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

import BillingRedirect from '@/app/dashboard/billing/page';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); replace.mockClear(); });

const tenantIs = (type: string) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ type }))));

describe('the old /dashboard/billing address', () => {
  it('sends a restaurant business to Restaurant billing', async () => {
    tenantIs('restaurant');
    render(<BillingRedirect />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard/billing/restaurant'));
  });

  it.each(['hotel', 'both'])('sends a %s business to Hotel billing', async (type) => {
    tenantIs(type);
    render(<BillingRedirect />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard/billing/hotel'));
  });

  it('falls back to Hotel billing if the business cannot be looked up', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    render(<BillingRedirect />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard/billing/hotel'));
  });
});
