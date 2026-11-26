'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { confirmDialog } from '@/components/ui/confirm';
import { Search, Shield, ChevronLeft, ChevronRight, Ban, CheckCircle, KeyRound, MailX } from 'lucide-react';

interface User {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role: 'platform_admin' | 'tenant_admin' | 'staff';
  tenantId?: string;
  tenantName?: string | null;
  status: 'active' | 'suspended';
  createdAt?: number | string;
  lastSignInAt?: number | null;
}

interface PendingInvite {
  id: string;
  emailAddress: string;
  status: string;
  tenantId: string | null;
  tenantName: string | null;
  createdAt: number;
}

export default function UsersPage() {
  const [tab, setTab] = useState<'users' | 'invites'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const pageSize = 20;

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (search.trim()) qs.set('search', search.trim());
      if (roleFilter !== 'all') qs.set('role', roleFilter);

      const res = await fetch(`/api/admin/users?${qs.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      if (Array.isArray(data)) {
        setUsers(data);
        setTotalUsers(data.length);
        setTotalPages(1);
      } else {
        setUsers(Array.isArray(data.items) ? data.items : []);
        setTotalUsers(Number(data.total ?? 0));
        setTotalPages(Number(data.totalPages ?? 1));
      }
    } catch (err) {
      console.error('Error fetching users:', err);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter]);

  const fetchInvites = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/invitations');
      if (res.ok) {
        const data = await res.json();
        setInvites(Array.isArray(data.items) ? data.items : []);
      }
    } catch {
      setInvites([]);
    }
  }, []);

  useEffect(() => {
    if (tab === 'users') {
      void fetchUsers();
    } else {
      void fetchInvites();
    }
  }, [tab, fetchUsers, fetchInvites]);

  const runUserAction = async (
    user: User,
    action: 'ban' | 'unban' | 'revoke_sessions' | 'grant_admin' | 'revoke_admin',
    confirmTitle: string,
    danger = false,
  ) => {
    const ok = await confirmDialog({
      title: confirmTitle,
      message: `Target account: ${user.email || user.id}`,
      confirmLabel: 'Confirm',
      danger,
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Action failed');
      setToast({ text: `Completed "${action.replace('_', ' ')}" for ${user.email}`, type: 'success' });
      void fetchUsers();
    } catch (err) {
      setToast({ text: err instanceof Error ? err.message : 'Action failed', type: 'error' });
    }
  };

  const handleRevokeInvite = async (inv: PendingInvite) => {
    const ok = await confirmDialog({
      title: `Revoke invitation for ${inv.emailAddress}?`,
      message: 'The signup link will stop working immediately.',
      confirmLabel: 'Revoke',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/invitations?id=${encodeURIComponent(inv.id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to revoke');
      setToast({ text: `Revoked invite for ${inv.emailAddress}`, type: 'success' });
      void fetchInvites();
    } catch (err) {
      setToast({ text: err instanceof Error ? err.message : 'Failed to revoke', type: 'error' });
    }
  };

  const getRoleBadge = (role: string) => {
    const variants = {
      platform_admin: 'bg-purple-100 text-purple-700',
      tenant_admin: 'bg-blue-100 text-blue-700',
      staff: 'bg-gray-100 text-gray-700',
    };
    return variants[role as keyof typeof variants] || variants.staff;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-ink mb-1">Users &amp; Invitations</h1>
          <p className="text-ink-muted">Platform and tenant accounts ({totalUsers})</p>
        </div>

        <div className="flex gap-1 bg-stone-200/70 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setTab('users')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium ${tab === 'users' ? 'bg-white text-ink shadow-sm' : 'text-ink-muted'}`}
          >
            Users ({totalUsers})
          </button>
          <button
            type="button"
            onClick={() => setTab('invites')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium ${tab === 'invites' ? 'bg-white text-ink shadow-sm' : 'text-ink-muted'}`}
          >
            Pending Invites
          </button>
        </div>
      </div>

      {toast && (
        <div
          role="status"
          className={`mb-5 rounded-xl px-4 py-3 text-sm border ${
            toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {toast.text}
        </div>
      )}

      {tab === 'invites' ? (
        <div className="grid gap-3">
          {invites.length === 0 ? (
            <Card className="p-10 text-center text-ink-muted">No pending owner invitations.</Card>
          ) : (
            invites.map((inv) => (
              <Card key={inv.id} className="p-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-ink">{inv.emailAddress}</div>
                  <div className="text-xs text-ink-muted mt-0.5">
                    {inv.tenantName ? (
                      <Link href={`/admin/tenants/${inv.tenantId}`} className="text-amber hover:underline">
                        {inv.tenantName}
                      </Link>
                    ) : (
                      'Unlinked invite'
                    )}{' '}
                    · Sent {new Date(inv.createdAt).toLocaleDateString('en-IN')}
                  </div>
                </div>
                <Button size="sm" variant="terra" onClick={() => handleRevokeInvite(inv)}>
                  <MailX className="w-4 h-4" />
                  Revoke Invite
                </Button>
              </Card>
            ))
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-4 mb-6">
            <div className="flex-1 min-w-[220px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
              <Input
                type="text"
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-10"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter users by role"
              className="px-4 py-2 border border-stone-300 rounded-xl bg-white text-ink focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">All Roles</option>
              <option value="platform_admin">Platform Admin</option>
              <option value="tenant_admin">Tenant Admin</option>
              <option value="staff">Staff</option>
            </select>
          </div>

          {loading ? (
            <div className="py-12 text-center text-ink-muted text-sm">Loading users...</div>
          ) : users.length === 0 ? (
            <Card className="p-12 text-center">
              <Shield className="h-16 w-16 text-stone-300 mx-auto mb-4" />
              <h3 className="text-xl font-display font-bold text-ink mb-2">No Users Found</h3>
              <p className="text-ink-muted">
                {search || roleFilter !== 'all' ? 'Try adjusting your search filters' : 'No user accounts have been registered yet'}
              </p>
            </Card>
          ) : (
            <div className="grid gap-4">
              {users.map((user) => (
                <Card key={user.id} className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="h-11 w-11 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                        <span className="text-amber-700 font-display font-bold text-base">
                          {user.firstName?.[0] || user.email[0]?.toUpperCase() || '?'}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="font-display font-bold text-ink truncate">
                            {user.firstName || user.lastName
                              ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                              : user.email || user.id}
                          </h3>
                          <Badge className={getRoleBadge(user.role || 'staff')}>
                            {(user.role || 'staff').replace('_', ' ')}
                          </Badge>
                          {user.status === 'suspended' && <Badge className="bg-red-100 text-red-700">Banned</Badge>}
                        </div>
                        <p className="text-sm text-ink-muted truncate">{user.email}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-stone-500 mt-1">
                          {user.tenantId && (
                            <span>
                              Property:{' '}
                              <Link href={`/admin/tenants/${user.tenantId}`} className="text-amber hover:underline font-medium">
                                {user.tenantName || user.tenantId}
                              </Link>
                            </span>
                          )}
                          <span>
                            Last sign-in:{' '}
                            {user.lastSignInAt
                              ? new Date(user.lastSignInAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
                              : 'Never'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => runUserAction(user, 'revoke_sessions', 'Revoke active sessions?')}
                        title="Force sign-out across devices"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        Sign out all
                      </Button>

                      {user.status === 'suspended' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => runUserAction(user, 'unban', 'Unban user account?')}
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          Unban
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => runUserAction(user, 'ban', 'Ban user account?', true)}
                        >
                          <Ban className="w-3.5 h-3.5" />
                          Ban
                        </Button>
                      )}

                      {user.role === 'platform_admin' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => runUserAction(user, 'revoke_admin', 'Remove Platform Admin role?', true)}
                        >
                          Revoke Admin
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => runUserAction(user, 'grant_admin', 'Promote to Platform Admin?')}
                        >
                          Make Admin
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between border-t border-stone-200 pt-4 text-sm text-ink-muted">
              <span>
                Showing page {page} of {totalPages} ({totalUsers} total)
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
        </>
      )}
    </div>
  );
}
