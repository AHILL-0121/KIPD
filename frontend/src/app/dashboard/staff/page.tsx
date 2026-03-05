'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Mail, MoreVertical, UserCog } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'manager' | 'front_desk' | 'waiter' | 'kitchen';
  isActive: boolean;
  createdAt: string;
}

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteData, setInviteData] = useState({ name: '', email: '', role: 'front_desk' });

  useEffect(() => {
    fetch('/api/staff')
      .then(res => res.json())
      .then(data => setStaff(data))
      .catch(console.error);
  }, []);

  const roleConfig = {
    owner: { badge: 'amber', label: 'Owner' },
    manager: { badge: 'terra', label: 'Manager' },
    front_desk: { badge: 'sage', label: 'Front Desk' },
    waiter: { badge: 'stone', label: 'Waiter' },
    kitchen: { badge: 'stone', label: 'Kitchen' },
  };

  const sendInvite = async () => {
    await fetch('/api/staff/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inviteData),
    });
    
    setShowInviteModal(false);
    setInviteData({ name: '', email: '', role: 'front_desk' });
    
    // Refresh staff list
    const response = await fetch('/api/staff');
    const data = await response.json();
    setStaff(data);
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="section-title">Staff Management</h1>
          <p className="section-sub">Manage team members and access</p>
        </div>
        
        <Button onClick={() => setShowInviteModal(true)}>
          <Plus className="w-4 h-4" />
          Invite Staff
        </Button>
      </div>

      {/* Staff Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {staff.map((member) => {
          const config = roleConfig[member.role];
          
          return (
            <Card key={member.id} hover>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber to-terra flex items-center justify-center text-white font-bold text-lg">
                    {member.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-ink">{member.name}</h3>
                    <p className="text-sm text-ink-muted">{member.email}</p>
                  </div>
                </div>
                
                <button className="text-ink-muted hover:text-ink">
                  <MoreVertical className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex items-center justify-between pt-4 border-t border-stone-200">
                <Badge variant={config.badge as any}>
                  {config.label}
                </Badge>
                
                <Badge variant={member.isActive ? 'sage' : 'stone'} dot>
                  {member.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Invite Modal */}
      <AnimatePresence>
        {showInviteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowInviteModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-8 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-amber rounded-xl flex items-center justify-center">
                  <Mail className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="font-serif text-2xl font-bold">Invite Staff Member</h2>
                  <p className="text-sm text-ink-muted">Send an invitation email</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <Input
                  label="Full Name"
                  placeholder="John Smith"
                  value={inviteData.name}
                  onChange={(e) => setInviteData({ ...inviteData, name: e.target.value })}
                />
                
                <Input
                  label="Email"
                  type="email"
                  placeholder="john@hotel.com"
                  value={inviteData.email}
                  onChange={(e) => setInviteData({ ...inviteData, email: e.target.value })}
                />
                
                <Select
                  label="Role"
                  value={inviteData.role}
                  onChange={(e) => setInviteData({ ...inviteData, role: e.target.value })}
                  options={[
                    { value: 'manager', label: 'Manager' },
                    { value: 'front_desk', label: 'Front Desk' },
                    { value: 'waiter', label: 'Waiter' },
                    { value: 'kitchen', label: 'Kitchen Staff' },
                  ]}
                />
                
                <div className="flex gap-3 pt-4">
                  <Button variant="ghost" className="flex-1" onClick={() => setShowInviteModal(false)}>
                    Cancel
                  </Button>
                  <Button variant="terra" className="flex-1" onClick={sendInvite}>
                    <Mail className="w-4 h-4" />
                    Send Invite
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
