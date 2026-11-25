'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Shield, ChevronLeft, ChevronRight } from 'lucide-react';

interface User {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role: 'platform_admin' | 'tenant_admin' | 'staff';
  tenantId?: string;
  tenantName?: string;
  status: 'active' | 'suspended';
  createdAt?: number | string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const getRoleBadge = (role: string) => {
    const variants = {
      platform_admin: 'bg-purple-100 text-purple-700',
      tenant_admin: 'bg-blue-100 text-blue-700',
      staff: 'bg-gray-100 text-gray-700',
    };
    return variants[role as keyof typeof variants] || variants.staff;
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-ink mb-2">Users</h1>
          <p className="text-ink-muted">Platform and tenant accounts ({totalUsers})</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex-1 min-w-[220px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
          <Input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-10"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          aria-label="Filter users by role"
          className="px-4 py-2 border border-stone-300 rounded-xl bg-white text-ink focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="all">All Roles</option>
          <option value="platform_admin">Platform Admin</option>
          <option value="tenant_admin">Tenant Admin</option>
          <option value="staff">Staff</option>
        </select>
      </div>

      {/* Users List */}
      {loading ? (
        <div className="py-12 text-center text-ink-muted text-sm">Loading users...</div>
      ) : users.length === 0 ? (
        <Card className="p-12 text-center">
          <Shield className="h-16 w-16 text-stone-300 mx-auto mb-4" />
          <h3 className="text-xl font-display font-bold text-ink mb-2">No Users Found</h3>
          <p className="text-ink-muted">
            {search || roleFilter !== 'all'
              ? 'Try adjusting your search filters'
              : 'No user accounts have been registered yet'}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {users.map((user) => (
            <Card key={user.id} className="p-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                    <span className="text-amber-700 font-display font-bold text-lg">
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
                      {user.status === 'suspended' && (
                        <Badge className="bg-red-100 text-red-700">Suspended</Badge>
                      )}
                    </div>
                    <p className="text-sm text-ink-muted truncate">{user.email}</p>
                    {user.tenantId && (
                      <p className="text-xs text-stone-500 mt-1">
                        Tenant ID: {user.tenantId}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between border-t border-stone-200 pt-4 text-sm text-ink-muted">
          <span>Showing page {page} of {totalPages} ({totalUsers} total)</span>
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
