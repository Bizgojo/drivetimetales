// CAR-MEDIA-001: MediaSession claim stack + <audio> wiring.
type Handler = ((d: any) => void) | null

function installMediaSession() {
  const handlers: Record<string, Handler> = {}
  const positions: any[] = []
  const ms: any = {
    metadata: null,
    playbackState: 'none',
    setActionHandler: (a: string, h: Handler) => { handlers[a] = h },
    setPositionState: (p: any) => {
      if (p.playbackRate === 0) throw new TypeError('playbackRate 0')
      positions.push(p)
    },
  }
  const g = globalThis as any
  g.navigator = { mediaSession: ms }
  g.window = { location: { origin: 'https://endless-tales.com' } }
  g.MediaMetadata = class { constructor(init: any) { Object.assign(this, init) } }
  return { ms, handlers, positions }
}

class FakeAudio {
  paused = true; currentTime = 0; duration = 100; playbackRate = 1
  private listeners: Record<string, Array<() => void>> = {}
  addEventListener(e: string, fn: () => void) { (this.listeners[e] ||= []).push(fn) }
  removeEventListener(e: string, fn: () => void) { this.listeners[e] = (this.listeners[e] || []).filter(f => f !== fn) }
  emit(e: string) { (this.listeners[e] || []).forEach(f => f()) }
  play() { this.paused = false; this.emit('play'); this.emit('playing'); return Promise.resolve() }
  pause() { this.paused = true; this.emit('pause') }
}

let mod: typeof import('@/lib/mediaSession')
beforeEach(() => {
  jest.resetModules()
  jest.spyOn(console, 'log').mockImplementation(() => {})
  mod = require('@/lib/mediaSession')
})
afterEach(() => {
  const g = globalThis as any
  delete g.navigator; delete g.window; delete g.MediaMetadata
  jest.restoreAllMocks()
})

describe('claim stack', () => {
  it('sets metadata, artwork sizes incl 512x512 and only the given handlers', () => {
    const { ms, handlers } = installMediaSession()
    const next = jest.fn()
    mod.claimMediaSession({ title: 'Ep 3', artist: 'The Series', artworkUrl: '/covers/x.jpg' }, () => ({ play: jest.fn(), nexttrack: next }))
    expect(ms.metadata).toMatchObject({ title: 'Ep 3', artist: 'The Series', album: 'Endless Tales' })
    expect(ms.metadata.artwork.map((a: any) => a.sizes)).toContain('512x512')
    expect(ms.metadata.artwork[0]).toMatchObject({ src: 'https://endless-tales.com/covers/x.jpg', type: 'image/jpeg' })
    expect(handlers.nexttrack).toBeTruthy()
    expect(handlers.seekto).toBeNull()
    handlers.nexttrack!({})
    expect(next).toHaveBeenCalled()
  })

  it('handlers are resolved at call time (no stale closures)', () => {
    const { handlers } = installMediaSession()
    let current = jest.fn()
    mod.claimMediaSession({ title: 'x' }, () => ({ pause: current }))
    const later = jest.fn(); current = later
    handlers.pause!({})
    expect(later).toHaveBeenCalled()
  })

  it('releasing the top claim hands the controls back to the one below', () => {
    const { ms } = installMediaSession()
    const story = mod.claimMediaSession({ title: 'Story' }, () => ({}))
    mod.setMediaPlaybackState(story, 'playing')
    const belle = mod.claimMediaSession({ title: 'Belle' }, () => ({}))
    expect(ms.metadata.title).toBe('Belle')
    mod.releaseMediaSession(belle)
    expect(ms.metadata.title).toBe('Story')
    expect(ms.playbackState).toBe('playing')
    mod.releaseMediaSession(story)
    expect(ms.metadata).toBeNull()
    expect(ms.playbackState).toBe('none')
  })

  it('position updates on a buried claim do not touch the visible session', () => {
    const { positions } = installMediaSession()
    const a = mod.claimMediaSession({ title: 'A' }, () => ({}))
    mod.claimMediaSession({ title: 'B' }, () => ({}))
    mod.setMediaPosition(a, 100, 10)
    expect(positions).toHaveLength(0)
  })
})

describe('attachMediaSession(<audio>)', () => {
  it('claims on play, syncs state/position, maps seek actions, releases on ended', () => {
    const { ms, handlers, positions } = installMediaSession()
    const el = new FakeAudio()
    const detach = mod.attachMediaSession(el as any, { title: 'Sample' })
    expect(ms.metadata).toBeNull() // not claimed until it plays
    el.play()
    expect(ms.metadata.title).toBe('Sample')
    expect(ms.playbackState).toBe('playing')
    expect(positions.at(-1)).toMatchObject({ duration: 100, position: 0 })
    handlers.seekforward!({})
    expect(el.currentTime).toBe(30)
    handlers.seekbackward!({})
    expect(el.currentTime).toBe(15)
    handlers.seekto!({ seekTime: 90 })
    expect(el.currentTime).toBe(90)
    handlers.pause!({})
    expect(ms.playbackState).toBe('paused')
    el.emit('ended')
    expect(ms.metadata).toBeNull()
    detach()
  })

  it('never passes playbackRate 0 to setPositionState', () => {
    installMediaSession()
    const id = mod.claimMediaSession({ title: 'x' }, () => ({}))
    expect(() => mod.setMediaPosition(id, 100, 5, 0)).not.toThrow()
  })

  it('is a no-op without MediaSession support', () => {
    const el = new FakeAudio()
    expect(() => mod.attachMediaSession(el as any, { title: 'x' })()).not.toThrow()
  })
})
