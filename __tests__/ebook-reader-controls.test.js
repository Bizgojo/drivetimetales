const React = require('react')
const { act, create } = require('react-test-renderer')
const ts = require('typescript')
const fs = require('fs')
const vm = require('vm')
const context = { React, exports: {}, require }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/player/EbookReaderToolbar.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText, context)
const Toolbar = context.exports.default

test('reader controls change text size and day/night without losing the story', () => {
  let renderer
  function Reader() {
    const [size, setSize] = React.useState(17), [dark, setDark] = React.useState(false)
    return React.createElement(Toolbar, { title: 'Wrong Side of the River', author: 'Jack Malone', fontSize: size, dark, onFontSize: setSize, onDark: setDark, onClose() {} })
  }
  act(() => { renderer = create(React.createElement(Reader)) })
  const button = label => renderer.root.findByProps({ 'aria-label': label })
  act(() => button('Increase text size').props.onClick())
  expect(renderer.root.findByType(Toolbar).props.fontSize).toBe(18)
  act(() => button('Decrease text size').props.onClick())
  expect(renderer.root.findByType(Toolbar).props.fontSize).toBe(17)
  act(() => button('Use night vision').props.onClick())
  expect(renderer.root.findByType(Toolbar).props.dark).toBe(true)
  expect(button('Use day vision').props['aria-pressed']).toBe(true)
  act(() => button('Use day vision').props.onClick())
  expect(renderer.root.findByType(Toolbar).props.dark).toBe(false)
  expect(renderer.root.findByType('strong').children.join('')).toBe('Wrong Side of the River')
  act(() => renderer.unmount())
})

test('text-size controls enforce their limits and close calls the shared reader action', () => {
  const close = jest.fn(), change = jest.fn()
  let renderer
  act(() => { renderer = create(React.createElement(Toolbar, { title: 'Book', author: 'Author', dark: false, fontSize: 13, onFontSize: change, onDark() {}, onClose: close })) })
  expect(renderer.root.findByProps({ 'aria-label': 'Decrease text size' }).props.disabled).toBe(true)
  act(() => renderer.root.findByProps({ 'aria-label': 'Decrease text size' }).props.onClick())
  expect(change).toHaveBeenCalledWith(13)
  act(() => renderer.root.findByProps({ 'aria-label': 'Close reader' }).props.onClick())
  expect(close).toHaveBeenCalledTimes(1)
  act(() => renderer.unmount())
})

test('the shared reader keeps title and author before the cover and chapter headings after it', () => {
  const src = fs.readFileSync('components/player/CanonicalPlayer.tsx', 'utf8')
  const reader = src.slice(src.indexOf('{/* PROSE —'))
  const title = reader.indexOf('<h1'), author = reader.indexOf('by {story.author'), cover = reader.indexOf('{story.cover_url &&'), chapter = reader.indexOf('Chapter {chapter.episode_number')
  expect(title).toBeGreaterThan(0)
  expect(author).toBeGreaterThan(title)
  expect(cover).toBeGreaterThan(author)
  expect(chapter).toBeGreaterThan(cover)
  expect(src).toContain('document.body')
  expect(src).toContain("top:56, bottom:0, left:0, right:0")
  expect(src).toContain('<EbookReaderToolbar')
})
