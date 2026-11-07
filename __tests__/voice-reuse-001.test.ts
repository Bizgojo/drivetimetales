import { recentGroups, mainCharacterVoiceIds, speakerLineCounts, groupKey, VOICE_REUSE_GROUP_WINDOW } from '@/lib/voiceReuseWindow'
import fs from 'fs'
import path from 'path'

const row = (series: string | null, story: string, name: string, voice: string, at: string) =>
  ({ series_id: series, story_id: story, character_name: name, character_name_normalized: name.toLowerCase(), voice_id: voice, assigned_at: at })

const script = (lines: string) => `CHARACTER GUIDE\n---\nX — y\n---\n[START AUDIO DRAMA SCRIPT]\n${lines}\nBELLE B OUTRO\n---\nBELLE B: bye\n`

describe('VOICE-REUSE-001 main-character voices are blocked for 30 stories/series', () => {
  it('groups a series as one entry and excludes the current series', () => {
    const rows = [
      row('S1', 'e1', 'DANIEL', 'v-daniel', '2026-11-07T01:00:00Z'),
      row('S1', 'e2', 'DANIEL', 'v-daniel', '2026-11-07T02:00:00Z'),
      row(null, 'single', 'ANNA', 'v-anna', '2026-11-06T00:00:00Z'),
      row('CURRENT', 'c1', 'ZED', 'v-zed', '2026-11-08T00:00:00Z'),
    ]
    const groups = recentGroups(rows, groupKey({ series_id: 'CURRENT', story_id: 'c1' }))
    expect(groups.map((g) => g.key)).toEqual(['series:S1', 'story:single'])
    expect(groups[0].storyIds).toEqual(['e1', 'e2'])
  })

  it('keeps only the 30 most recent groups', () => {
    const rows = Array.from({ length: 40 }, (_, i) => row(null, `s${i}`, 'A', `v${i}`, `2026-10-${String(i % 28 + 1).padStart(2, '0')}T${String(Math.floor(i / 28)).padStart(2, '0')}:00:00Z`))
    expect(recentGroups(rows, 'story:none')).toHaveLength(VOICE_REUSE_GROUP_WINDOW)
  })

  it('blocks the top 3 speakers, not minor characters, and never the narrator', () => {
    const rows = [
      row('S1', 'e1', 'DANIEL', 'v-daniel', '2026-11-07T01:00:00Z'),
      row('S1', 'e1', 'RAE', 'v-rae', '2026-11-07T01:00:00Z'),
      row('S1', 'e1', 'SARAH', 'v-sarah', '2026-11-07T01:00:00Z'),
      row('S1', 'e1', 'EDDIE', 'v-eddie', '2026-11-07T01:00:00Z'),
      row('S1', 'e1', 'THE DISPATCHER', 'v-dispatch', '2026-11-07T01:00:00Z'),
      row('S1', 'e1', 'NARRATOR', 'v-narrator', '2026-11-07T01:00:00Z'),
    ]
    const scripts = [script([
      'DANIEL REYES: a', 'DANIEL REYES: b', 'DANIEL: c', 'DANIEL: d', 'DANIEL: e',
      'RAE OKORO: a', 'RAE OKORO: b', 'RAE: c', 'RAE: d',
      'SARAH: a', 'SARAH: b', 'SARAH: c',
      'EDDIE: a', 'EDDIE: b',
      'THE DISPATCHER: a',
      'NARRATOR: a', 'NARRATOR: b', 'NARRATOR: c', 'NARRATOR: d', 'NARRATOR: e', 'NARRATOR: f',
    ].join('\n'))]
    const groups = recentGroups(rows, 'series:other').map((g) => ({ ...g, scripts }))
    expect([...mainCharacterVoiceIds(groups)].sort()).toEqual(['v-daniel', 'v-rae', 'v-sarah'])
  })

  it('counts lines in the story body only, not the Belle outro', () => {
    const counts = speakerLineCounts([script('DANIEL: hi\nBELLE B: hello')])
    expect(counts.get('DANIEL')).toBe(1)
    expect(counts.has('BELLE B')).toBe(false)
  })

  it('generate-voices uses the new rule and no longer reads job_type=story voiceMaps', () => {
    const src = fs.readFileSync(path.join(__dirname, '../app/api/admin/generate-voices/route.ts'), 'utf8')
    expect(src).toMatch(/from\('character_voice_assignments'\)[\s\S]{0,200}order\('assigned_at'/)
    expect(src).not.toMatch(/\.eq\('job_type', 'story'\)/)
    expect(src).toMatch(/getRecentlyUsedVoiceIds\(context\.storyId, context\.seriesId\)/)
    expect(src).toMatch(/reusedVoice: reusedRecentMainVoice/)
  })
})
