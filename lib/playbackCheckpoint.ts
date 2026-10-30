/** In-memory checkpoint for an OS interruption of the same media source.
 * Zero emitted by a detached/reset element must not replace the last position.
 * Explicit seeks/restarts clear it; changing story/segment/source cannot reuse it.
 */
export type PlaybackSource = { storyId: string; source: string; segment: number }
export class PlaybackCheckpoint {
  private saved: (PlaybackSource & { seconds: number }) | null = null
  private matches(source: PlaybackSource) {
    return this.saved?.storyId === source.storyId && this.saved?.source === source.source && this.saved?.segment === source.segment
  }
  clear() { this.saved = null }
  capture(source: PlaybackSource, seconds: number) {
    if (source.source && Number.isFinite(seconds) && seconds > 0) this.saved = { ...source, seconds }
  }
  position(source: PlaybackSource, seconds: number, ended = false) {
    if (!ended && seconds === 0 && this.matches(source)) return this.saved!.seconds
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : 0
  }
  restore(audio: { currentTime: number; duration: number; ended: boolean }, source: PlaybackSource) {
    const target = this.position(source, audio.currentTime, audio.ended)
    if (target <= 0 || audio.currentTime !== 0) return false
    // If metadata is not ready, retry at loadedmetadata or the next play event.
    if (!Number.isFinite(audio.duration) || audio.duration <= target) return false
    try { audio.currentTime = target; return true } catch { return false }
  }
}
