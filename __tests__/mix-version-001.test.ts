import fs from 'fs'
import path from 'path'
const core = fs.readFileSync(path.join(__dirname, '../app/api/asc3/render-final-mix/core.ts'), 'utf8')
const pers = fs.readFileSync(path.join(__dirname, '../lib/personalizedFinalMix.ts'), 'utf8')

describe('MIX-VERSION-001 a remix is a new address', () => {
  it('stores versioned audio_url and story_audio_url', () => {
    expect(core).toMatch(/audio_url: versionedFinalAudioUrl/)
    expect(core).toMatch(/story_audio_url: versionedStoryBodyUrl/)
    expect(core).toMatch(/outro_with_music_url: `\$\{outroWithMusicStorageUrl\}\$\{renderVersion\}`/)
  })
  it('Belle freshness binds to the same versioned URL that is stored', () => {
    expect(core).toMatch(/outputAsset: versionedFinalAudioUrl/)
  })
  it('personalized mixes rebuild when the body or outro changes', () => {
    expect(pers).toMatch(/const sourceHash = hashPart\(`\$\{bodyUrl\}\|\$\{outroUrl\}`\)/)
    expect(pers).toMatch(/\$\{PERSONALIZED_MIX_VERSION\}\/\$\{sourceHash\}\/final_mix\.mp3/)
  })
})
