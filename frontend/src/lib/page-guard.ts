import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/auth';
import { landingFor, type StaffRole, type TenantType } from '@/lib/dashboard-nav';

type Area = 'hotel' | 'restaurant';

export async function pageGuard(options?: {
  roles?: string[];
  area?: Area;
}) {
  const ctx = await getTenantContext();
  if (!ctx || !ctx.tenantId) {
    redirect('/sign-in');
  }
  if (ctx.tenantStatus !== 'active') {
    redirect('/sign-in');
  }
  const role = ctx.role as StaffRole;
  const type = 'both' as TenantType; // We don't know the tenant type here without a DB call; roles guard is enough

  if (options?.roles && !options.roles.includes(ctx.role)) {
    redirect(landingFor(type, role));
  }

  if (options?.area && ctx.role !== 'owner' && ctx.role !== 'manager') {
    const areas = (ctx as any).areas ?? 'both';
    if (areas !== 'both' && areas !== options.area) {
      redirect(landingFor(type, role));
    }
  }

  return ctx;
}
