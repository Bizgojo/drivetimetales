'use client'

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function HelpPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [formData, setFormData] = useState({ 
    name: '', 
    email: '', 
    subject: 'General Question', 
    message: '' 
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  // Pre-fill email if user is logged in
  React.useEffect(() => {
    if (user?.email && !formData.email) {
      setFormData(prev => ({ ...prev, email: user.email }));
    }
    if (user?.first_name && !formData.name) {
      const fullName = user.first_name + (user.last_name ? ' ' + user.last_name : '');
      setFormData(prev => ({ ...prev, name: fullName }));
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id || null,
          name: formData.name,
          email: formData.email,
          subject: formData.subject,
          message: formData.message
        })
      });

      if (response.ok) {
        setSubmitted(true);
        setFormData({ name: '', email: '', subject: 'General Question', message: '' });
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to send message');
      }
    } catch (err) {
      setError('Failed to send message. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">

      <div className="px-4 py-5 pb-24 max-w-2xl mx-auto">
        {/* Page Header */}
        <div className="text-center mb-8">
          <span className="text-5xl mb-4 block">🎧</span>
          <h1 className="text-2xl font-bold text-white mb-2">Help & Support</h1>
          <p className="text-gray-400">We're here to help</p>
        </div>

        {/* Contact Form */}
        <h2 className="text-lg font-bold text-white mb-4">💬 Contact Us</h2>
        
        {submitted ? (
          <div className="bg-green-900/30 border border-green-500/50 rounded-xl p-6 text-center">
            <span className="text-4xl mb-3 block">✅</span>
            <h3 className="text-green-400 font-bold mb-2">Message Sent!</h3>
            <p className="text-gray-300 mb-4">We typically respond within 24-48 hours.</p>
            <button 
              onClick={() => router.push('/')} 
              className="px-6 py-3 bg-orange-500 text-black font-bold rounded-xl"
            >
              Go to Home
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-4 text-red-400 text-sm">
                {error}
              </div>
            )}
            
            <input 
              type="text" 
              placeholder="Your Name" 
              required 
              value={formData.name} 
              onChange={e => setFormData({...formData, name: e.target.value})} 
              className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-orange-500" 
            />
            
            <input 
              type="email" 
              placeholder="Email Address" 
              required 
              value={formData.email} 
              onChange={e => setFormData({...formData, email: e.target.value})} 
              className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-orange-500" 
            />
            
            <select 
              value={formData.subject} 
              onChange={e => setFormData({...formData, subject: e.target.value})} 
              className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white focus:outline-none focus:border-orange-500"
            >
              <option>General Question</option>
              <option>Billing Issue</option>
              <option>Technical Problem</option>
              <option>Feature Request</option>
              <option>Other</option>
            </select>
            
            <textarea 
              placeholder="How can we help?" 
              required 
              rows={5} 
              value={formData.message} 
              onChange={e => setFormData({...formData, message: e.target.value})} 
              className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 resize-none" 
            />
            
            <button 
              type="submit" 
              disabled={submitting}
              className="w-full py-3 bg-orange-500 hover:bg-orange-400 disabled:bg-orange-700 text-black font-bold rounded-xl transition-colors"
            >
              {submitting ? 'Sending...' : 'Send Message'}
            </button>
          </form>
        )}

        <p className="text-center text-gray-500 text-sm mt-8">
          You can also email us directly at{' '}
          <a href="mailto:hello@endless-tales.com" className="text-orange-400">
            hello@endless-tales.com
          </a>
        </p>
      </div>
    </div>
  );
}
