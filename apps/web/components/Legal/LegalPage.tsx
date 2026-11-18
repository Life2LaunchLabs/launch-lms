import type { ReactNode } from 'react'
import LegalShell from './LegalShell'

export interface LegalSection {
  id: string
  title: string
  body: ReactNode
}

export { LEGAL_LINKS } from './legalLinks'

/**
 * A public legal page (Privacy Policy, Terms of Use): signed out, on every Life2Launch address, in the
 * front page's frame (LegalShell), readable on a phone. Shows when it last changed and a contents list, then each section.
 */
export default function LegalPage({ orgslug, title, lede, updated, sections, current }: {
  orgslug: string | null
  title: string
  lede: ReactNode
  updated: string
  sections: LegalSection[]
  current: string
}) {
  const shown = new Date(`${updated}T12:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
  return (
    <LegalShell orgslug={orgslug} current={current}>
      <h1 className="text-balance text-[32px] font-black leading-[1.15] text-foreground/80 sm:text-[40px]">{title}</h1>
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
        <section key={section.id} aria-labelledby={section.id} className="mt-12">
          <h2 id={section.id} className="scroll-mt-24 text-xl font-semibold tracking-tight text-foreground">{section.title}</h2>
          <div className="mt-4 space-y-4 text-[15px] leading-7 text-muted-foreground [&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_li]:pl-1 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
            {section.body}
          </div>
        </section>
      ))}
    </LegalShell>
  )
}
