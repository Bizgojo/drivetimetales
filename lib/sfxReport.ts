/**
 * SFX-REPORT-001 (Marc 2026-10-30): a plain report of every sound effect in an
 * episode — where it plays, what the story asked for, and which of Marc's kept
 * sounds was used (or "AI-made" when none fit), so a wrong match can be found
 * without hunting for it by ear.
 */
import type { ScriptPosition } from '@/lib/scriptLineIndex'
import type { OverlayPlan } from '@/lib/sfxOverlay'
import type { SfxSource } from '@/lib/sfxGenerate'
import { isSceneBackground } from '@/lib/sfxLayeredMix'

export type ReportEpisode = {
  episodeNumber: number
  title: string
  positions: ScriptPosition[]
  scriptSources: Record<number, SfxSource | null>
  overlay: OverlayPlan | null
}

function nextLine(positions: ScriptPosition[], index: number): string {
  const p = positions.find((x) => x.index >= index && x.kind === 'voice' && x.text)
  if (!p) return '(end)'
  const t = String(p.text || '').replace(/\s+/g, ' ')
  return `${p.speaker || ''}: ${t.length > 70 ? `${t.slice(0, 67)}…` : t}`
}

function sourceLabel(src: { kind: 'library' | 'ai'; libraryName?: string } | null | undefined): string {
  if (!src) return 'unknown'
  return src.kind === 'library' ? `YOUR SOUND: ${src.libraryName}` : 'AI-made (no kept sound fit)'
}

export function buildSfxReport(seriesTitle: string, episodes: ReportEpisode[]): string {
  const out: string[] = [`SOUND REPORT — ${seriesTitle}`]
  let lib = 0
  let ai = 0
  for (const ep of [...episodes].sort((a, b) => a.episodeNumber - b.episodeNumber)) {
    const rows: Array<{ index: number; text: string }> = []
    for (const p of ep.positions.filter((x) => x.kind === 'sfx')) {
      const src = ep.scriptSources[p.index]
      if (src?.kind === 'library') lib += 1
      else ai += 1
      rows.push({ index: p.index, text: `• line ${p.index} (script): asked for "${String(p.text || '').trim()}" → ${sourceLabel(src)}\n    plays before ${nextLine(ep.positions, p.index + 1)}` })
    }
    for (const c of ep.overlay?.cues || []) {
      if (!c.file) continue
      if (c.source?.kind === 'library') lib += 1
      else ai += 1
      const bed = c.kind ? c.kind === 'background' : isSceneBackground(c.cue)
      const where = bed
        ? `background from ${nextLine(ep.positions, c.beforeIndex)}`
        : c.afterWords
          ? `plays inside ${nextLine(ep.positions, c.beforeIndex)} — right after "${c.afterWords}"`
          : `plays before ${nextLine(ep.positions, c.beforeIndex)}`
      rows.push({ index: c.beforeIndex, text: `• line ${c.beforeIndex} (${bed ? 'background' : 'action'}): asked for "${c.cue}" → ${sourceLabel(c.source)}\n    ${where}` })
    }
    rows.sort((a, b) => a.index - b.index)
    out.push('', `EPISODE ${ep.episodeNumber}: ${ep.title} — ${rows.length} effects`, ...rows.map((r) => r.text))
    // SFX-SOUNDMAP-001: every line that names a sound, and what happened there.
    const decisions = ep.overlay?.decisions || []
    if (decisions.length) {
      const scriptAt = new Set(ep.positions.filter((x) => x.kind === 'sfx').map((x) => x.index))
      const plays = decisions.filter((d) => d.verdict === 'play').length
      out.push('', `LINES THAT NAME A SOUND — ${decisions.length} lines: ${plays} play a sound, ${decisions.length - plays} skipped`)
      for (const d of decisions) {
        const line = ep.positions.find((x) => x.index === d.line)
        const said = line ? `${line.speaker || ''}: ${String(line.text || '').replace(/\s+/g, ' ').slice(0, 90)}` : `line ${d.line}`
        const near = scriptAt.has(d.line - 1) || scriptAt.has(d.line + 1) ? ' (script effect next to it)' : ''
        const what = d.verdict === 'play'
          ? `PLAYS: ${d.catalogId ? `${d.catalogId} ` : ''}${d.cue}`
          : d.missing ? `NOT DECIDED — ${d.reason}` : `SKIPPED — ${d.reason}${d.wanted ? ` (wanted: ${d.wanted})` : ''}${near}`
        out.push(`• line ${d.line} ${said}`, `    ${what}`)
      }
    }
    // SFX-CATALOG-001: what Claude wanted but the catalog does not have (no backup was used).
    const wanted = ep.overlay?.wanted || []
    if (wanted.length) {
      out.push('', `SOUNDS WANTED BUT NOT IN THE CATALOG — ${wanted.length} (these moments got no sound)`)
      for (const w of wanted) out.push(`• line ${w.line}: ${w.wanted}`)
    }
  }
  out.splice(1, 0, `${lib} effects used your kept sounds; ${ai} were AI-made.`)
  return out.join('\n')
}
