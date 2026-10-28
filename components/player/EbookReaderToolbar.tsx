'use client'

export default function EbookReaderToolbar({ title, author, dark, fontSize, onClose, onFontSize, onDark }: {
  title: string; author: string; dark: boolean; fontSize: number
  onClose: () => void; onFontSize: (size: number) => void; onDark: (dark: boolean) => void
}) {
  const foreground = dark ? '#fff' : '#1a1a1a'
  const button = { minWidth: 38, height: 38, padding: '0 8px', borderRadius: 8, border: `1px solid ${dark ? '#64748b' : '#9ca3af'}`, background: 'transparent', color: foreground, fontWeight: 700, cursor: 'pointer' } as const
  return <div aria-label="Reader controls" style={{ flexShrink: 0, position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', color: foreground, background: dark ? '#0f172a' : '#faf7f2', borderBottom: `1px solid ${dark ? '#334155' : '#d1d5db'}` }}>
    <button aria-label="Close reader" onClick={onClose} style={button}>×</button>
    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'system-ui, sans-serif' }} title={`${title} by ${author}`}>
      <strong style={{ fontSize: 13 }}>{title}</strong>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      <button aria-label="Decrease text size" disabled={fontSize <= 13} onClick={() => onFontSize(Math.max(13, fontSize - 1))} style={button}>A−</button>
      <button aria-label="Increase text size" disabled={fontSize >= 26} onClick={() => onFontSize(Math.min(26, fontSize + 1))} style={button}>A+</button>
      <button aria-label={dark ? 'Use day vision' : 'Use night vision'} aria-pressed={dark} onClick={() => onDark(!dark)} style={button}>{dark ? '☀ Day' : '☾ Night'}</button>
    </div>
  </div>
}
