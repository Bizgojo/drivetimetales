'use client';

import React, { useEffect, useState } from 'react';

interface User {
  id: string;
  email: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  credits: number;
  plan?: string;
  subscription_type?: string;
  subscription_ends_at?: string;
  stripe_customer_id?: string;
  created_at: string;
  last_login?: string;
  // Extended stats
  supportMessageCount?: number;
  listening7d?: number;
  listening30d?: number;
  listening365d?: number;
  memberDays?: number;
}

interface SupportMessage {
  id: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
  admin_response?: string;
}

interface Payment {
  id: string;
  paymentIntentId: string;
  amount: number;
  amountRefunded: number;
  refundable: number;
  currency: string;
  description: string;
  date: string;
  refunded: boolean;
  receiptUrl: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'free' | 'subscribed'>('all');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editCredits, setEditCredits] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [userMessages, setUserMessages] = useState<SupportMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<SupportMessage | null>(null);
  
  // Refund state
  const [showRefund, setShowRefund] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [refundAmount, setRefundAmount] = useState<string>('');
  const [refundReason, setRefundReason] = useState('');
  const [processingRefund, setProcessingRefund] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!url || !key) {
        setLoading(false);
        return;
      }

      // Fetch users
      const response = await fetch(
        `${url}/rest/v1/users?select=*&order=created_at.desc`,
        {
          headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        
        // Fetch support message counts for all users
        const msgResponse = await fetch(
          `${url}/rest/v1/support_messages?select=email`,
          {
            headers: {
              'apikey': key,
              'Authorization': `Bearer ${key}`,
            },
          }
        );
        
        let messageCounts: Record<string, number> = {};
        if (msgResponse.ok) {
          const messages = await msgResponse.json();
          messages.forEach((m: { email: string }) => {
            messageCounts[m.email] = (messageCounts[m.email] || 0) + 1;
          });
        }

        // Fetch listening stats from user_library
        const statsResponse = await fetch(
          `${url}/rest/v1/user_library?select=user_id,progress,updated_at`,
          {
            headers: {
              'apikey': key,
              'Authorization': `Bearer ${key}`,
            },
          }
        );

        let listeningStats: Record<string, { d7: number; d30: number; d365: number }> = {};
        if (statsResponse.ok) {
          const stats = await statsResponse.json();
          const now = new Date();
          const d7ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          const d30ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          const d365ago = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

          stats.forEach((s: { user_id: string; progress: number; updated_at: string }) => {
            if (!listeningStats[s.user_id]) {
              listeningStats[s.user_id] = { d7: 0, d30: 0, d365: 0 };
            }
            const updated = new Date(s.updated_at);
            const minutes = Math.floor((s.progress || 0) / 60);
            
            if (updated >= d7ago) listeningStats[s.user_id].d7 += minutes;
            if (updated >= d30ago) listeningStats[s.user_id].d30 += minutes;
            if (updated >= d365ago) listeningStats[s.user_id].d365 += minutes;
          });
        }

        // Combine data
        const enrichedUsers = data.map((user: User) => {
          const now = new Date();
          const created = new Date(user.created_at);
          const memberDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
          
          return {
            ...user,
            supportMessageCount: messageCounts[user.email] || 0,
            listening7d: listeningStats[user.id]?.d7 || 0,
            listening30d: listeningStats[user.id]?.d30 || 0,
            listening365d: listeningStats[user.id]?.d365 || 0,
            memberDays
          };
        });

        setUsers(enrichedUsers);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchUserMessages(email: string) {
    setLoadingMessages(true);
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!url || !key) return;

      const response = await fetch(
        `${url}/rest/v1/support_messages?email=eq.${encodeURIComponent(email)}&order=created_at.desc&select=*`,
        {
          headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setUserMessages(data);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoadingMessages(false);
    }
  }

  async function updateUserCredits(userId: string, newCredits: number) {
    setSaving(true);
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!url || !key) return;

      const response = await fetch(
        `${url}/rest/v1/users?id=eq.${userId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ credits: newCredits }),
        }
      );

      if (response.ok) {
        setUsers(users.map(u => 
          u.id === userId ? { ...u, credits: newCredits } : u
        ));
        setSelectedUser(null);
        alert('Credits updated successfully!');
      } else {
        alert('Failed to update credits');
      }
    } catch (error) {
      console.error('Error updating credits:', error);
      alert('Error updating credits');
    } finally {
      setSaving(false);
    }
  }

  async function fetchUserPayments(userId: string) {
    setLoadingPayments(true);
    setPayments([]);
    try {
      const response = await fetch('/api/admin/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });

      if (response.ok) {
        const data = await response.json();
        setPayments(data.payments || []);
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to load payments');
      }
    } catch (error) {
      console.error('Error fetching payments:', error);
      alert('Error loading payment history');
    } finally {
      setLoadingPayments(false);
    }
  }

  async function processRefund() {
    if (!selectedPayment || !selectedUser || !refundAmount) return;
    
    const amountCents = Math.round(parseFloat(refundAmount) * 100);
    
    if (isNaN(amountCents) || amountCents <= 0) {
      alert('Please enter a valid refund amount');
      return;
    }
    
    if (amountCents > selectedPayment.refundable) {
      alert(`Cannot refund more than $${(selectedPayment.refundable / 100).toFixed(2)}`);
      return;
    }

    setProcessingRefund(true);
    try {
      const response = await fetch('/api/admin/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chargeId: selectedPayment.id,
          amount: amountCents,
          userId: selectedUser.id,
          reason: refundReason
        })
      });

      if (response.ok) {
        alert(`Refund of $${refundAmount} processed successfully!`);
        // Update local state
        setPayments(payments.map(p => 
          p.id === selectedPayment.id 
            ? { ...p, amountRefunded: p.amountRefunded + amountCents, refundable: p.refundable - amountCents }
            : p
        ));
        setSelectedPayment(null);
        setRefundAmount('');
        setRefundReason('');
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to process refund');
      }
    } catch (error) {
      console.error('Error processing refund:', error);
      alert('Error processing refund');
    } finally {
      setProcessingRefund(false);
    }
  }

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.display_name?.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (user.first_name?.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const plan = user.plan || user.subscription_type;
    const matchesType = 
      filterType === 'all' ||
      (filterType === 'free' && (!plan || plan === 'free')) ||
      (filterType === 'subscribed' && plan && plan !== 'free');

    return matchesSearch && matchesType;
  });

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatListeningTime = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const getUserName = (user: User) => {
    if (user.first_name) {
      return user.last_name ? `${user.first_name} ${user.last_name}` : user.first_name;
    }
    return user.display_name || 'No name';
  };

  const getPlanDisplay = (user: User) => {
    const plan = user.plan || user.subscription_type;
    if (!plan || plan === 'free') return 'Free';
    const names: Record<string, string> = {
      test_driver: 'Test Driver',
      commuter: 'Commuter',
      road_warrior: 'Road Warrior',
    };
    return names[plan] || plan;
  };

  const getPlanColor = (user: User) => {
    const plan = user.plan || user.subscription_type;
    if (!plan || plan === 'free') return { bg: '#e2e8f0', text: '#64748b' };
    const colors: Record<string, { bg: string; text: string }> = {
      test_driver: { bg: '#dbeafe', text: '#2563eb' },
      commuter: { bg: '#f3e8ff', text: '#9333ea' },
      road_warrior: { bg: '#ffedd5', text: '#ea580c' },
    };
    return colors[plan] || { bg: '#e2e8f0', text: '#64748b' };
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            width: '32px', 
            height: '32px', 
            border: '4px solid #f97316', 
            borderTopColor: 'transparent', 
            borderRadius: '50%', 
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem'
          }} />
          <p style={{ color: '#64748b' }}>Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', backgroundColor: '#FAF9F6', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', color: '#1e293b', marginBottom: '0.5rem' }}>👥 Users</h1>
        <p style={{ color: '#64748b' }}>Manage user accounts and credits</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem' }}>
          <span style={{ color: '#64748b', fontSize: '14px' }}>Total Users</span>
          <p style={{ fontSize: '28px', fontWeight: 'bold', color: '#1e293b' }}>{users.length}</p>
        </div>
        <div style={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem' }}>
          <span style={{ color: '#64748b', fontSize: '14px' }}>Free Users</span>
          <p style={{ fontSize: '28px', fontWeight: 'bold', color: '#1e293b' }}>
            {users.filter(u => {
              const plan = u.plan || u.subscription_type;
              return !plan || plan === 'free';
            }).length}
          </p>
        </div>
        <div style={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem' }}>
          <span style={{ color: '#64748b', fontSize: '14px' }}>Subscribers</span>
          <p style={{ fontSize: '28px', fontWeight: 'bold', color: '#1e293b' }}>
            {users.filter(u => {
              const plan = u.plan || u.subscription_type;
              return plan && plan !== 'free';
            }).length}
          </p>
        </div>
        <div style={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem' }}>
          <span style={{ color: '#64748b', fontSize: '14px' }}>Total Credits</span>
          <p style={{ fontSize: '28px', fontWeight: 'bold', color: '#f97316' }}>
            {users.reduce((sum, u) => sum + (u.credits > 0 ? u.credits : 0), 0)}
          </p>
        </div>
      </div>

      {/* Search and Filter */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ flex: 1 }}>
          <input
            type="text"
            placeholder="Search by email or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              backgroundColor: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              color: '#1e293b',
              fontSize: '14px'
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {(['all', 'free', 'subscribed'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: filterType === type ? '#f97316' : 'white',
                color: filterType === type ? 'white' : '#64748b',
                fontWeight: filterType === type ? 600 : 400,
                fontSize: '14px'
              }}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Users Table */}
      <div style={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
        {filteredUsers.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <span style={{ fontSize: '48px', display: 'block', marginBottom: '1rem' }}>🔍</span>
            <p style={{ color: '#64748b' }}>No users found</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: '#64748b', fontSize: '13px', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>User</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', color: '#64748b', fontSize: '13px', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Plan</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', color: '#64748b', fontSize: '13px', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Credits</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', color: '#64748b', fontSize: '13px', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Listening (7d/30d/All)</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', color: '#64748b', fontSize: '13px', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Joined</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', color: '#64748b', fontSize: '13px', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Messages</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', color: '#64748b', fontSize: '13px', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const planColors = getPlanColor(user);
                  return (
                    <tr key={user.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div>
                          <p style={{ color: '#1e293b', fontWeight: 600, marginBottom: '2px' }}>{getUserName(user)}</p>
                          <p style={{ color: '#64748b', fontSize: '13px' }}>{user.email}</p>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: 500,
                          backgroundColor: planColors.bg,
                          color: planColors.text
                        }}>
                          {getPlanDisplay(user)}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span style={{ color: '#f97316', fontWeight: 700, fontSize: '16px' }}>
                          {user.credits === -1 ? '∞' : user.credits}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', fontSize: '13px' }}>
                          <span style={{ color: '#1e293b' }}>{formatListeningTime(user.listening7d || 0)}</span>
                          <span style={{ color: '#94a3b8' }}>/</span>
                          <span style={{ color: '#1e293b' }}>{formatListeningTime(user.listening30d || 0)}</span>
                          <span style={{ color: '#94a3b8' }}>/</span>
                          <span style={{ color: '#1e293b' }}>
                            {formatListeningTime(user.listening365d || 0)}
                            {user.memberDays && user.memberDays < 365 && (
                              <span style={{ color: '#94a3b8', fontSize: '11px' }}> ({user.memberDays}d)</span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                        {formatDate(user.created_at)}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        {(user.supportMessageCount || 0) > 0 ? (
                          <button
                            onClick={() => {
                              setSelectedUser(user);
                              setShowMessages(true);
                              fetchUserMessages(user.email);
                            }}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '20px',
                              border: 'none',
                              cursor: 'pointer',
                              backgroundColor: '#fef2f2',
                              color: '#dc2626',
                              fontSize: '12px',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              margin: '0 auto'
                            }}
                          >
                            💬 {user.supportMessageCount}
                          </button>
                        ) : (
                          <span style={{ color: '#cbd5e1', fontSize: '13px' }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button
                            onClick={() => {
                              setSelectedUser(user);
                              setEditCredits(user.credits);
                              setShowMessages(false);
                              setShowRefund(false);
                            }}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#1e293b',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '13px',
                              cursor: 'pointer'
                            }}
                          >
                            Edit
                          </button>
                          {user.stripe_customer_id && (
                            <button
                              onClick={() => {
                                setSelectedUser(user);
                                setShowRefund(true);
                                setShowMessages(false);
                                fetchUserPayments(user.id);
                              }}
                              style={{
                                padding: '6px 12px',
                                backgroundColor: '#dc2626',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '13px',
                                cursor: 'pointer'
                              }}
                            >
                              Refund
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Messages Modal */}
      {selectedUser && showMessages && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            padding: '1.5rem',
            maxWidth: '700px',
            width: '100%',
            maxHeight: '80vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b' }}>
                💬 Messages from {getUserName(selectedUser)}
              </h2>
              <button
                onClick={() => {
                  setShowMessages(false);
                  setSelectedUser(null);
                  setSelectedMessage(null);
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#f1f5f9',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  color: '#64748b'
                }}
              >
                Close
              </button>
            </div>

            {loadingMessages ? (
              <p style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>Loading messages...</p>
            ) : (
              <div style={{ display: 'flex', gap: '1rem', flex: 1, overflow: 'hidden' }}>
                {/* Message List */}
                <div style={{ width: '250px', overflowY: 'auto', borderRight: '1px solid #e2e8f0', paddingRight: '1rem' }}>
                  {userMessages.map(msg => (
                    <div
                      key={msg.id}
                      onClick={() => setSelectedMessage(msg)}
                      style={{
                        padding: '0.75rem',
                        backgroundColor: selectedMessage?.id === msg.id ? '#fff7ed' : '#f8fafc',
                        border: `1px solid ${selectedMessage?.id === msg.id ? '#f97316' : '#e2e8f0'}`,
                        borderRadius: '8px',
                        marginBottom: '0.5rem',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '13px', marginBottom: '4px' }}>
                        {msg.subject}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>
                        {formatDate(msg.created_at)}
                      </div>
                      <div style={{
                        marginTop: '4px',
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        display: 'inline-block',
                        backgroundColor: msg.status === 'answered' ? '#dcfce7' : msg.status === 'read' ? '#fef9c3' : '#fef2f2',
                        color: msg.status === 'answered' ? '#16a34a' : msg.status === 'read' ? '#ca8a04' : '#dc2626'
                      }}>
                        {msg.status.toUpperCase()}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Message Detail */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {selectedMessage ? (
                    <div>
                      <h3 style={{ fontWeight: 600, color: '#1e293b', marginBottom: '0.5rem' }}>
                        {selectedMessage.subject}
                      </h3>
                      <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '1rem' }}>
                        {formatDate(selectedMessage.created_at)}
                      </p>
                      <div style={{
                        padding: '1rem',
                        backgroundColor: '#f8fafc',
                        borderRadius: '8px',
                        marginBottom: '1rem'
                      }}>
                        <p style={{ color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                          {selectedMessage.message}
                        </p>
                      </div>
                      {selectedMessage.admin_response && (
                        <div style={{
                          padding: '1rem',
                          backgroundColor: '#f0fdf4',
                          borderRadius: '8px',
                          borderLeft: '4px solid #22c55e'
                        }}>
                          <div style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600, marginBottom: '0.5rem' }}>
                            YOUR RESPONSE
                          </div>
                          <p style={{ color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                            {selectedMessage.admin_response}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem' }}>
                      Select a message to view
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {selectedUser && !showMessages && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            padding: '1.5rem',
            maxWidth: '400px',
            width: '100%'
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', marginBottom: '1.5rem' }}>Edit User</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', color: '#64748b', fontSize: '13px', marginBottom: '4px' }}>Email</label>
                <p style={{ color: '#1e293b' }}>{selectedUser.email}</p>
              </div>
              
              <div>
                <label style={{ display: 'block', color: '#64748b', fontSize: '13px', marginBottom: '4px' }}>Name</label>
                <p style={{ color: '#1e293b' }}>{getUserName(selectedUser)}</p>
              </div>
              
              <div>
                <label style={{ display: 'block', color: '#64748b', fontSize: '13px', marginBottom: '4px' }}>Plan</label>
                <p style={{ color: '#1e293b' }}>{getPlanDisplay(selectedUser)}</p>
              </div>
              
              <div>
                <label style={{ display: 'block', color: '#64748b', fontSize: '13px', marginBottom: '8px' }}>Credits</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button
                    onClick={() => setEditCredits(Math.max(0, editCredits - 1))}
                    style={{
                      width: '40px',
                      height: '40px',
                      backgroundColor: '#f1f5f9',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '18px',
                      cursor: 'pointer',
                      color: '#1e293b'
                    }}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    value={editCredits}
                    onChange={(e) => setEditCredits(parseInt(e.target.value) || 0)}
                    style={{
                      width: '80px',
                      padding: '8px',
                      backgroundColor: 'white',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      textAlign: 'center',
                      color: '#1e293b',
                      fontSize: '16px'
                    }}
                  />
                  <button
                    onClick={() => setEditCredits(editCredits + 1)}
                    style={{
                      width: '40px',
                      height: '40px',
                      backgroundColor: '#f1f5f9',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '18px',
                      cursor: 'pointer',
                      color: '#1e293b'
                    }}
                  >
                    +
                  </button>
                  <button
                    onClick={() => setEditCredits(-1)}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: '#fff7ed',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '13px',
                      cursor: 'pointer',
                      color: '#ea580c'
                    }}
                  >
                    ∞ Unlimited
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button
                onClick={() => setSelectedUser(null)}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: '#f1f5f9',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#64748b',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => updateUserCredits(selectedUser.id, editCredits)}
                disabled={saving}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: '#f97316',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'white',
                  fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.5 : 1
                }}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {selectedUser && showRefund && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            padding: '1.5rem',
            maxWidth: '600px',
            width: '100%',
            maxHeight: '80vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b' }}>
                💳 Refund - {getUserName(selectedUser)}
              </h2>
              <button
                onClick={() => {
                  setShowRefund(false);
                  setSelectedUser(null);
                  setSelectedPayment(null);
                  setRefundAmount('');
                  setRefundReason('');
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#f1f5f9',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  color: '#64748b'
                }}
              >
                Close
              </button>
            </div>

            <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '1rem' }}>{selectedUser.email}</p>

            {loadingPayments ? (
              <p style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>Loading payment history...</p>
            ) : payments.length === 0 ? (
              <p style={{ color: '#64748b', textAlign: 'center', padding: '2rem' }}>No payments found for this user.</p>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <h3 style={{ fontWeight: 600, color: '#1e293b', marginBottom: '0.75rem', fontSize: '14px' }}>Payment History</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                  {payments.map(payment => (
                    <div
                      key={payment.id}
                      onClick={() => {
                        if (payment.refundable > 0) {
                          setSelectedPayment(payment);
                          setRefundAmount((payment.refundable / 100).toFixed(2));
                        }
                      }}
                      style={{
                        padding: '0.75rem',
                        backgroundColor: selectedPayment?.id === payment.id ? '#fef3c7' : '#f8fafc',
                        border: `2px solid ${selectedPayment?.id === payment.id ? '#f59e0b' : '#e2e8f0'}`,
                        borderRadius: '8px',
                        cursor: payment.refundable > 0 ? 'pointer' : 'default',
                        opacity: payment.refundable > 0 ? 1 : 0.6
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 600, color: '#1e293b' }}>${(payment.amount / 100).toFixed(2)}</span>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>{formatDate(payment.date)}</span>
                      </div>
                      <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>{payment.description}</div>
                      <div style={{ display: 'flex', gap: '0.5rem', fontSize: '11px' }}>
                        {payment.amountRefunded > 0 && (
                          <span style={{ color: '#dc2626' }}>
                            Refunded: ${(payment.amountRefunded / 100).toFixed(2)}
                          </span>
                        )}
                        {payment.refundable > 0 ? (
                          <span style={{ color: '#16a34a' }}>
                            Refundable: ${(payment.refundable / 100).toFixed(2)}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>Fully refunded</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Refund Form */}
                {selectedPayment && (
                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                    <h3 style={{ fontWeight: 600, color: '#1e293b', marginBottom: '0.75rem', fontSize: '14px' }}>
                      Process Refund
                    </h3>
                    <div style={{ marginBottom: '0.75rem' }}>
                      <label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>
                        Refund Amount (max ${(selectedPayment.refundable / 100).toFixed(2)})
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ color: '#1e293b', fontWeight: 600 }}>$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max={(selectedPayment.refundable / 100).toFixed(2)}
                          value={refundAmount}
                          onChange={(e) => setRefundAmount(e.target.value)}
                          style={{
                            padding: '8px 12px',
                            border: '1px solid #e2e8f0',
                            borderRadius: '6px',
                            fontSize: '14px',
                            width: '120px',
                            color: '#1e293b'
                          }}
                        />
                        <button
                          onClick={() => setRefundAmount((selectedPayment.refundable / 100).toFixed(2))}
                          style={{
                            padding: '8px 12px',
                            backgroundColor: '#f1f5f9',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            color: '#64748b'
                          }}
                        >
                          Full Amount
                        </button>
                      </div>
                    </div>
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', fontSize: '13px', color: '#64748b', marginBottom: '4px' }}>
                        Reason (optional)
                      </label>
                      <input
                        type="text"
                        value={refundReason}
                        onChange={(e) => setRefundReason(e.target.value)}
                        placeholder="e.g., Customer request, Service issue"
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          border: '1px solid #e2e8f0',
                          borderRadius: '6px',
                          fontSize: '14px',
                          color: '#1e293b'
                        }}
                      />
                    </div>
                    <button
                      onClick={processRefund}
                      disabled={processingRefund || !refundAmount}
                      style={{
                        width: '100%',
                        padding: '12px',
                        backgroundColor: processingRefund ? '#fca5a5' : '#dc2626',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 600,
                        cursor: processingRefund ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {processingRefund ? 'Processing...' : `Refund $${refundAmount || '0.00'}`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
