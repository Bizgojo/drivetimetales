/**
 * OUTRO-MUSIC-WRAP-001 (2026-09-29)
 *
 * ffmpeg args for the v2 outro music clip (music under Belle's outro).
 *
 * Bug fixed: the clip used to be cut with input options
 *   -stream_loop -1 -ss <offset> -t <dur> -i music.mp3
 * When offset + dur runs past the end of the music file, the loop wraps and the
 * timestamps jump backwards. The clip then came out roughly twice as long
 * (25s requested → ~45s), so the final mix ended with ~20s of dead air after
 * Belle. The post-render check correctly refused it (Origin 2.0 EP06: music
 * ~187s, chosen offset 176s → "Last 10s effectively silent, -91 dB").
 *
 * Fix: loop the input and do ALL cutting inside the filter graph with
 * atrim=start:duration + asetpts, the same way the story-body music bed is
 * built (which never had this problem).
 */
export function outroMusicClipArgs(opts: {
  musicPath: string
  offsetSec: number
  durationSec: number
  volumeExpr: string
  outPath: string
}): string[] {
  const { musicPath, offsetSec, durationSec, volumeExpr, outPath } = opts
  return [
    '-stream_loop', '-1', '-i', musicPath,
    '-filter_complex',
    `[0:a]atrim=start=${offsetSec}:duration=${durationSec},asetpts=PTS-STARTPTS,volume='${volumeExpr}':eval=frame[out]`,
    '-map', '[out]', '-ar', '44100', '-ac', '2', '-b:a', '192k', '-y', outPath,
  ]
}
