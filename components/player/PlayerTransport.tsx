'use client'

import { useRef, useState, type CSSProperties } from 'react'
import { formatPlaybackTime } from '@/lib/playerControls'

interface PlayerTransportProps {
  currentTime: number
  duration: number
  seekEnabled: boolean
  isPlaying: boolean
  isBuffering: boolean
  hasStarted: boolean
  ended: boolean
  autoplayBlocked: boolean
  onboarding?: boolean
  onToggle: () => void
  onSeek: (seconds: number) => void
  onRestart: () => void
}

export default function PlayerTransport({ currentTime, duration, seekEnabled, isPlaying, isBuffering,
  hasStarted, ended, autoplayBlocked, onboarding = false, onToggle, onSeek, onRestart }: PlayerTransportProps) {
  const [draft, setDraft] = useState<number | null>(null)
  const dragging = useRef(false)
  const total = Number.isFinite(duration) && duration > 0 ? duration : 0
  const current = Math.max(0, Math.min(total, draft ?? currentTime))
  const percent = total > 0 ? current / total * 100 : 0
  const commit = (value: number) => {
    dragging.current = false
    setDraft(null)
    onSeek(value)
  }
  const label = onboarding ? '▶ Continue your story'
    : isPlaying ? (isBuffering ? 'Buffering…' : '⏸ Pause')
      : ended ? '▶ Play Again' : currentTime > 0 ? '▶ Continue' : '▶ Play'

  return <div className="et-player-transport">
    <label className="et-player-sr-only" htmlFor="episode-progress">Episode progress</label>
    <input id="episode-progress" className="et-player-scrubber" type="range" min={0} max={total || 1} step={0.1}
      value={current} disabled={!seekEnabled || onboarding}
      aria-valuetext={`${formatPlaybackTime(current)} of ${formatPlaybackTime(total)}`}
      style={{ '--player-progress': `${percent}%` } as CSSProperties}
      onPointerDown={e => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId) }}
      onChange={e => {
        const value = Number(e.currentTarget.value)
        if (dragging.current) setDraft(value)
        else onSeek(value) // keyboard and assistive technology change events
      }}
      onPointerUp={e => { if (dragging.current) commit(Number(e.currentTarget.value)) }}
      onPointerCancel={() => { dragging.current = false; setDraft(null) }}
      onBlur={e => { if (dragging.current) commit(Number(e.currentTarget.value)) }}
    />
    <div className="et-player-times" aria-live="off">
      <span>{formatPlaybackTime(current)} <span className="et-player-time-muted">/ {formatPlaybackTime(total)}</span></span>
      <span>−{formatPlaybackTime(Math.max(0, total - current))} left</span>
    </div>
    <div className="et-player-transport-buttons">
      <button type="button" className="et-player-skip" aria-label="Rewind 15 seconds" title="Rewind 15 seconds"
        disabled={!seekEnabled || onboarding} onClick={() => onSeek(Math.max(0, currentTime - 15))}>
        <span aria-hidden="true">↶</span><small>15s</small>
      </button>
      <button type="button" className={`et-player-toggle ${isPlaying ? 'is-playing' : ''}`}
        onClick={onToggle} aria-label={isPlaying ? 'Pause' : onboarding ? 'Continue your story' : ended ? 'Play Again' : currentTime > 0 ? 'Continue' : 'Play'}>
        {label}
      </button>
      <button type="button" className="et-player-skip" aria-label="Forward 15 seconds" title="Forward 15 seconds"
        disabled={!seekEnabled || onboarding} onClick={() => onSeek(Math.min(total, currentTime + 15))}>
        <span aria-hidden="true">↷</span><small>15s</small>
      </button>
      {hasStarted && !onboarding && <button type="button" className="et-player-start-over" onClick={onRestart}>Start Over</button>}
    </div>
    {autoplayBlocked && !onboarding && !isPlaying && <p className="et-player-autoplay-note">Tap {currentTime > 0 ? 'Continue' : 'Play'} to start audio on this device.</p>}
    <style>{`
      .et-player-transport{width:100%;color:white}
      .et-player-scrubber{display:block;width:100%;height:44px;border:0;border-radius:8px;padding:0;margin:3px 0 2px;background:transparent;cursor:pointer;appearance:none;-webkit-appearance:none;touch-action:pan-y;box-shadow:0 0 0 16px transparent}
      .et-player-scrubber::-webkit-slider-runnable-track{height:8px;border-radius:8px;background:linear-gradient(to right,#f97316 var(--player-progress),#475569 var(--player-progress))}
      .et-player-scrubber::-webkit-slider-thumb{appearance:none;-webkit-appearance:none;width:26px;height:26px;border-radius:50%;background:#f97316;border:3px solid white;box-shadow:0 1px 8px #0008;margin-top:-9px}
      .et-player-scrubber::-moz-range-track{height:8px;background:linear-gradient(to right,#f97316 var(--player-progress),#475569 var(--player-progress));border-radius:8px}
      .et-player-scrubber::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:#f97316;border:3px solid white;box-shadow:0 1px 8px #0008}
      .et-player-scrubber:focus-visible{outline:3px solid #fdba74;outline-offset:10px}
      .et-player-scrubber:disabled{opacity:.5;cursor:wait}
      .et-player-times{display:flex;justify-content:space-between;font-size:12px;font-variant-numeric:tabular-nums;margin:0 0 13px;color:#f1f5f9}
      .et-player-time-muted{color:#94a3b8}
      .et-player-transport-buttons{display:flex;align-items:stretch;gap:8px;width:100%}
      .et-player-transport-buttons button{min-height:52px;border:1px solid #ffffff26;border-radius:12px;color:white;cursor:pointer;touch-action:manipulation;font-family:inherit}
      .et-player-transport-buttons button:focus-visible{outline:3px solid #fdba74;outline-offset:3px}
      .et-player-skip{width:46px;flex:0 0 46px;padding:4px;background:#ffffff12;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1}
      .et-player-skip>span{font-size:24px;line-height:24px}.et-player-skip small{font-size:10px;font-weight:700}
      .et-player-toggle{flex:1;min-width:0;font-size:15px;font-weight:750;padding:12px 7px;background:#22c55e!important;border-color:transparent!important}
      .et-player-toggle.is-playing{background:#f97316!important}
      .et-player-start-over{flex:0 0 78px;font-size:11px;font-weight:650;padding:8px 5px;background:#ffffff12}
      .et-player-transport-buttons button:disabled{opacity:.4;cursor:default}
      .et-player-autoplay-note{font-size:12px;color:#cbd5e1;text-align:center;margin:12px 0 0;line-height:1.5}
      .et-player-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
    `}</style>
  </div>
}
