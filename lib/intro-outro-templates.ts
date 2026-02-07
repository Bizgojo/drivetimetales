// Intro/Outro Script Templates for News Briefings
// [narrator] = replaced with narrator name from news_settings
// [name] = replaced with user's name (personalized only)
// [timegreeting] = "Good morning" / "Good afternoon" / "Good evening" based on timezone

export const INTRO_TEMPLATES = [
  {
    variant: 1,
    personalized: {
      part_a: "[timegreeting],",
      part_b: "! I'm [narrator], and I've got your news update ready. Let's dive in."
    },
    generic: "[timegreeting]! I'm [narrator], and I've got your news update ready. Let's dive in."
  },
  {
    variant: 2,
    personalized: {
      part_a: "Hey there,",
      part_b: "! [narrator] here with your daily briefing. Here's what you need to know."
    },
    generic: "Hey there! [narrator] here with your daily briefing. Here's what you need to know."
  },
  {
    variant: 3,
    personalized: {
      part_a: "[timegreeting],",
      part_b: ". It's [narrator], bringing you today's headlines. Let's get started."
    },
    generic: "[timegreeting]. It's [narrator], bringing you today's headlines. Let's get started."
  },
  {
    variant: 4,
    personalized: {
      part_a: "Welcome back,",
      part_b: "! I'm [narrator], and here's what's making news right now."
    },
    generic: "Welcome! I'm [narrator], and here's what's making news right now."
  },
  {
    variant: 5,
    personalized: {
      part_a: "[timegreeting],",
      part_b: "! [narrator] here. Got a lot to cover today, so let's jump right in."
    },
    generic: "[timegreeting]! [narrator] here. Got a lot to cover today, so let's jump right in."
  },
  {
    variant: 6,
    personalized: {
      part_a: "Hi,",
      part_b: "! It's [narrator] with your news briefing. Here are today's top stories."
    },
    generic: "Hi there! It's [narrator] with your news briefing. Here are today's top stories."
  },
  {
    variant: 7,
    personalized: {
      part_a: "[timegreeting],",
      part_b: ". [narrator] here, ready to catch you up on what's happening. Let's go."
    },
    generic: "[timegreeting]. [narrator] here, ready to catch you up on what's happening. Let's go."
  },
  {
    variant: 8,
    personalized: {
      part_a: "Hey,",
      part_b: "! I'm [narrator]. Here's your quick look at today's news."
    },
    generic: "Hey! I'm [narrator]. Here's your quick look at today's news."
  },
  {
    variant: 9,
    personalized: {
      part_a: "[timegreeting],",
      part_b: "! [narrator] coming to you with the latest. Let's see what's going on."
    },
    generic: "[timegreeting]! [narrator] coming to you with the latest. Let's see what's going on."
  },
  {
    variant: 10,
    personalized: {
      part_a: "Hello,",
      part_b: "! I'm [narrator], and I'm here to bring you up to speed. Here we go."
    },
    generic: "Hello! I'm [narrator], and I'm here to bring you up to speed. Here we go."
  },
  {
    variant: 11,
    personalized: {
      part_a: "[timegreeting],",
      part_b: ". It's [narrator] with your news update. A lot happening today."
    },
    generic: "[timegreeting]. It's [narrator] with your news update. A lot happening today."
  },
  {
    variant: 12,
    personalized: {
      part_a: "Great to have you,",
      part_b: "! [narrator] here. Let me fill you in on what's new."
    },
    generic: "Great to have you! [narrator] here. Let me fill you in on what's new."
  },
  {
    variant: 13,
    personalized: {
      part_a: "[timegreeting],",
      part_b: "! I'm [narrator], and I've got your headlines. Let's get into it."
    },
    generic: "[timegreeting]! I'm [narrator], and I've got your headlines. Let's get into it."
  },
  {
    variant: 14,
    personalized: {
      part_a: "Hi there,",
      part_b: "! [narrator] here with the stories that matter. Here's what's happening."
    },
    generic: "Hi there! [narrator] here with the stories that matter. Here's what's happening."
  },
  {
    variant: 15,
    personalized: {
      part_a: "[timegreeting],",
      part_b: ". [narrator] checking in with your news. Let's take a look."
    },
    generic: "[timegreeting]. [narrator] checking in with your news. Let's take a look."
  }
];

