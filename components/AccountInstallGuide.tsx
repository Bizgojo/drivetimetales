'use client'
import { useEffect, useState } from 'react'
import { detectIosBrowser } from '@/lib/iosBrowser'
type Prompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
export default function AccountInstallGuide() {
  const [device, setDevice] = useState('choose')
  const [iosBrowser, setIosBrowser] = useState('safari')
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const [installed, setInstalled] = useState(false)
  useEffect(() => {
    const ua = navigator.userAgent
    const ios = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
    setDevice(ios ? 'iphone' : /android/i.test(ua) ? 'android' : 'choose')
    setIosBrowser(ios && /Macintosh/.test(ua) ? 'safari' : detectIosBrowser(ua))
    setInstalled(window.matchMedia('(display-mode: standalone)').matches || !!(navigator as any).standalone)
    const capture = (e: Event) => { e.preventDefault(); setPrompt(e as Prompt) }
    const done = () => { setInstalled(true); setPrompt(null) }
    window.addEventListener('beforeinstallprompt', capture)
    window.addEventListener('appinstalled', done)
    return () => { window.removeEventListener('beforeinstallprompt', capture); window.removeEventListener('appinstalled', done) }
  }, [])
  async function install() {
    if (!prompt) return
    await prompt.prompt(); await prompt.userChoice; setPrompt(null)
  }
  return <div className="space-y-3">
    {installed ? <p>You’re already using the Home Screen app on this device.</p> : <>
      {prompt && <button className="px-4 py-3 rounded-xl bg-orange-500 text-black font-bold" onClick={install}>Add to Home Screen</button>}
      <label className="block">Show instructions for<select className="block mt-2 bg-slate-800 text-white rounded-lg p-3 w-full" value={device} onChange={e => setDevice(e.target.value)}><option value="choose">Choose your phone</option><option value="iphone">iPhone or iPad</option><option value="android">Android</option></select></label>
      {device === 'iphone' && <><p>{iosBrowser !== 'safari' ? 'Open this website in Safari first, then follow these steps.' : 'In Safari:'}</p><ol className="list-decimal pl-6 space-y-2"><li>Open the Share menu (the square with an upward arrow). It may be inside the browser’s More menu.</li><li>Scroll down and tap <strong>Add to Home Screen</strong>. If it is missing, choose Edit Actions to add it.</li><li>If shown, turn on <strong>Open as Web App</strong>. Tap <strong>Add</strong>.</li></ol><a href="https://support.apple.com/guide/iphone/iph42ab2f3a7/ios" target="_blank" rel="noreferrer" className="underline">Apple’s illustrated instructions</a></>}
      {device === 'android' && <><ol className="list-decimal pl-6 space-y-2"><li>Open this website in Chrome.</li><li>Tap the three-dot menu in the upper-right corner.</li><li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>, then confirm.</li></ol><p>If that option is unavailable, update Chrome and try again.</p></>}
      {device === 'choose' && <p>On your phone, open Endless Tales and return here. We’ll select the instructions for your device automatically.</p>}
    </>}
  </div>
}
