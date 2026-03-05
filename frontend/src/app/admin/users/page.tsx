'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, MoreVertical, Edit, Trash2, Shield } from 'lucide-react';

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: 'platform_admin' | 'tenant_admin' | 'staff';
  tenantId?: string;
  tenantName?: string;
  status: 'active' | 'suspended';
  createdAt: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  useEffect(() => {
    // TODO: Implement API call to fetch users
    // For now, empty array until API is implemented
    fetch('/api/admin/users')
      .then(res => {
        if (!res.ok) {
          throw new Error('Failed to fetch users');
        }
        return res.json();
      })
      .then(data => {
        setUsers(Array.isArray(data) ? data : []);
      })
      .catch(err => {
        console.error('Error fetching users:', err);
        setUsers([]);
      });
  }, []);

  const filteredUsers = users.filter(u => {
    const matchesSearch = 
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.firstName?.toLowerCase().includes(search.toLowerCase()) ||
      u.lastName?.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const getRoleBadge = (role: string) => {
    const variants = {
      platform_admin: 'bg-purple-100 text-purple-700',
      tenant_admin: 'bg-blue-100 text-blue-700',
      staff: 'bg-gray-100 text-gray-700'
    };
    return variants[role as keyof typeof variants] || variants.staff;
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-ink mb-2">Users</h1>
          <p className="text-ink-muted">Manage platform and tenant users</p>
        </div>
        
        <Button variant="primary" className="gap-2">
          <Plus className="h-4 w-4" />
          Invite User
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
          <Input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-4 py-2 border border-stone-300 rounded-xl bg-white text-ink focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="all">All Roles</option>
          <option value="platform_admin">Platform Admin</option>
          <option value="tenant_admin">Tenant Admin</option>
          <option value="staff">Staff</option>
        </select>
      </div>

      {/* Users List */}
      {filteredUsers.length === 0 ? (
        <Card className="p-12 text-center">
          <Shield className="h-16 w-16 text-stone-300 mx-auto mb-4" />
          <h3 className="text-xl font-display font-bold text-ink mb-2">No Users Found</h3>
          <p className="text-ink-muted mb-6">
            {search || roleFilter !== 'all' 
              ? 'Try adjusting your search filters' 
              : 'Start by inviting your first user to the platform'}
          </p>
          {!search && roleFilter === 'all' && (
            <Button variant="primary" className="gap-2">
              <Plus className="h-4 w-4" />
              Invite User
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredUsers.map((user) => (
            <Card key={user.id} className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
                    <span className="text-amber-700 font-display font-bold text-lg">
                      {user.firstName?.[0] || user.email[0].toUpperCase()}
                    </span>
                  </div>
                  
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-display font-bold text-ink">
                        {user.firstName && user.lastName 
                          ? `${user.firstName} ${user.lastName}` 
                          : user.email}
                      </h3>
                      <Badge className={getRoleBadge(user.role)}>
                        {user.role.replace('_', ' ')}
                      </Badge>
                      {user.status === 'suspended' && (
                        <Badge className="bg-red-100 text-red-700">Suspended</Badge>
                      )}
                    </div>
                    <p className="text-sm text-ink-muted">{user.email}</p>
                    {user.tenantName && (
                      <p className="text-xs text-stone-500 mt-1">
                        Tenant: {user.tenantName}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="gap-1">
                    <Edit className="h-4 w-4" />
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
