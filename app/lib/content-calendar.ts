/**
 * 26-day pre-launch content calendar for Endless Tales
 * Launch date: April 17, 2026
 * Strategy: 2 posts/day — morning hook + evening engagement
 * Rule: Only 3 landing page stories. Position as "launching April 17".
 * All links → endless-tales.com with UTM tracking
 */

const BASE_URL = 'https://endless-tales.com'

function utmLink(source: string, campaign: string, content: string) {
  return `${BASE_URL}?utm_source=${source}&utm_medium=social&utm_campaign=${campaign}&utm_content=${encodeURIComponent(content)}`
}

export interface ContentPost {
  id: string
  text: string
  theme: string
  timeSlot: 'morning' | 'evening'
  dayOffset: number // days before launch (26 = first day, 1 = day before launch)
}

// Story hooks — first lines that make you need to know what happens next
const STORY_HOOKS = [
  { title: 'When Rosie Came Home', hook: 'The dog had been missing for two years. Then she showed up on the porch — muddy, thin, and somehow, impossibly, smiling.' },
  { title: 'The Grave He Dug Himself', hook: 'A retired sheriff came home to bury his brother. The grave was already dug. His brother was standing next to it, holding a rifle.' },
  { title: 'The Letters He Was Meant to Carry', hook: 'He found a backpack on his bus route. Inside: 47 handwritten letters addressed to strangers across the country. Not one of them had ever been sent.' },
]

