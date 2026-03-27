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
    question: "How do I access my collection and reserved stories?",
    answer: "From the home screen, tap your avatar in the top right corner to open your Account page. You'll see two buttons: 'My Collection' shows all stories you've unlocked and can listen to anytime. 'Reserved Stories' shows stories you've saved to listen to later. You can also access your collection directly from the bottom navigation bar."
  },
  {
    question: "How does listening work?",
    answer: "Credits are used to unlock stories. Each story costs 1-4 credits depending on its length. When you start listening, you get a 3-minute preview before credits are charged. Once you unlock a story, it's yours forever - listen as many times as you like! Credits refresh monthly on your billing date but don't roll over to the next month."
  },
  {
    question: "How do I get started?",
    answer: "Sign up for a free account to browse the library. Subscribe to unlock unlimited listening on all stories."
  },
  {
    question: "When are refunds considered?",
    answer: "We evaluate refund requests on a case-by-case basis. Credit pack refunds may be considered if requested within 14 days of purchase. Subscription refunds are evaluated based on circumstances. Please note that individual story purchases cannot be refunded once you've listened past the 3-minute preview. Contact our support team to discuss your specific situation."
  },
  {
    question: "How do I cancel my subscription?",
    answer: "You can cancel your subscription anytime from Account > Billing & Credits. Your access continues until the end of your current billing period - you won't lose access immediately. After cancellation, you'll keep access to any stories you've already unlocked, but you won't receive new monthly credits."
  },
  {
    question: "Can I suggest stories or make recommendations?",
    answer: "Absolutely! We love hearing from our listeners. Go to Account > Help & Support and send us a message with your story ideas, genre preferences, or any content you'd like to see. Our content team reviews all suggestions and we're always looking to expand our library based on what our community wants to hear."
  },
  {
    question: "Why won't my audio play?",
    answer: "If you're having trouble with audio playback, try these steps: 1) Check your device volume and make sure it's not on silent. 2) If using Bluetooth, verify your car or speaker is connected properly. 3) Close and reopen the app. 4) If using the web version, try clearing your browser cache. 5) Check your internet connection. If issues persist, contact our support team."
  },
  {
    question: "What's the difference between subscription plans?",
    answer: "We offer simple subscription plans for every kind of listener. All plans include full access to every story in our library."
  },
  {
    question: "Can I listen offline?",
    answer: "Offline listening is coming soon! We're working on a download feature that will let you save stories for areas without cell service. In the meantime, stories will buffer as you listen, so a brief loss of signal usually won't interrupt playback."
  },
  {
    question: "How do I update my payment method?",
    answer: "Go to Account > Billing & Credits to manage your payment information. You can update your credit card, view your billing history, and see your next renewal date. All payments are processed securely through Stripe."
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
                    <p className="text-gray-300 leading-relaxed">{faq.answer}</p>
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
