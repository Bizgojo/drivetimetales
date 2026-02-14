// lib/news-utils.ts
// Shared utility for news briefings — determines time period from device clock

export function getDeviceTimePeriod(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

export function getTimePeriodEmoji(timePeriod: string): string {
  switch (timePeriod) {
    case 'morning': return '🌅';
    case 'afternoon': return '☀️';
    case 'evening': return '🌙';
    default: return '📰';
  }
}