export const CONTENT_CALENDAR: ContentPost[] = [
  // === WEEK 1: AWARENESS — Plant the hook ===
  { id: 'w1-1m', dayOffset: 26, timeSlot: 'morning', theme: 'launch',
    text: `We're launching April 17.\n\nEndless Tales — audio stories built for the road. For commutes. For anyone who wants a great story and no screen.\n\nFirst listen is free 👉 ${utmLink('twitter','launch_countdown','w1-1m')}` },
  { id: 'w1-1e', dayOffset: 26, timeSlot: 'evening', theme: 'hook',
    text: `"${STORY_HOOKS[0].hook}"\n\nListen to When Rosie Came Home — free, no signup needed.\n\n${utmLink('twitter','story_hook','rosie-1')}` },

  { id: 'w1-2m', dayOffset: 25, timeSlot: 'morning', theme: 'problem',
    text: `You're sitting in traffic.\nYou've listened to every podcast.\nYou've heard the news 3 times.\n\nYou need a story.\n\nEndless Tales launches April 17. ${utmLink('twitter','awareness','traffic')}` },
  { id: 'w1-2e', dayOffset: 25, timeSlot: 'evening', theme: 'hook',
    text: `"${STORY_HOOKS[1].hook}"\n\nThe Grave He Dug Himself. A 14-minute western thriller. Free on Endless Tales.\n\n${utmLink('twitter','story_hook','grave-1')}` },

  { id: 'w1-3m', dayOffset: 24, timeSlot: 'morning', theme: 'product',
    text: `Audio stories that fit your commute.\n\n5 minutes. 14 minutes. 30 minutes.\n\nNo ads. No credits. One subscription, unlimited stories.\n\nLaunching April 17 → ${utmLink('twitter','product','fit-commute')}` },
  { id: 'w1-3e', dayOffset: 24, timeSlot: 'evening', theme: 'hook',
    text: `"${STORY_HOOKS[2].hook}"\n\nHe had a bus route to finish. And 47 stories to deliver.\n\nListen free → ${utmLink('twitter','story_hook','letters-1')}` },

  { id: 'w1-4m', dayOffset: 23, timeSlot: 'morning', theme: 'audience',
    text: `For truck drivers logging midnight miles.\nFor commuters stuck at the same exit again.\nFor walkers who need something better than music.\n\nEndless Tales. April 17.\n\n${utmLink('twitter','audience','drivers')}` },
  { id: 'w1-4e', dayOffset: 23, timeSlot: 'evening', theme: 'social_proof',
    text: `3 free stories. No account needed. No credit card.\n\nJust press play.\n\nTell us what you think 👇 ${utmLink('twitter','cta','3-free')}` },

  { id: 'w1-5m', dayOffset: 22, timeSlot: 'morning', theme: 'founding',
    text: `Founding member pricing ends at launch.\n\n$2.99/mo for life — only for the first subscribers.\n\nAfter April 17, it's $7.99/mo.\n\nLock yours in → ${utmLink('twitter','founding','pricing')}` },
  { id: 'w1-5e', dayOffset: 22, timeSlot: 'evening', theme: 'hook',
    text: `What's the last story you got truly lost in?\n\nNot a podcast. Not the news. A real story — characters, tension, a moment that stayed with you.\n\nWe're building that for your commute. ${utmLink('twitter','engagement','lost-in')}` },

  { id: 'w1-6m', dayOffset: 21, timeSlot: 'morning', theme: 'genre',
    text: `Thrillers for Monday morning.\nHeartwarmers for Friday drive home.\nWesterns for the long haul.\n\nEndless Tales. Every genre. One subscription.\n\nApril 17 → ${utmLink('twitter','genre','all-genres')}` },
  { id: 'w1-6e', dayOffset: 21, timeSlot: 'evening', theme: 'story_detail',
    text: `When Rosie Came Home is 3 minutes long.\n\nA complete story. A real ending. Something that'll stick with you.\n\nListen on your next coffee break → ${utmLink('twitter','story_detail','rosie-short')}` },

  { id: 'w1-7m', dayOffset: 20, timeSlot: 'morning', theme: 'week_recap',
    text: `One week of storytelling ahead.\n\n3 stories live now at endless-tales.com. Free.\n\nAnd 26 days until we launch the full library.\n\nGo listen → ${utmLink('twitter','week_recap','w1-7')}` },
  { id: 'w1-7e', dayOffset: 20, timeSlot: 'evening', theme: 'engagement',
    text: `Quick question:\n\nDo you prefer stories under 10 minutes or longer ones you can settle into?\n\nBuilding our library around what listeners actually want. 👇` },

  // === WEEK 2: INTEREST — Go deeper on the product ===
  { id: 'w2-1m', dayOffset: 19, timeSlot: 'morning', theme: 'product',
    text: `Most audiobooks cost $15-30 each.\nMost podcasts are 45-90 minutes.\n\nEndless Tales stories are 5-30 minutes.\nOne price. Every story.\n\nBuilt differently → ${utmLink('twitter','product','vs-audiobooks')}` },
  { id: 'w2-1e', dayOffset: 19, timeSlot: 'evening', theme: 'hook',
    text: `A widowed bus driver. 47 undelivered letters. Strangers across the country who never knew they were being thought of.\n\nThe Letters He Was Meant to Carry. Free. Now.\n\n${utmLink('twitter','story_hook','letters-2')}` },

  { id: 'w2-2m', dayOffset: 18, timeSlot: 'morning', theme: 'truck_drivers',
    text: `Truck drivers drive 500+ miles on a single shift.\n\nThat's 8+ hours of time that could be filled with something incredible.\n\nEndless Tales was built for exactly that. April 17.\n\n${utmLink('twitter','audience','truckers-2')}` },
  { id: 'w2-2e', dayOffset: 18, timeSlot: 'evening', theme: 'teaser',
    text: `Coming April 17:\n\n25+ stories across 8 genres.\nThrillers. Westerns. Romance. Sci-Fi. Horror. Drama.\n\nAll built for audio. All built for the road.\n\n${utmLink('twitter','teaser','25-stories')}` },

  { id: 'w2-3m', dayOffset: 17, timeSlot: 'morning', theme: 'founding',
    text: `17 days until Endless Tales launches.\n\nFounders lock in $2.99/mo for life.\n\nAfter launch: $7.99/mo.\n\nJoin the waitlist → ${utmLink('twitter','founding','17-days')}` },
  { id: 'w2-3e', dayOffset: 17, timeSlot: 'evening', theme: 'hook',
    text: `The western isn't dead.\n\nIt just moved to audio.\n\n"The grave was already dug. His brother was waiting with a rifle."\n\nListen free → ${utmLink('twitter','story_hook','grave-2')}` },

  { id: 'w2-4m', dayOffset: 16, timeSlot: 'morning', theme: 'comparison',
    text: `Podcasts: 60 minutes, you're 40% through when you park.\n\nEndless Tales: 14 minutes, complete story, perfect for the commute.\n\nBuilt for how you actually drive. ${utmLink('twitter','comparison','vs-podcasts')}` },
  { id: 'w2-4e', dayOffset: 16, timeSlot: 'evening', theme: 'engagement',
    text: `What's your commute like?\n\n🚗 Under 20 min\n🚗🚗 20-45 min\n🚛 45+ min / long haul\n\nWe want to make the perfect story length for your drive.` },

  { id: 'w2-5m', dayOffset: 15, timeSlot: 'morning', theme: 'product',
    text: `Every Endless Tales story has:\n\n• A full cast of voice actors\n• Original music\n• A beginning, middle, and end\n\nNot a podcast. Not an audiobook. Something new.\n\nApril 17 → ${utmLink('twitter','product','full-cast')}` },
  { id: 'w2-5e', dayOffset: 15, timeSlot: 'evening', theme: 'hook',
    text: `"She was already crying when she knocked on the door. Not sad crying — the kind that hits you when something's finally over."\n\nWhen Rosie Came Home. 3 minutes. Free.\n\n${utmLink('twitter','story_hook','rosie-2')}` },

  { id: 'w2-6m', dayOffset: 14, timeSlot: 'morning', theme: 'countdown',
    text: `2 weeks until launch.\n\nIf you've been meaning to check out the free stories — today's a good day.\n\nendless-tales.com → ${utmLink('twitter','countdown','2-weeks')}` },
  { id: 'w2-6e', dayOffset: 14, timeSlot: 'evening', theme: 'engagement',
    text: `Honest question:\n\nWould you listen to a 14-minute audio drama on your commute if it was as good as a great TV episode?\n\n(We think the answer is yes. We're building it to prove it.)` },

  { id: 'w2-7m', dayOffset: 13, timeSlot: 'morning', theme: 'week_recap',
    text: `13 days to launch.\n\n3 free stories waiting for you right now.\n\nNo account. No card. Just audio.\n\n→ ${utmLink('twitter','week_recap','w2-7')}` },
  { id: 'w2-7e', dayOffset: 13, timeSlot: 'evening', theme: 'teaser',
    text: `Coming to Endless Tales in April:\n\n• A detective who takes cases other cops won't touch\n• A lighthouse keeper who gets a message from a ship that sank in 1943\n• A marriage falling apart at 70 mph\n\nApril 17 → ${utmLink('twitter','teaser','coming-soon')}` },

  // === WEEK 3: URGENCY — Build FOMO ===
  { id: 'w3-1m', dayOffset: 12, timeSlot: 'morning', theme: 'founding',
    text: `Founding member spots are limited.\n\n$2.99/mo for life — only for the first [X] subscribers.\n\nAfter that, it's $7.99/mo forever.\n\nJoin before April 17 → ${utmLink('twitter','founding','limited-spots')}` },
  { id: 'w3-1e', dayOffset: 12, timeSlot: 'evening', theme: 'hook',
    text: `The best commute I ever had:\nIt was raining. Traffic was stopped. I was completely lost in a story.\n\nI didn't even mind being late.\n\nThat's what we're building. → ${utmLink('twitter','vision','best-commute')}` },

  { id: 'w3-2m', dayOffset: 11, timeSlot: 'morning', theme: 'product',
    text: `Endless Tales is:\n\n✅ Full cast audio dramas\n✅ New stories every week\n✅ 5–30 minute formats\n✅ Every genre\n✅ $2.99/mo founding rate\n\nLaunching April 17 → ${utmLink('twitter','product','feature-list')}` },
  { id: 'w3-2e', dayOffset: 11, timeSlot: 'evening', theme: 'engagement',
    text: `Tag someone who needs better commute audio 👇\n\n(3 free stories. No signup. Just a link and a good 14 minutes.)\n\n${utmLink('twitter','viral','tag-someone')}` },

  { id: 'w3-3m', dayOffset: 10, timeSlot: 'morning', theme: 'countdown',
    text: `10 days.\n\nWe launch Endless Tales on April 17.\n\nIf you haven't tried the free stories yet — you've still got time.\n\n${utmLink('twitter','countdown','10-days')}` },
  { id: 'w3-3e', dayOffset: 10, timeSlot: 'evening', theme: 'hook',
    text: `Every great story starts with one moment where everything changes.\n\nA dog at the door.\nA grave already dug.\n47 undelivered letters.\n\nListen free → ${utmLink('twitter','story_hook','3-moments')}` },

  { id: 'w3-4m', dayOffset: 9, timeSlot: 'morning', theme: 'audience',
    text: `If your workday starts at 4am and ends 600 miles later — this is for you.\n\nIf your commute is 45 minutes of sitting in the same spot — this is for you.\n\nEndless Tales. April 17. ${utmLink('twitter','audience','for-you')}` },
  { id: 'w3-4e', dayOffset: 9, timeSlot: 'evening', theme: 'founding',
    text: `Last call for founding member pricing.\n\n$2.99/mo locks in at launch — April 17.\n\nJoin the waitlist, get first access → ${utmLink('twitter','founding','last-call')}` },

  { id: 'w3-5m', dayOffset: 8, timeSlot: 'morning', theme: 'social_proof',
    text: `People have been listening.\n\nGo check out the free stories on endless-tales.com and tell us which one hit hardest.\n\nWe're listening. 👇 ${utmLink('twitter','social_proof','listening')}` },
  { id: 'w3-5e', dayOffset: 8, timeSlot: 'evening', theme: 'product',
    text: `Audio drama ≠ audiobook ≠ podcast.\n\nIt's something else. Closer to a movie — but for your ears, on your schedule, in 14 minutes.\n\nTry it free → ${utmLink('twitter','product','audio-drama-diff')}` },

  { id: 'w3-6m', dayOffset: 7, timeSlot: 'morning', theme: 'countdown',
    text: `One week from today.\n\nEndless Tales launches April 17.\n\nOver 25 stories. Founding member pricing. No credits. Unlimited.\n\n${utmLink('twitter','countdown','1-week')}` },
  { id: 'w3-6e', dayOffset: 7, timeSlot: 'evening', theme: 'hook',
    text: `A good story makes an hour of traffic feel like 10 minutes.\n\nA great story makes you sit in the driveway because you can't stop listening.\n\nWe're building both. → ${utmLink('twitter','vision','driveway-moment')}` },

  // === FINAL WEEK: LAUNCH ===
  { id: 'w4-1m', dayOffset: 6, timeSlot: 'morning', theme: 'countdown',
    text: `6 days.\n\n📅 April 17 — Endless Tales goes live.\n\nFirst subscribers get founding member pricing forever.\n\nJoin the waitlist → ${utmLink('twitter','countdown','6-days')}` },
  { id: 'w4-1e', dayOffset: 6, timeSlot: 'evening', theme: 'hook',
    text: `"The dog had been missing for two years."\n\nThat's the first line.\n\nThe next 3 minutes will make you glad you clicked.\n\n${utmLink('twitter','story_hook','rosie-final')}` },

  { id: 'w4-2m', dayOffset: 5, timeSlot: 'morning', theme: 'countdown',
    text: `5 days to launch.\n\nIf you're on the waitlist — you'll get first access and founding pricing.\n\nIf you're not — there's still time → ${utmLink('twitter','countdown','5-days')}` },
  { id: 'w4-2e', dayOffset: 5, timeSlot: 'evening', theme: 'teaser',
    text: `What launches April 17:\n\n• 25+ original audio dramas\n• 8 genres\n• New stories every week\n• $2.99/mo founding rate (limited)\n\nendless-tales.com ${utmLink('twitter','teaser','final-list')}` },

  { id: 'w4-3m', dayOffset: 4, timeSlot: 'morning', theme: 'countdown',
    text: `4 days.\n\nThe commute that changes everything is 4 days away.\n\n${utmLink('twitter','countdown','4-days')}` },
  { id: 'w4-3e', dayOffset: 4, timeSlot: 'evening', theme: 'founding',
    text: `Founding member pricing ends when we hit our limit.\n\nWe're not announcing the number. But it's not unlimited.\n\nLock in $2.99/mo → ${utmLink('twitter','founding','not-unlimited')}` },

  { id: 'w4-4m', dayOffset: 3, timeSlot: 'morning', theme: 'countdown',
    text: `3 days.\n\nGo listen to all 3 free stories this weekend.\nTell one person.\nThat's it.\n\n${utmLink('twitter','viral','3-days-tell-one')}` },
  { id: 'w4-4e', dayOffset: 3, timeSlot: 'evening', theme: 'vision',
    text: `Every mile deserves a good story.\n\nEndless Tales. April 17.\n\n${utmLink('twitter','vision','every-mile')}` },

  { id: 'w4-5m', dayOffset: 2, timeSlot: 'morning', theme: 'countdown',
    text: `2 days.\n\nEndless Tales launches Friday.\n\nWe started with a simple idea: commutes should have better stories.\n\nApril 17 → ${utmLink('twitter','countdown','2-days')}` },
  { id: 'w4-5e', dayOffset: 2, timeSlot: 'evening', theme: 'engagement',
    text: `Tomorrow is the last day to join at founding member pricing.\n\n$2.99/mo. Unlimited stories. For life.\n\nAfter Friday: $7.99/mo.\n\n→ ${utmLink('twitter','founding','tomorrow-last')}` },

  { id: 'w4-6m', dayOffset: 1, timeSlot: 'morning', theme: 'countdown',
    text: `Tomorrow we launch.\n\nIf you've been waiting — today is your last chance for founding pricing.\n\n$2.99/mo, locked in forever.\n\n${utmLink('twitter','countdown','1-day')}` },
  { id: 'w4-6e', dayOffset: 1, timeSlot: 'evening', theme: 'launch_eve',
    text: `Tomorrow, April 17, Endless Tales goes live.\n\n25+ stories. Every genre. Unlimited listening.\n\nSee you on the road. 🎧\n\n${utmLink('twitter','launch_eve','eve')}` },
]

export function getPostsForDate(targetDate: Date, launchDate: Date): ContentPost[] {
  const msPerDay = 24 * 60 * 60 * 1000
  const daysToLaunch = Math.ceil((launchDate.getTime() - targetDate.getTime()) / msPerDay)
  return CONTENT_CALENDAR.filter(p => p.dayOffset === daysToLaunch)
}

export function getNextUnpostedPost(postedIds: string[], launchDate: Date): ContentPost | null {
  const now = new Date()
  const hour = now.getHours()
  const isEvening = hour >= 17
  const today = CONTENT_CALENDAR.filter(p => {
    const msPerDay = 24 * 60 * 60 * 1000
    const daysToLaunch = Math.ceil((launchDate.getTime() - now.getTime()) / msPerDay)
    return p.dayOffset === daysToLaunch && !postedIds.includes(p.id)
  })
  if (isEvening) return today.find(p => p.timeSlot === 'evening') || today[0] || null
  return today.find(p => p.timeSlot === 'morning') || null
}
