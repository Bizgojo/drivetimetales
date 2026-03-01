const fs = require('fs');

function fixFile(path, fixes) {
  if (!fs.existsSync(path)) { console.log(`SKIP (not found): ${path}`); return; }
  let c = fs.readFileSync(path, 'utf8');
  for (const [from, to] of fixes) {
    if (c.includes(from)) { c = c.replace(from, to); console.log(`  fixed: ${path}`); }
    else { console.log(`  NO MATCH: ${path} — "${from.slice(0,50)}"`); }
  }
  fs.writeFileSync(path, c);
}

// player/series/page.tsx — remove credit deduction
fixFile('app/player/series/page.tsx', [
  ['  credits: number\n', ''],
  [', credits,', ','],
  [`  // Charge credits after 3 minutes (180 seconds)`, `  // credits removed`],
  [`    const creditCost = currentStory.credits || Math.max(1, Math.floor(currentStory.duration_mins / 15))\n`, ''],
  [`      .update({ credits: (user.credits || 0) - creditCost })\n`, ''],
  [`{nextStory.duration_mins} min • {nextStory.credits || Math.max(1, Math.floor(nextStory.duration_mins / 15))} credit`, `{nextStory.duration_mins} min`],
]);

// wishlist/page.tsx — already deleted, skip

// WelcomeHeader.tsx — remove subscribe link
fixFile('components/WelcomeHeader.tsx', [
  [`            href="/subscribe" `, `            href="/signup" `],
]);

// W4RecommendedForYou.tsx — remove subscribe link and credits comment
fixFile('components/W4RecommendedForYou.tsx', [
  [`If user doesn't have enough credits, shows popup with option to subscribe.\n`, ''],
  [`              href="/subscribe"`, `              href="/signup"`],
]);

// ReferralModal.tsx — update copy
fixFile('components/ReferralModal.tsx', [
  [`Join me on Drive Time Tales! Audio stories for your commute. Use my link to sign up and we both get 1 month free when you subscribe: `, `Join me on Endless Tales! Amazing audio stories for your commute. Sign up free with my link: `],
  [`Share your link with friends. When they subscribe, you <strong style={{ color: '#22c55e' }}>both</strong> get 1 month free!`, `Share your link with friends and help them discover great stories for their commute!`],
]);

console.log('All done');
