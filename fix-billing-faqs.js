const fs = require('fs');

// Fix account/faqs/page.tsx - update credits-related FAQ answers
const ff = 'app/account/faqs/page.tsx';
let f = fs.readFileSync(ff, 'utf8');
f = f.replace(
  'question: "How do credits work?",',
  'question: "How does listening work?",'
);
f = f.replace(
  /answer: "Credits are used to unlock stories.*?Subscribers get monthly credits, or you can buy Freedom Packs\."/s,
  'answer: "All stories are included with your subscription — just tap and listen. There are no credits or per-story charges."'
);
f = f.replace(
  'question: "How can I earn free credits?",',
  'question: "How do I get started?",'
);
f = f.replace(
  /answer: "There are several ways to earn free credits:.*?run credit giveaways\."/s,
  'answer: "Sign up for a free account to browse the library. Subscribe to unlock unlimited listening on all stories."'
);
f = f.replace(
  /answer: "Freedom Pack credits never expire.*?don\'t roll over\."/s,
  'answer: "You can cancel anytime from Account > Billing. Your access continues until the end of your billing period."'
);
f = f.replace(
  /answer: "We offer three paid plans: Test Driver.*?our story library\."/s,
  'answer: "We offer simple subscription plans for every kind of listener. All plans include full access to every story in our library."'
);
f = f.replace(
  /answer: "Yes! New visitors get 2 free credits.*?try\."/s,
  'answer: "Yes! Browse the full library as a guest. Subscribe to start listening to any story."'
);
fs.writeFileSync(ff, f);
console.log('faqs done');

// Fix account/billing/page.tsx - remove credits from plan details
const bf = 'app/account/billing/page.tsx';
let b = fs.readFileSync(bf, 'utf8');
b = b.replace(
  `const PLAN_DETAILS: Record<string, { name: string; price: string; credits: number }> = {
  'free': { name: 'Free', price: '$0', credits: 0 },
  'test_driver': { name: 'Test Driver', price: '$2.99', credits: 10 },
  'commuter': { name: 'Commuter', price: '$7.99', credits: 30 },
  'road_warrior': { name: 'Road Warrior', price: '$14.99', credits: -1 },`,
  `const PLAN_DETAILS: Record<string, { name: string; price: string }> = {
  'free': { name: 'Free', price: '$0' },
  'test_driver': { name: 'Test Driver', price: '$2.99' },
  'commuter': { name: 'Commuter', price: '$7.99' },
  'road_warrior': { name: 'Road Warrior', price: '$14.99' },`
);
b = b.replace(
  `  const displayCredits = userAny?.credits === -1 ? '∞' : userAny?.credits ?? 0\n`,
  ''
);
b = b.replace(
  `              <p className="text-slate-400 text-sm">credits</p>`,
  `              <p className="text-slate-400 text-sm">Active</p>`
);
fs.writeFileSync(bf, b);
console.log('billing done');

// Fix about/page.tsx
const af = 'app/about/page.tsx';
let a = fs.readFileSync(af, 'utf8');
a = a.replace(
  `    q: 'How do credits work?',`,
  `    q: 'How does listening work?',`
);
a = a.replace(
  /a: 'Credits are used to unlock stories.*?Freedom Packs\.'/s,
  `a: 'All stories are included with your subscription. No credits, no per-story charges — just tap and listen.'`
);
a = a.replace(
  `    q: 'Do credits expire?',`,
  `    q: 'Can I cancel my subscription?',`
);
a = a.replace(
  /a: 'Freedom Pack credits never expire.*?don\'t roll over\.'/s,
  `a: 'Yes, you can cancel anytime. Your access continues until the end of your billing period.'`
);
a = a.replace(
  /a: 'Yes! New visitors get 2 free credits.*?try\.'/s,
  `a: 'Yes! Browse the full library as a guest and subscribe to start listening.'`
);
fs.writeFileSync(af, a);
console.log('about done');
