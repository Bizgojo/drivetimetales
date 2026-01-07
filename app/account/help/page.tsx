'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/ui/Header';
import { useAuth } from '@/contexts/AuthContext';

interface FAQItem {
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  {
    question: "How do credits work?",
    answer: "Credits are used to unlock stories. Each story costs 1-4 credits depending on length. Once you unlock a story, it's yours forever and you can listen as many times as you want."
  },
  {
    question: "What's included in each subscription plan?",
    answer: "Test Driver ($4.99/mo): 5 credits/month. Commuter ($9.99/mo): 12 credits/month. Road Warrior ($19.99/mo): Unlimited listening to all stories."
  },
  {
    question: "How do I cancel my subscription?",
    answer: "Go to Account → Billing & Credits → Manage Subscription. You can cancel anytime and keep access until the end of your billing period."
  },
  {
    question: "Why won't my audio play?",
    answer: "Check your device volume and make sure silent mode is off. Try closing and reopening the app. If using Bluetooth, ensure your device is connected."
  },
  {
    question: "How do I request a refund?",
    answer: "Contact us within 7 days of purchase for a full refund on credit packs. Email support@drivetimetales.com."
  }
];

export default function HelpPage() {
  const { user } = useAuth();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [formData, setFormData] = useState({ name: '', email: '', subject: 'General Question', message: '' });
  const [formSubmitted, setFormSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = encodeURIComponent(`[DTT Support] ${formData.subject}`);
    const body = encodeURIComponent(`Name: ${formData.name}\nEmail: ${formData.email}\n\nMessage:\n${formData.message}`);
    window.location.href = `mailto:support@drivetimetales.com?subject=${subject}&body=${body}`;
    setFormSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header showBack isLoggedIn={!!user} userCredits={user?.credits} />
      <div className="px-4 py-5 pb-24 max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <span className="text-5xl mb-4 block">🎧</span>
          <h1 className="text-2xl font-bold text-white mb-2">Help & Support</h1>
          <p className="text-gray-400">Find answers or get in touch</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-8">
          <a href="mailto:support@drivetimetales.com" className="flex flex-col items-center p-4 bg-gray-900 border border-gray-800 rounded-xl">
            <span className="text-2xl mb-2">📧</span>
            <span className="text-sm text-white">Email Us</span>
          </a>
          <Link href="/account/billing" className="flex flex-col items-center p-4 bg-gray-900 border border-gray-800 rounded-xl">
            <span className="text-2xl mb-2">💳</span>
            <span className="text-sm text-white">Billing Help</span>
          </Link>
        </div>

        <h2 className="text-lg font-bold text-white mb-4">❓ FAQs</h2>
        <div className="space-y-2 mb-10">
          {faqs.map((faq, index) => (
            <div key={index} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <button onClick={() => setExpandedIndex(expandedIndex === index ? null : index)} className="w-full px-4 py-3 text-left flex items-center justify-between">
                <span className="text-white text-sm font-medium pr-4">{faq.question}</span>
                <span className={`text-orange-500 transition-transform ${expandedIndex === index ? 'rotate-180' : ''}`}>▼</span>
              </button>
              {expandedIndex === index && <div className="px-4 pb-4"><p className="text-gray-400 text-sm">{faq.answer}</p></div>}
            </div>
          ))}
        </div>

        <h2 className="text-lg font-bold text-white mb-4">💬 Contact Us</h2>
        {formSubmitted ? (
          <div className="bg-green-900/30 border border-green-500/50 rounded-xl p-6 text-center">
            <span className="text-4xl mb-3 block">✅</span>
            <p className="text-green-400">Email client opened! We respond within 24-48 hours.</p>
            <button onClick={() => setFormSubmitted(false)} className="mt-4 text-orange-400 text-sm underline">Send another</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="text" placeholder="Your Name" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-orange-500" />
            <input type="email" placeholder="Email Address" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-orange-500" />
            <select value={formData.subject} onChange={e => setFormData({...formData, subject: e.target.value})} className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white focus:outline-none focus:border-orange-500">
              <option>General Question</option>
              <option>Billing Issue</option>
              <option>Technical Problem</option>
              <option>Feedback</option>
            </select>
            <textarea placeholder="Your message..." required rows={4} value={formData.message} onChange={e => setFormData({...formData, message: e.target.value})} className="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 resize-none" />
            <button type="submit" className="w-full py-3 bg-orange-500 hover:bg-orange-400 text-black font-bold rounded-xl">Send Message</button>
          </form>
        )}

        <p className="text-center text-gray-500 text-sm mt-8">Email: <a href="mailto:support@drivetimetales.com" className="text-orange-400">support@drivetimetales.com</a></p>
      </div>
    </div>
  );
}
