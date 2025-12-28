'use client';

import React, { useState } from 'react';
import { Header } from '@/components/ui/Header';
import { LogoStacked } from '@/components/ui/Logo';

const faqs = [
  {
    q: 'What is DriveTimeTales?',
    a: 'DriveTimeTales is an audio story platform designed for drivers. Listen to engaging stories during your commute, road trip, or long haul.'
  },
  {
    q: 'How do credits work?',
    a: 'Credits are used to unlock stories. Each story costs 1-4 credits based on length. Subscribers get monthly credits, or you can buy Freedom Packs.'
  },
  {
    q: 'Do credits expire?',
    a: 'Freedom Pack credits never expire. Subscription credits refresh monthly - unused credits don\'t roll over.'
  },
  {
    q: 'Can I listen offline?',
    a: 'Yes! Download stories to listen without internet. Perfect for areas with poor cell coverage.'
  },
  {
    q: 'How do I cancel my subscription?',
    a: 'Go to Account > Cancel Subscription. You\'ll keep access until your billing period ends.'
  },
  {
    q: 'Are there free stories?',
    a: 'Yes! New visitors get 2 free credits, and stories under 30 minutes are free to try.'
  },
];

export default function AboutPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header showBack />
      
      <div className="px-4 py-5">
        {/* Hero */}
        <div className="text-center mb-8">
          <LogoStacked size="lg" />
          <p className="text-white mt-4">
            Audio stories for the road
          </p>
        </div>

        {/* Mission */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
          <h2 className="text-white font-bold text-lg mb-2">Our Mission</h2>
          <p className="text-white text-sm">
            We believe every drive should be an adventure. DriveTimeTales brings 
            professional audio stories to drivers everywhere - truckers, commuters, 
            road trippers, and anyone who loves a good story.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-orange-400">500+</p>
            <p className="text-white text-xs">Stories</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-orange-400">12</p>
            <p className="text-white text-xs">Categories</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-orange-400">50K+</p>
            <p className="text-white text-xs">Listeners</p>
          </div>
        </div>

        {/* FAQ */}
        <h2 className="text-xl font-bold text-white mb-4" id="faq">❓ FAQ</h2>
        <div className="space-y-2 mb-6">
          {faqs.map((faq, index) => (
            <div 
              key={index}
              className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden"
            >
              <button
                onClick={() => setOpenFaq(openFaq === index ? null : index)}
                className="w-full p-4 text-left flex items-center justify-between"
              >
                <span className="text-white font-medium">{faq.q}</span>
                <span className="text-gray-500">{openFaq === index ? '−' : '+'}</span>
              </button>
              {openFaq === index && (
                <div className="px-4 pb-4">
                  <p className="text-white text-sm">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Contact */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-white font-bold text-lg mb-2">Contact Us</h2>
          <p className="text-white text-sm mb-3">
            Have questions or feedback? We'd love to hear from you.
          </p>
          <a 
            href="mailto:support@drivetimetales.com"
            className="block w-full py-3 bg-orange-500 text-white text-center rounded-xl font-medium"
          >
            📧 support@drivetimetales.com
          </a>
        </div>
      </div>
    </div>
  );
}
