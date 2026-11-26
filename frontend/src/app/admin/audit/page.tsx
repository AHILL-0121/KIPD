'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';

interface AuditRow {
  id: string;
  adminClerkId: string;
  action: string;
  targetType: string;
  targetId: string | null;
  tenantName?: string | null;
  tenantSlug?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

const ACTION_OPTIONS = [
  { value: 'all', label: 'All Actions' },
  { value: 'tenant.create', label: 'Tenant Created' },
  { value: 'tenant.update', label: 'Tenant Updated' },
  { value: 'tenant.suspend', label: 'Tenant Suspended' },
  { value: 'tenant.activate', label: 'Tenant Activated' },
  { value: 'tenant.delete', label: 'Tenant Deleted' },
  { value: 'tenant.plan_change', label: 'Plan Changed' },
  { value: 'tenant.invite_resend', label: 'Owner Invite Resent' },
  { value: 'tenant.impersonate_start', label: 'Impersonation Started' },
  { value: 'tenant.impersonate_end', label: 'Impersonation Ended' },
  { value: 'access_request.approve', label: 'Request Approved' },
  { value: 'access_request.reject', label: 'Request Rejected' },
  { value: 'user.ban', label: 'User Banned' },
  { value: 'user.unban', label: 'User Unbanned' },
  { value: 'user.revoke_sessions', label: 'Sessions Revoked' },
  { value: 'user.grant_admin', label: 'Admin Granted' },
  { value: 'user.revoke_admin', label: 'Admin Revoked' },
  { value: 'platform.maintenance_enable', label: 'Maintenance Enabled' },
  { value: 'platform.maintenance_disable', label: 'Maintenance Disabled' },
  { value: 'platform.announcement_update', label: 'Announcement Updated' },
  { value: 'platform.plans_update', label: 'Plans Updated' },
];

export default function AdminAuditPage() {
  const [items, setItems] = useState<AuditRow[]>([]);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pageSize = 25;

  const buildQuery = useCallback(
    (includePaging = true) => {
      const qs = new URLSearchParams();
      if (includePaging) {
        qs.set('page', String(page));
        qs.set('limit', String(pageSize));
      }
      if (action !== 'all') qs.set('action', action);
      if (search.trim()) qs.set('search', search.trim());
      if (from) qs.set('from', from);
      if (to) qs.set('to', `${to}T23:59:59.999Z`);
      return qs;
    },
    [page, action, search, from, to],
  );

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/audit?${buildQuery(true).toString()}`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total ?? 0));
      setTotalPages(Number(data.totalPages ?? 1));
    } catch (err) {
      console.error(err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const csvUrl = `/api/admin/audit?${(() => {
    const qs = buildQuery(false);
    qs.set('format', 'csv');
    return qs.toString();
  })()}`;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="section-title">Platform Audit Log</h1>
          <p className="section-sub">Immutable record of administrative actions ({total} entries)</p>
        </div>
        <a
          href={csvUrl}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-stone-300 bg-white text-sm font-medium text-ink hover:bg-stone-50"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </a>
      </div>

      <Card hover={false} className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search tenant name, slug, admin ID, or action..."
              className="pl-9"
            />
          </div>

          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by action"
            className="px-3 py-2 border border-stone-300 rounded-xl bg-white text-sm text-ink"
          >
            {ACTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              aria-label="From date"
              className="w-1/2 px-2.5 py-2 border border-stone-300 rounded-xl bg-white text-xs text-ink"
            />
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              aria-label="To date"
              className="w-1/2 px-2.5 py-2 border border-stone-300 rounded-xl bg-white text-xs text-ink"
            />
          </div>
        </div>
      </Card>

      <Card hover={false} className="overflow-hidden p-0">
        {loading ? (
          <div className="p-10 text-center text-sm text-ink-muted">Loading audit events...</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-ink-muted">No matching audit entries found.</div>
        ) : (
          <div className="divide-y divide-stone-100">
            {items.map((row) => {
              const isExpanded = expandedId === row.id;
              return (
                <div key={row.id} className="p-4 hover:bg-stone-50/70 transition-colors">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                      <span className="font-mono text-xs px-2 py-1 rounded-md bg-stone-100 text-ink font-medium">
                        {row.action}
                      </span>
                      {row.tenantName ? (
                        row.targetType === 'tenant' && row.targetId ? (
                          <Link
                            href={`/admin/tenants/${row.targetId}`}
                            className="text-sm font-semibold text-amber hover:underline"
                          >
                            {row.tenantName}
                          </Link>
                        ) : (
                          <span className="text-sm font-medium text-ink">{row.tenantName}</span>
                        )
                      ) : row.targetId ? (
                        <span className="text-xs text-ink-muted font-mono">
                          {row.targetType}: {row.targetId}
                        </span>
                      ) : (
                        <Badge variant="stone">{row.targetType}</Badge>
                      )}
                      <span className="text-xs text-ink-muted">by {row.adminClerkId}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs text-ink-muted">
                        {new Date(row.createdAt).toLocaleString('en-IN')}
                      </span>
                      {row.metadata && Object.keys(row.metadata).length > 0 && (
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : row.id)}
                          aria-label={isExpanded ? 'Hide metadata' : 'Show metadata'}
                          className="p-1 rounded-lg text-ink-muted hover:bg-stone-200/60"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  </div>
                  {isExpanded && row.metadata && (
                    <pre className="mt-3 p-3 rounded-xl bg-stone-900 text-stone-100 text-xs overflow-x-auto">
                      {JSON.stringify(row.metadata, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-ink-muted">
          <span>
            Page {page} of {totalPages} ({total} total)
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
