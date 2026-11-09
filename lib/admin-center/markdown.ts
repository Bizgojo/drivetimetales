// Small Markdown → HTML converter for our own canon documents (trusted text,
// escaped anyway). Handles headings, paragraphs, nested lists, checkboxes,
// blockquotes, tables, code blocks, rules, bold, italics, code and links.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function inline(s: string): string {
  let t = esc(s)
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>')
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|[^)\s]+)\)/g, (_m, txt, href) => `<a href="${href.replace(/"/g, '%22')}" target="_blank" rel="noreferrer">${txt}</a>`)
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  t = t.replace(/<strong>\[(MARC (?:DECIDES|DOES))\]<\/strong>/g, '<strong class="marc-tag">$1</strong>')
  t = t.replace(/\[(MARC (?:DECIDES|DOES))\]/g, '<span class="marc-tag">$1</span>')
  t = t.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
  return t
}

type Item = { indent: number; ordered: boolean; num: number | null; text: string }

function renderList(items: Item[]): string {
  let html = ''
  const stack: { indent: number; tag: string }[] = []
  let openLi = false
  for (const it of items) {
    const tag = it.ordered ? 'ol' : 'ul'
    while (stack.length && it.indent < stack[stack.length - 1].indent) { html += `</li></${stack.pop()!.tag}>`; openLi = true }
    if (!stack.length || it.indent > stack[stack.length - 1].indent) { html += `<${tag}>`; stack.push({ indent: it.indent, tag }); openLi = false }
    else if (openLi) html += '</li>'
    const box = it.text.match(/^\[( |x|X)\]\s+(.*)$/)
    const value = it.ordered && it.num !== null ? ` value="${it.num}"` : ''
    html += box ? `<li class="check">${box[1].trim() ? '☑' : '☐'} ${inline(box[2])}` : `<li${value}>${inline(it.text)}`
    openLi = true
  }
  while (stack.length) html += `</li></${stack.pop()!.tag}>`
  return html
}

export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r/g, '').split('\n')
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    if (/^```/.test(line)) {
      const buf: string[] = []; i++
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++])
      i++; out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`); continue
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) { const lvl = Math.min(6, h[1].length + 1); out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`); i++; continue }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue }
    if (/^>\s?/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''))
      out.push(`<blockquote>${markdownToHtml(buf.join('\n'))}</blockquote>`); continue
    }
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
      const head = cells(line); i += 2
      const rows: string[][] = []
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]))
      out.push(`<div class="table-wrap"><table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`)
      continue
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const items: Item[] = []
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/)
        if (m) { items.push({ indent: m[1].length, ordered: /\d/.test(m[2]), num: /\d/.test(m[2]) ? parseInt(m[2], 10) : null, text: m[3] }); i++; continue }
        if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && items.length) { items[items.length - 1].text += ' ' + lines[i].trim(); i++; continue }
        break
      }
      out.push(renderList(items)); continue
    }
    const buf: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*([-*+]|\d+[.)])\s+|\|.*\|\s*$)/.test(lines[i])) buf.push(lines[i++].trim())
    out.push(`<p>${inline(buf.join(' '))}</p>`)
  }
  return out.join('\n')
}
