import Link from 'next/link'
import type { ReactNode } from 'react'

export interface LegalSection {
  id: string
  title: string
  body: ReactNode
}

/** The links every legal page shows, and that signed-out pages put in their footer. */
export const LEGAL_LINKS = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms of Use' },
  { href: '/data', label: 'Student data' },
] as const

/**
 * A public legal page (Privacy Policy, Terms of Use): signed out, on every Life2Launch address,
 * readable on a phone. Shows that the text is a draft pending legal review, when it last changed,
 * and a contents list, then each section.
 */
export default function LegalPage({ title, lede, updated, sections, current }: {
  title: string
  lede: ReactNode
  updated: string
  sections: LegalSection[]
  current: string
}) {
  const shown = new Date(`${updated}T12:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-4 sm:px-6">
          <Link href="/" className="text-base font-bold tracking-tight">Life2Launch</Link>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {LEGAL_LINKS.map((link) => (
              <Link key={link.href} href={link.href} aria-current={link.href === current ? 'page' : undefined}
                className="rounded hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 aria-[current=page]:font-semibold aria-[current=page]:text-foreground">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-20 pt-10 sm:px-6">
        <p role="note" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          Draft, pending legal review. It describes how Life2Launch works today.
        </p>
        <h1 className="mt-8 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated <time dateTime={updated}>{shown}</time></p>
        <div className="mt-4 text-[17px] leading-8 text-muted-foreground">{lede}</div>

        <nav aria-label="Contents" className="mt-8 rounded-2xl border border-border px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Contents</p>
          <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {sections.map((section) => (
              <li key={section.id}><a href={`#${section.id}`} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{section.title}</a></li>
            ))}
          </ol>
        </nav>

        {sections.map((section) => (
          <section key={section.id} aria-labelledby={section.id} className="mt-12 scroll-mt-6">
            <h2 id={section.id} className="text-xl font-semibold tracking-tight text-foreground">{section.title}</h2>
            <div className="mt-4 space-y-4 text-[15px] leading-7 text-muted-foreground [&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_li]:pl-1 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
              {section.body}
            </div>
          </section>
        ))}
      </main>
    </div>
  )
}
