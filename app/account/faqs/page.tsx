'use client'
import StickyHeaderFull from '@/components/StickyHeaderFull';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

interface FAQ {
  question: string;
  answer: string;
}

const faqs: FAQ[] = [
  {
    question: "How do I add an Endless Tales icon to my iPhone or Android?",
    answer: "You can add Endless Tales to your home screen just like a regular app — no app store needed!\n\niPhone (Safari): Open endless-tales.com in Safari, tap the Share button at the bottom of the screen (the box with an arrow pointing up), then scroll down and tap 'Add to Home Screen.' Give it a name and tap 'Add.' The icon will appear on your home screen.\n\nAndroid (Chrome): Open endless-tales.com in Chrome, tap the three-dot menu in the top right corner, then tap 'Add to Home screen.' Tap 'Add' to confirm. The Endless Tales icon will be placed on your home screen and works just like an app."
  },
  {
    question: "How do I cancel my subscription?",
    answer: "You can cancel anytime — no hoops to jump through.\n\nGo to Account > Billing & Subscription and tap 'Cancel Subscription.' Your access continues until the end of your current billing period, so you won't lose anything right away. After cancellation, you can still browse the library, but you'll need an active subscription to keep listening. If you change your mind, you can resubscribe anytime."
  },
  {
    question: "How do I suggest a story idea?",
    answer: "We'd love to hear your ideas! Go to Account > Help & Support and send us a message with your story idea — genre, setting, characters, whatever you've got in mind. Our team reads every suggestion. If your idea inspires a story, we'll make it happen."
  },
  {
    question: "How do I invite a friend?",
    answer: "Sharing is easy! Go to Account > Invite a Friend, and you'll find a link you can send via text, email, or any app. Your friend gets to check out Endless Tales, and you'll both feel great about it. The more the merrier — great stories are even better when shared."
  }
];

export default function FAQsPage() {
  const router = useRouter();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <StickyHeaderFull />

      <div className="px-4 py-6 pb-24 max-w-2xl mx-auto">
        {/* Page Header */}
        <div className="text-center mb-8">
          <span className="text-5xl mb-4 block">❓</span>
          <h1 className="text-2xl font-bold text-white mb-2">Frequently Asked Questions</h1>
          <p className="text-gray-400">Find answers to common questions</p>
        </div>

        {/* FAQ List */}
        <div className="space-y-3">
          {faqs.map((faq, index) => (
            <div 
              key={index}
              className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden"
            >
              <button
                onClick={() => toggleFAQ(index)}
                className="w-full px-4 py-4 text-left flex items-center justify-between"
              >
                <span className="text-white font-medium pr-4">{faq.question}</span>
                <span 
                  className="text-orange-400 text-xl flex-shrink-0 transition-transform duration-200"
                  style={{ transform: openIndex === index ? 'rotate(180deg)' : 'rotate(0deg)' }}
                >
                  ▼
                </span>
              </button>
              
              {openIndex === index && (
                <div className="px-4 pb-4">
                  <div className="border-t border-gray-800 pt-4">
                    <p className="text-gray-300 leading-relaxed whitespace-pre-line">{faq.answer}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Contact CTA */}
        <div className="mt-8 text-center">
          <p className="text-gray-400 mb-4">Still have questions?</p>
          <button
            onClick={() => router.push('/account/help')}
            className="px-6 py-3 bg-orange-500 text-black font-bold rounded-xl"
          >
            Contact Support
          </button>
        </div>
      </div>
    </div>
  );
}
