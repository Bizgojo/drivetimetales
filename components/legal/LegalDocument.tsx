import Link from 'next/link';
type Section = { heading: string; paragraphs: string[] };
export default function LegalDocument({ title, sections }: { title: string; sections: Section[] }) {
  return <main className="min-h-screen bg-gray-950 text-white px-5 py-8">
    <article className="mx-auto max-w-3xl">
      <Link href="/account" className="text-orange-400 text-sm font-semibold">← Back to Account</Link>
      <h1 className="mt-7 mb-2 text-3xl font-bold">{title}</h1>
      <p className="text-gray-400 text-sm mb-8">Draft for legal review · Prepared October 29, 2026 · Not yet effective</p>
      <p className="text-gray-300 text-sm leading-7 mb-6">Endless Tales is operated by Wonder Books Press, Elloree, South Carolina. Questions and requests: <a className="text-orange-400" href="mailto:hello@endless-tales.com">hello@endless-tales.com</a>.</p>
      {sections.map((section, index) => <section key={section.heading} className="mb-7">
        <h2 className="text-lg font-bold text-orange-400 mb-3">{index + 1}. {section.heading}</h2>
        {section.paragraphs.map((p,i) => <p key={i} className="mb-3 text-gray-300 leading-7 text-sm">{p}</p>)}
      </section>)}
      <nav className="border-t border-gray-800 pt-5 mt-10 text-sm flex flex-wrap gap-5 text-orange-400">
        <Link href="/privacy">Privacy Policy</Link><Link href="/terms">Terms and Conditions</Link><Link href="/license">Content License</Link>
      </nav>
    </article>
  </main>;
}
