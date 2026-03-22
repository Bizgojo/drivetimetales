import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const BASE_URL = 'https://endless-tales.com'
const COVER_URL = `${BASE_URL}/images/podcast-cover.png`

const EPISODES = [
  {
    guid: 'et-when-rosie-came-home-001',
    title: 'When Rosie Came Home',
    description: 'A dog goes missing for two years. Then she shows up on the porch — muddy, thin, and somehow, impossibly, smiling. A 3-minute story about love, loss, and the ones who find their way back.',
    author: 'Daniel Wren',
    duration: '00:03:00',
    durationSecs: 180,
    pubDate: 'Mon, 10 Mar 2026 12:00:00 +0000',
    audioUrl: 'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/dog_lover_stories_1772655114.mp3',
    audioBytes: 2880000,
    genre: 'Heartwarming',
    episodeNumber: 1,
  },
  {
    guid: 'et-the-grave-he-dug-himself-001',
    title: 'The Grave He Dug Himself',
    description: 'A retired sheriff returns home to bury his estranged brother — only to find the grave already dug and his brother standing next to it, holding a rifle and thirty years of unfinished business. A 14-minute western thriller.',
    author: 'James Calloway',
    duration: '00:14:00',
    durationSecs: 840,
    pubDate: 'Wed, 12 Mar 2026 12:00:00 +0000',
    audioUrl: 'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/audio/asc3/871b25af-5ce5-4052-afae-853d086e828f/final_v2359.mp3',
    audioBytes: 13440000,
    genre: 'Western Thriller',
    episodeNumber: 2,
  },
  {
    guid: 'et-the-letters-he-was-meant-to-carry-001',
    title: 'The Letters He Was Meant to Carry',
    description: 'A widowed bus driver finds a backpack full of handwritten letters addressed to strangers across the country — and decides to deliver every one of them. A 14-minute drama about connection, grief, and small acts of kindness.',
    author: 'Sarah Mitchell',
    duration: '00:14:00',
    durationSecs: 840,
    pubDate: 'Fri, 14 Mar 2026 12:00:00 +0000',
    audioUrl: 'https://vmyhlfeouzslixtkmddy.supabase.co/storage/v1/object/public/audio/asc3/5ccce3b8-39fa-4083-96d3-87dac449f45e/final_mix_1773359050597.mp3',
    audioBytes: 13440000,
    genre: 'Drama',
    episodeNumber: 3,
  },
]

export async function GET() {
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:podcast="https://podcastindex.org/namespace/1.0"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Endless Tales</title>
    <link>${BASE_URL}</link>
    <description>Short-form audio dramas built for your commute. Full cast. Original music. Stories that fit in the time you have — 3 to 30 minutes. New episodes every week. Launching April 17, 2026.</description>
    <language>en-us</language>
    <copyright>© 2026 Endless Tales / Wonder Books Press LLC</copyright>
    <managingEditor>hello@endless-tales.com (Endless Tales)</managingEditor>
    <webMaster>hello@endless-tales.com</webMaster>
    <pubDate>Fri, 14 Mar 2026 12:00:00 +0000</pubDate>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <generator>Endless Tales RSS Generator</generator>
    <ttl>60</ttl>
    <atom:link href="${BASE_URL}/api/podcast/rss" rel="self" type="application/rss+xml"/>
    <image>
      <url>${COVER_URL}</url>
      <title>Endless Tales</title>
      <link>${BASE_URL}</link>
      <width>1400</width>
      <height>1400</height>
    </image>
    <itunes:author>Endless Tales</itunes:author>
    <itunes:owner>
      <itunes:name>Endless Tales</itunes:name>
      <itunes:email>hello@endless-tales.com</itunes:email>
    </itunes:owner>
    <itunes:image href="${COVER_URL}"/>
    <itunes:category text="Arts">
      <itunes:category text="Fiction"/>
    </itunes:category>
    <itunes:category text="Society &amp; Culture">
      <itunes:category text="Stories"/>
    </itunes:category>
    <itunes:explicit>false</itunes:explicit>
    <itunes:type>episodic</itunes:type>
    <itunes:complete>no</itunes:complete>
    <itunes:new-feed-url>${BASE_URL}/api/podcast/rss</itunes:new-feed-url>
    <podcast:locked>no</podcast:locked>
${EPISODES.map(ep => `    <item>
      <title>${ep.title}</title>
      <description><![CDATA[${ep.description}<br/><br/>Listen to more stories at <a href="${BASE_URL}?utm_source=podcast&utm_medium=rss&utm_campaign=episode&utm_content=${ep.guid}">${BASE_URL}</a> — launching April 17, 2026.]]></description>
      <content:encoded><![CDATA[${ep.description}<br/><br/>Listen to more stories at <a href="${BASE_URL}">${BASE_URL}</a> — launching April 17, 2026.]]></content:encoded>
      <enclosure url="${ep.audioUrl}" length="${ep.audioBytes}" type="audio/mpeg"/>
      <guid isPermaLink="false">${ep.guid}</guid>
      <pubDate>${ep.pubDate}</pubDate>
      <link>${BASE_URL}?utm_source=podcast&utm_medium=rss&utm_campaign=episode&utm_content=${ep.guid}</link>
      <itunes:title>${ep.title}</itunes:title>
      <itunes:author>${ep.author}</itunes:author>
      <itunes:summary>${ep.description}</itunes:summary>
      <itunes:duration>${ep.duration}</itunes:duration>
      <itunes:episode>${ep.episodeNumber}</itunes:episode>
      <itunes:episodeType>full</itunes:episodeType>
      <itunes:explicit>false</itunes:explicit>
    </item>`).join('\n')}
  </channel>
</rss>`

  return new NextResponse(rss, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
