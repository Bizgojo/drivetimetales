const fs = require('fs')
const path = require('path')
const ts = require('typescript')
const vm = require('vm')
const source = fs.readFileSync(path.join(__dirname, '../components/player/CanonicalPlayer.tsx'), 'utf8')
const ast = ts.createSourceFile('player.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
// Execute the real player handlers, with browser/audio/DB boundaries stubbed.
function find(predicate) {
  let result
  function visit(node) { if (predicate(node)) result = node; else ts.forEachChild(node, visit) }
  visit(ast)
  if (!result) throw new Error('Player handler not found')
  return result
}
function initializer(name) {
  return find(n => ts.isVariableDeclaration(n) && n.name.getText(ast) === name).initializer.getText(ast)
}
function jsxHandler(name) {
  return find(n => ts.isJsxAttribute(n) && n.name.getText(ast) === name).initializer.expression.getText(ast)
}
function harness(next = { story: { id: 'well-ep2' }, reason: 'next_series_episode' }) {
  const noop = jest.fn()
  const audio = { paused: false, ended: false, currentTime: 300,
    pause() { this.paused = true }, play() { this.paused = false; return Promise.resolve() } }
  const ctx = { console, clearTimeout, setTimeout, Date,
    autoAdvanceEnabledRef: { current: true }, mountedRef: { current: true }, isAdvancingRef: { current: false },
    autoAdvanceTimerRef: { current: null }, stillListeningTimerRef: { current: null },
    audioRef: { current: audio }, musicRef: { current: null }, storyId: 'well-ep1', story: { series_id: 'well' }, mode: 'series',
    setAutoAdvanceDisabledReason: noop, setAutoAdvanceCandidate: noop, setStillListeningPrompt: noop,
    setEndStateCandidate: noop, setPlaybackEnded: jest.fn(), setCatalogExhausted: noop,
    fetchDirectSeriesAutoAdvanceCandidate: jest.fn(async () => next), startAutoAdvanceTo: jest.fn(),
    finishStoryAndLeave: jest.fn(async () => {}),
    waitForSegmentResume: () => false, isASC3: false, resumeRef: { current: 0 }, hasAllQueueDurations: () => true,
    removedFromContinueRef: { current: false }, saveProgress: noop, getProgressSeconds: () => audio.currentTime,
    endAnalyticsSession: noop, setIsPlaying: noop, isAtNaturalEnd: () => false,
    checkpointRef: { current: { capture: noop, restore: noop } }, playbackSource: noop,
    setAutoplayBlocked: noop, setShowSeriesContinueOverlay: noop, user: null, sessionStartRef: { current: 1 },
    startAnalyticsSession: noop, noMusicRef: { current: true }, loading: false,
    audioStoryIdRef: { current: 'well-ep1' }, inWelcomeRef: { current: false }, saveTimer: { current: null },
    analyticsTrackedRef: { current: false }, router: { push: jest.fn() }, mediaHandlersRef: { current: {} },
  }
  const media = find(n => ts.isBinaryExpression(n) && n.left.getText(ast) === 'mediaHandlersRef.current').right.getText(ast)
  const code = ['disableAutoAdvanceForSession', 'handlePlayPause', 'maybeAutoAdvanceFromNaturalEnd', 'leaveForEpisode']
    .map(name => `var ${name} = ${initializer(name)}`).join('\n') +
    `\nvar onPause = ${jsxHandler('onPause')}; mediaHandlersRef.current = ${media};`
  vm.createContext(ctx)
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, ctx)
  return ctx
}

describe('series continuation survives interruptions', () => {
  test.each(['screen', 'media', 'native'])( '%s pause + native resume still advances EP1 to EP2', async pause => {
    const c = harness()
    if (pause === 'screen') c.handlePlayPause()
    else if (pause === 'media') c.mediaHandlersRef.current.pause()
    else c.audioRef.current.pause()
    c.onPause({ currentTarget: c.audioRef.current })
    // Native resumption intentionally bypasses the on-screen Resume handler.
    await c.audioRef.current.play()
    // Repeat native pause/resume for screen lock or an OS interruption.
    c.audioRef.current.pause(); c.onPause({ currentTarget: c.audioRef.current })
    await c.audioRef.current.play()
    await c.maybeAutoAdvanceFromNaturalEnd('natural_ended')
    expect(c.autoAdvanceEnabledRef.current).toBe(true)
    expect(c.startAutoAdvanceTo).toHaveBeenCalledWith(expect.objectContaining({ story: { id: 'well-ep2' } }))
  })
  test('on-screen resume also preserves continuation', async () => {
    const c = harness(); c.handlePlayPause(); c.handlePlayPause()
    await c.maybeAutoAdvanceFromNaturalEnd('natural_ended')
    expect(c.startAutoAdvanceTo).toHaveBeenCalledTimes(1)
  })
  // STORY-END-LIBRARY-001 (Marc, Nov 10, 2026): lock-screen / car Stop works exactly like Pause.
  test.each([false, true])('media Stop works like Pause: continuation survives (already paused=%s)', async paused => {
    const c = harness(); c.audioRef.current.paused = paused
    c.mediaHandlersRef.current.stop()
    c.handlePlayPause()
    await c.maybeAutoAdvanceFromNaturalEnd('natural_ended')
    expect(c.autoAdvanceEnabledRef.current).toBe(true)
    expect(c.startAutoAdvanceTo).toHaveBeenCalledTimes(1)
  })
  test('choosing another episode cancels the old continuation', async () => {
    const c = harness(); c.leaveForEpisode('another-episode')
    await c.maybeAutoAdvanceFromNaturalEnd('natural_ended')
    expect(c.startAutoAdvanceTo).not.toHaveBeenCalled()
    expect(c.router.push).toHaveBeenCalledTimes(1)
  })
  // STORY-END-LIBRARY-001 (Marc, Nov 10, 2026): the finished story ends and goes
  // to the Library (after the review screen when due) — no Play Again card.
  test('finale ends the story and leaves for the Library without advancing', async () => {
    const c = harness(null); c.handlePlayPause(); await c.audioRef.current.play()
    await c.maybeAutoAdvanceFromNaturalEnd('natural_ended')
    expect(c.startAutoAdvanceTo).not.toHaveBeenCalled()
    expect(c.finishStoryAndLeave).toHaveBeenCalledTimes(1)
  })
  test('after a Stop, a finished finale also leaves for the Library', async () => {
    const c = harness(null); c.mediaHandlersRef.current.stop(); c.handlePlayPause()
    await c.maybeAutoAdvanceFromNaturalEnd('natural_ended')
    expect(c.finishStoryAndLeave).toHaveBeenCalledTimes(1)
  })
  test('after a Stop and Play mid-series, the next episode still starts by itself', async () => {
    const c = harness(); c.mediaHandlersRef.current.stop(); c.handlePlayPause()
    await c.maybeAutoAdvanceFromNaturalEnd('natural_ended')
    expect(c.finishStoryAndLeave).not.toHaveBeenCalled()
    expect(c.startAutoAdvanceTo).toHaveBeenCalledTimes(1)
  })
  test('only choosing a different episode can disable continuation (Stop no longer does)', () => {
    const reasons = [...source.matchAll(/disableAutoAdvanceForSession\('([^']+)'\)/g)].map(m => m[1])
    expect(reasons).toEqual(['different_story'])
  })
})