export const OUTRO_TEMPLATES = [
  {
    variant: 1,
    text: "That's your update for now. I'm [narrator]. Safe travels, and I'll catch you next time."
  },
  {
    variant: 2,
    text: "And that's the news. [narrator] here, wishing you a great rest of your drive."
  },
  {
    variant: 3,
    text: "That wraps things up. I'm [narrator]. Thanks for listening, and stay informed."
  },
  {
    variant: 4,
    text: "That's all for now. [narrator] signing off. Have a good one."
  },
  {
    variant: 5,
    text: "And there you have it. I'm [narrator]. Take care, and I'll talk to you soon."
  },
  {
    variant: 6,
    text: "That's your briefing. [narrator] here. Stay safe out there."
  },
  {
    variant: 7,
    text: "And that's a wrap. I'm [narrator]. Thanks for tuning in."
  },
  {
    variant: 8,
    text: "That's the latest. [narrator] signing off. Enjoy the rest of your day."
  },
  {
    variant: 9,
    text: "And that does it for now. I'm [narrator]. Until next time, take care."
  },
  {
    variant: 10,
    text: "That's your update. [narrator] here, hoping you have a smooth ride ahead."
  },
  {
    variant: 11,
    text: "And we're done for today. I'm [narrator]. Stay curious, stay informed."
  },
  {
    variant: 12,
    text: "That's all the news. [narrator] signing off. See you next time."
  },
  {
    variant: 13,
    text: "And there's your update. I'm [narrator]. Thanks for spending this time with me."
  },
  {
    variant: 14,
    text: "That covers it. [narrator] here. Wishing you safe travels."
  },
  {
    variant: 15,
    text: "And that's the news for now. I'm [narrator]. Until next time, take it easy."
  }
];

// Time greeting logic
export function getTimeGreeting(timezone: string): string {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = { hour: 'numeric', hour12: false, timeZone: timezone };
  const hour = parseInt(new Intl.DateTimeFormat('en-US', options).format(now));
  
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// State to timezone mapping
export const STATE_TIMEZONES: Record<string, string> = {
  // Eastern Time
  'Connecticut': 'America/New_York',
  'Delaware': 'America/New_York',
  'Florida': 'America/New_York',
  'Georgia': 'America/New_York',
  'Indiana': 'America/Indiana/Indianapolis',
  'Kentucky': 'America/Kentucky/Louisville',
  'Maine': 'America/New_York',
  'Maryland': 'America/New_York',
  'Massachusetts': 'America/New_York',
  'Michigan': 'America/Detroit',
  'New Hampshire': 'America/New_York',
  'New Jersey': 'America/New_York',
  'New York': 'America/New_York',
  'North Carolina': 'America/New_York',
  'Ohio': 'America/New_York',
  'Pennsylvania': 'America/New_York',
  'Rhode Island': 'America/New_York',
  'South Carolina': 'America/New_York',
  'Vermont': 'America/New_York',
  'Virginia': 'America/New_York',
  'Washington DC': 'America/New_York',
  'West Virginia': 'America/New_York',
  // Central Time
  'Alabama': 'America/Chicago',
  'Arkansas': 'America/Chicago',
  'Illinois': 'America/Chicago',
  'Iowa': 'America/Chicago',
  'Kansas': 'America/Chicago',
  'Louisiana': 'America/Chicago',
  'Minnesota': 'America/Chicago',
  'Mississippi': 'America/Chicago',
  'Missouri': 'America/Chicago',
  'Nebraska': 'America/Chicago',
  'North Dakota': 'America/Chicago',
  'Oklahoma': 'America/Chicago',
  'South Dakota': 'America/Chicago',
  'Tennessee': 'America/Chicago',
  'Texas': 'America/Chicago',
  'Wisconsin': 'America/Chicago',
  // Mountain Time
  'Arizona': 'America/Phoenix',
  'Colorado': 'America/Denver',
  'Idaho': 'America/Boise',
  'Montana': 'America/Denver',
  'New Mexico': 'America/Denver',
  'Utah': 'America/Denver',
  'Wyoming': 'America/Denver',
  // Pacific Time
  'California': 'America/Los_Angeles',
  'Nevada': 'America/Los_Angeles',
  'Oregon': 'America/Los_Angeles',
  'Washington': 'America/Los_Angeles',
  // Alaska
  'Alaska': 'America/Anchorage',
  // Hawaii
  'Hawaii': 'Pacific/Honolulu',
};
