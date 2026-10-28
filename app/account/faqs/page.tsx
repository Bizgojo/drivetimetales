'use client'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import ListeningPreferencesForm from '@/components/ListeningPreferencesForm'
import AccountInstallGuide from '@/components/AccountInstallGuide'
import AccountPhoto from '@/components/AccountPhoto'
import ReferralModal from '@/components/ReferralModal'

export default function FunFactsPage() {
  const { user, loading } = useAuth()
  const [open, setOpen] = useState<string | null>(null)
  const listPosition = useRef(0)
  function showForm(id: string) {
    listPosition.current = window.scrollY
    setOpen(id)
    window.scrollTo(0, 0)
  }
  function closeForm() {
    const previous = open
    setOpen(null)
    requestAnimationFrame(() => {
      window.scrollTo(0, listPosition.current)
      document.getElementById(`fun-facts-${previous}`)?.focus({ preventScroll: true })
    })
  }
  useEffect(() => {
    if (!open) return
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') closeForm() }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [open])
  const button = 'inline-block mt-4 px-4 py-3 rounded-xl bg-orange-500 text-black font-bold'
  const sections = [
    { id: 'preferences', icon: '🎧', title: 'Find your next favorite story', text: 'Tell us what you enjoy, and we’ll recommend stories picked for you on your Home page.', label: 'Tell Us What You Like' },
    { id: 'install', icon: '📱', title: 'Keep Endless Tales close', text: 'Add Endless Tales to your phone’s Home Screen so your next story is always a tap away.', label: 'Add to Home Screen' },
    { id: 'invite', icon: '🎁', title: 'Stories are better with friends', text: 'Give a friend 14 days free without a card. Show them your QR code or send your personal invitation. After their first paid payment, you both earn 14 bonus days.', label: 'Invite a Friend' },
    { id: 'idea', icon: '💡', title: 'Your idea could become a story', text: 'Have an idea you’d love to hear? Send it to us. If we use it, we’ll notify you and credit you as a contributing author.', label: 'Suggest a Story' },
    { id: 'photo', icon: '📸', title: 'Put your smile here', text: 'Make Endless Tales feel more like yours. Replace your avatar with a favorite photo or a fresh selfie.', label: 'Add Your Photo' },
  ]
  if (loading) return <p className="p-6 text-white">Loading…</p>
  if (!user) return <div className="p-6 text-white"><p>Sign in to personalize your Endless Tales account.</p><a href="/signin?returnTo=%2Faccount%2Ffaqs" className={button}>Sign In</a></div>
  const selected = sections.find(section => section.id === open)
  if (selected) return <main className="min-h-screen bg-gray-950 text-white px-4 py-6 pb-24"><div className="max-w-2xl mx-auto">
    {open === 'invite' ? <ReferralModal isOpen onClose={closeForm} userId={user.id} userName={user.first_name || user.user_metadata?.first_name || 'Friend'} /> : <>
      <header className="flex items-start justify-between gap-4 mb-5 pr-14">
        <div><h1 className="text-2xl font-bold"><span aria-hidden="true">{selected.icon}</span> {selected.title}</h1><p className="mt-3 leading-relaxed">{selected.text}</p></div>
        <button type="button" onClick={closeForm} style={{ position: 'fixed', top: 'calc(var(--et-continue-bottom, 56px) + 8px)', right: 16, zIndex: 49 }} aria-label="Close and return to Fun Facts" className="flex-shrink-0 w-11 h-11 rounded-full bg-slate-800 text-white text-2xl">×</button>
      </header>
      {open === 'preferences' ? <ListeningPreferencesForm /> : open === 'install' ? <AccountInstallGuide /> : open === 'photo' ? <AccountPhoto /> : null}
    </>}
  </div></main>
  return <main className="min-h-screen bg-gray-950 text-white px-4 py-6 pb-24"><div className="max-w-2xl mx-auto">
    <header className="text-center mb-7"><span className="text-5xl block mb-3" aria-hidden="true">😊</span><h1 className="text-2xl font-bold">Fun Facts and Things to Do</h1><p className="mt-2">A few ways to make Endless Tales your own.</p></header>
    <div className="space-y-4">{sections.map(section => <section key={section.id} className="rounded-xl bg-slate-900 border border-slate-700 p-5">
      <h2 className="text-lg font-bold"><span aria-hidden="true">{section.icon}</span> {section.title}</h2><p className="mt-2 leading-relaxed">{section.text}</p>
      {section.id === 'idea' ? <a href="/account/suggest-story" className={button}>{section.label}</a> : <button id={`fun-facts-${section.id}`} className={button} onClick={() => showForm(section.id)}>{section.label}</button>}
      {section.id === 'invite' && <p className="text-sm mt-3">For friends new to Endless Tales. Use your invitation link before signup. Rewards follow the first successful payment, not free account creation or a trial. Existing rewards won’t be awarded twice.</p>}
    </section>)}</div>
    <p className="text-center mt-6">Need a hand? <a href="/account/help" className="underline text-orange-300">Contact Support</a></p>
  </div></main>
}
