/**
 * TRAILING-DASH-001 (Marc 2026-11-07, Sunset Ep 8 at 13:10 and 16:44): narrator lines that
 * end in a dash ("…who could fill every room —", "…keep a secret that large —") are half of a
 * long sentence split across two script lines. Sent to ElevenLabs as-is, the voice treats the
 * dash as an unfinished thought and fills it with garble; re-recording the same text gave the
 * same garble. The script is NOT changed: only the text sent to the voice turns a final dash
 * into an ellipsis, which the voice reads as a natural trailing pause.
 */
export function speakableText(text: string): string {
  const t = String(text ?? '')
  if (!/[\p{L}\p{N}]/u.test(t)) return t
  return t.replace(/\s*(?:[—–]|--)+[\s"'”’*]*$/u, '…')
}
