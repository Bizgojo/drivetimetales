import Link from 'next/link'

export default function AboutPage() {
  return (
    <div className="py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-white text-center mb-8">About Drive Time Tales</h1>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mb-8 text-center">
          <span className="text-4xl block mb-3">🚛</span>
          <p className="text-slate-300">We create premium audio dramas perfectly timed for your journey—whether it's a 30-minute commute or a 3-hour road trip.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4 text-center">
            <span className="text-2xl block mb-2">⏱️</span>
            <h3 className="font-bold text-white text-sm">Perfectly Timed</h3>
            <p className="text-xs text-slate-400">Stories match real drive times</p>
          </div>
          <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4 text-center">
            <span className="text-2xl block mb-2">🎭</span>
            <h3 className="font-bold text-white text-sm">Full Production</h3>
            <p className="text-xs text-slate-400">Pro voice actors & sound design</p>
          </div>
          <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4 text-center">
            <span className="text-2xl block mb-2">📱</span>
            <h3 className="font-bold text-white text-sm">Listen Anywhere</h3>
            <p className="text-xs text-slate-400">Web, mobile, or offline</p>
          </div>
        </div>
        <div className="text-center">
          <Link href="/library" className="px-6 py-3 bg-orange-500 text-black font-semibold rounded-lg inline-block">Browse Stories</Link>
        </div>
      </div>
    </div>
  )
}
