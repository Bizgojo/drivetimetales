'use client'
import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import ListeningPreferencesForm from '@/components/ListeningPreferencesForm'
import AccountInstallGuide from '@/components/AccountInstallGuide'
import AccountPhoto from '@/components/AccountPhoto'
import ReferralModal from '@/components/ReferralModal'

export default function FunFactsPage() {
  const { user, loading } = useAuth()
  const [open, setOpen] = useState<string | null>(null)
  const [invite, setInvite] = useState(false)
  const button = 'inline-block mt-4 px-4 py-3 rounded-xl bg-orange-500 text-black font-bold'
  const sections = [
    { id: 'preferences', icon: '🎧', title: 'Find your next favorite story', text: 'Tell us what you enjoy, and we’ll recommend stories picked for you on your Home page.', label: 'Tell Us What You Like' },
    { id: 'install', icon: '📱', title: 'Keep Endless Tales close', text: 'Add Endless Tales to your phone’s Home Screen so your next story is always a tap away.', label: 'Add to Home Screen' },
    { id: 'invite', icon: '🎁', title: 'Stories are better with friends', text: 'Invite a friend to Endless Tales. After their first paid subscription payment, you’ll both receive two free weeks.', label: 'Invite a Friend' },
    { id: 'idea', icon: '💡', title: 'Your idea could become a story', text: 'Have an idea you’d love to hear? Send it to us. If we use it, we’ll notify you and credit you as a contributing author.', label: 'Suggest a Story' },
    { id: 'photo', icon: '📸', title: 'Put your smile here', text: 'Make Endless Tales feel more like yours. Replace your avatar with a favorite photo or a fresh selfie.', label: 'Add Your Photo' },
  ]
  if (loading) return <p className="p-6 text-white">Loading…</p>
  if (!user) return <div className="p-6 text-white"><p>Sign in to personalize your Endless Tales account.</p><a href="/signin?returnTo=%2Faccount%2Ffaqs" className={button}>Sign In</a></div>
  return <main className="min-h-screen bg-gray-950 text-white px-4 py-6 pb-24"><div className="max-w-2xl mx-auto">
    <header className="text-center mb-7"><span className="text-5xl block mb-3" aria-hidden="true">😊</span><h1 className="text-2xl font-bold">Fun Facts and Things to Do</h1><p className="mt-2">A few ways to make Endless Tales your own.</p></header>
    <div className="space-y-4">{sections.map(section => <section key={section.id} className="rounded-xl bg-slate-900 border border-slate-700 p-5">
      <h2 className="text-lg font-bold"><span aria-hidden="true">{section.icon}</span> {section.title}</h2><p className="mt-2 leading-relaxed">{section.text}</p>
      {section.id === 'idea' ? <a href="/account/suggest-story" className={button}>{section.label}</a> : <button className={button} aria-expanded={section.id === 'invite' ? invite : open === section.id} onClick={() => section.id === 'invite' ? setInvite(true) : setOpen(open === section.id ? null : section.id)}>{open === section.id ? 'Close' : section.label}</button>}
      {section.id === 'install' && <div hidden={open !== 'install'} className="mt-5 pt-4 border-t border-slate-700"><AccountInstallGuide /></div>}
      {open === section.id && section.id !== 'install' && <div className="mt-5 pt-4 border-t border-slate-700">{section.id === 'preferences' ? <ListeningPreferencesForm /> : section.id === 'photo' ? <AccountPhoto /> : null}</div>}
      {section.id === 'invite' && <p className="text-sm mt-3">For friends new to Endless Tales. Use your invitation link before signup. Rewards follow the first successful payment, not free account creation or a trial. Existing rewards won’t be awarded twice.</p>}
    </section>)}</div>
    <p className="text-center mt-6">Need a hand? <a href="/account/help" className="underline text-orange-300">Contact Support</a></p>
    <ReferralModal isOpen={invite} onClose={() => setInvite(false)} userId={user.id} userName={user.first_name || user.user_metadata?.first_name || 'Friend'} />
  </div></main>
}
