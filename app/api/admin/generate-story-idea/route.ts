import { NextRequest, NextResponse } from 'next/server'

function clean(input: string) {
  return String(input || '').replace(/\s+/g, ' ').trim()
}

function fallbackIdea(genre: string, duration: string, settingSeed: string, authorTarget: string) {
  const g = genre || 'Thriller'
  const d = duration || '15 min'
  const s = clean(settingSeed || '')
  const a = clean(authorTarget || '')

  const presets: Record<string, { title: string; premise: string; setting: string }> = {
    Thriller: {
      title: 'Last Exit Before Dawn',
      premise: 'A tired driver takes a shortcut just before sunrise and witnesses something he was never meant to see. The deeper he gets into a small Southern town, the clearer it becomes that everyone is waiting for him to make the wrong move.',
      setting: s || 'A back-road Southern town just before dawn',
    },
    Mystery: {
      title: 'The Last Room at Calhoun House',
      premise: 'A travel writer checking into a fading boarding house discovers one locked room still receives fresh flowers, decades after its occupant vanished. When another guest disappears, she realizes the house is keeping a secret that is still alive.',
      setting: s || 'A historic Charleston boarding house during a week of rain',
    },
    Horror: {
      title: 'The Sound Beneath the Floor',
      premise: 'A couple restoring an old farmhouse begins hearing movement beneath the kitchen floor every night at exactly 2:13 a.m. When they finally pry the boards up, they uncover evidence that the house was built to keep something in.',
      setting: s || 'An isolated farmhouse outside a dying mill town',
    },
    Western: {
      title: 'Dust on Mercy Creek',
      premise: 'A former deputy rides into Mercy Creek to bury his brother and finds the town ready to lie about how he died. A missing ledger, an uneasy widow, and one armed rancher point to a killing that could split the whole valley open.',
      setting: s || 'A dry cattle town at the edge of open range',
    },
    Comedy: {
      title: 'The Mayor of Parking Lot B',
      premise: 'A retired accountant is accidentally appointed acting mayor of a shopping center during a charity festival and immediately takes the role too seriously. Before lunch he is settling vendor disputes, hunting a missing mascot, and defending the authority of Parking Lot B.',
      setting: s || 'A suburban shopping center on the day of its annual festival',
    },
    Romance: {
      title: 'Snow Line to Somewhere',
      premise: 'Two stranded travelers share the last room at a mountain lodge after a storm closes the only road out. By morning, both have to decide whether the life waiting for them back home is the one they still want.',
      setting: s || 'A mountain lodge cut off by an early snowstorm',
    },
    'Sci-Fi': {
      title: 'Signal Past Midnight',
      premise: 'A night-shift radio engineer picks up a repeating signal that appears to predict local events a few minutes before they happen. When the transmission starts describing her, she realizes the sender knows how the night ends.',
      setting: s || 'A rural radio station after midnight',
    },
  }

  const pick = presets[g] || {
    title: `${g} at Closing Time`,
    premise: `A ${g.toLowerCase()} story built for ${d}. ${s ? `Set in ${s}. ` : ''}One mistake opens the door to danger, secrets, and consequences that keep escalating.`,
    setting: s || `A vivid ${g.toLowerCase()} setting`,
  }

  return {
    title: clean(pick.title),
    premise: clean(pick.premise),
    setting: clean(pick.setting),
    authorTarget: a,
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const genre = body.primaryGenre || 'Thriller'
    const secondaryGenre = body.secondaryGenre || ''
    const tertiaryGenre = body.tertiaryGenre || ''
    const duration = body.duration || '15 min'
    const settingSeed = body.settingSeed || ''
    const authorTarget = body.authorTarget || ''
    const notes = body.notes || ''

    const apiKey = process.env.OPENROUTER_KEY || process.env.ANTHROPIC_API_KEY || ''

    if (!apiKey) {
      console.log('generate-story-idea: no API key, using fallback')
      return NextResponse.json(fallbackIdea(genre, duration, settingSeed, authorTarget))
    }

    const prompt = `
Generate one Endless Tales story-queue idea.

Return strict JSON with keys:
title
premise
setting
authorTarget

Rules:
- Queue-stage only, not a full story.
- Premise should be 2 to 4 sentences.
- Strong commercial hook.
- Use selected genre and duration.
- Incorporate setting seed if provided.
- Honor author target if provided.
- No markdown.
- No extra keys.

Genre: ${genre}
Secondary genre: ${secondaryGenre}
Tertiary genre: ${tertiaryGenre}
Duration: ${duration}
Setting seed: ${settingSeed}
Author target: ${authorTarget}
Notes: ${notes}
`.trim()

    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'anthropic/claude-3.5-sonnet',
          messages: [
            { role: 'system', content: 'You generate concise story-queue ideas for an audio fiction admin tool. Return only valid JSON.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.9
        })
      })

      const txt = await res.text()

      if (!res.ok) {
        console.error('generate-story-idea upstream error:', txt)
        return NextResponse.json(fallbackIdea(genre, duration, settingSeed, authorTarget))
      }

      let content = '{}'
      try {
        const data = JSON.parse(txt)
        content = data?.choices?.[0]?.message?.content || '{}'
      } catch (e) {
        console.error('generate-story-idea parse error:', txt)
        return NextResponse.json(fallbackIdea(genre, duration, settingSeed, authorTarget))
      }

      try {
        const parsed = JSON.parse(content)
        return NextResponse.json({
          title: clean(parsed.title || `${genre} story idea`),
          premise: clean(parsed.premise || ''),
          setting: clean(parsed.setting || settingSeed || ''),
          authorTarget: clean(parsed.authorTarget || authorTarget || ''),
        })
      } catch (e) {
        console.error('generate-story-idea content JSON error:', content)
        return NextResponse.json(fallbackIdea(genre, duration, settingSeed, authorTarget))
      }
    } catch (e) {
      console.error('generate-story-idea fetch failure:', e)
      return NextResponse.json(fallbackIdea(genre, duration, settingSeed, authorTarget))
    }
  } catch (err: any) {
    console.error('generate-story-idea fatal:', err)
    return NextResponse.json(fallbackIdea('Thriller', '15 min', '', ''))
  }
}
