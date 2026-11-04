'use client'

import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@components/ui/dialog'
import type { OpenChange } from './parts'

// Example portfolios in each look, made up. Shown the first time a learner opens their portfolio.
const EXAMPLES = [
  { name: 'Aiyana Begay', line: 'Future nurse · Bend', initials: 'AB', look: 'Playful', bg: '#f5f8f9', fg: '#0e1a21', a: '#4C8DFF', b: '#EC4F9A', chip: '#e6eefb', highlights: ['220 hrs', 'CNA'] },
  { name: 'Marcus Hill', line: 'Game dev club president', initials: 'MH', look: 'Volt', bg: '#0b0f1e', fg: '#eef1ff', a: '#5b2bd6', b: '#00d1c1', chip: '#1d2442', highlights: ['3 games', '1st place'] },
  { name: 'Jordan Reyes', line: 'Welding student · Salem', initials: 'JR', look: 'Gallery', bg: '#ffffff', fg: '#111111', a: '#111111', b: '#6b6b6b', chip: '#efefef', highlights: ['AWS D1.1', 'OSHA 10'] },
  { name: 'Sofia Ramos', line: 'Barista and photographer', initials: 'SR', look: 'Playful', bg: '#fff6ee', fg: '#2a1712', a: '#E8642C', b: '#C8327D', chip: '#fde8da', highlights: ['2 years', '40 shoots'] },
]

function Example({ example }: { example: (typeof EXAMPLES)[number] }) {
  const { bg, fg, a, b, chip } = example
  return <div className="relative w-[210px] shrink-0 snap-center overflow-hidden rounded-[20px] border border-black/10 p-2.5 pb-3 shadow-sm" style={{ background: bg, color: fg }} aria-label={`${example.name}, ${example.look} look`}>
    <div className="h-[52px] rounded-xl" style={{ background: `linear-gradient(120deg, ${a}, ${b})` }} />
    <div className="-mt-6 ml-2 grid h-12 w-12 place-items-center rounded-full text-sm font-extrabold text-white" style={{ background: `linear-gradient(140deg, ${b}, ${a})`, border: `3px solid ${bg}` }}>{example.initials}</div>
    <b className="mt-1.5 block px-1 text-[14px] font-extrabold leading-tight">{example.name}</b>
    <small className="block px-1 text-[11.5px] font-semibold opacity-70">{example.line}</small>
    <div className="mt-2 flex gap-1.5 px-1">{example.highlights.map((item) => <i key={item} className="rounded-full px-2 py-0.5 text-[11px] font-extrabold not-italic" style={{ background: chip }}>{item}</i>)}</div>
    <div className="mt-2 grid grid-cols-3 gap-1.5 px-1" aria-hidden="true">
      <span className="h-10 rounded-lg" style={{ background: a, opacity: 0.85 }} /><span className="h-10 rounded-lg" style={{ background: b, opacity: 0.75 }} /><span className="h-10 rounded-lg" style={{ background: chip }} />
    </div>
    <span className="mt-2 block px-1 text-[11px] font-bold uppercase tracking-[0.08em] opacity-60">{example.look} look</span>
  </div>
}

/** The first visit to the portfolio: what it's for, and examples of what it can look like. */
export function WelcomeDialog({ open, onOpenChange, onStart }: { open: boolean; onOpenChange: OpenChange; onStart: () => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-2xl gap-5 overflow-hidden">
      <div className="grid gap-2 pr-6">
        <DialogTitle className="text-[clamp(28px,5vw,40px)] font-black leading-none tracking-[-0.03em]">Build your brand.</DialogTitle>
        <DialogDescription className="max-w-[52ch] text-[15px] leading-relaxed">One place for everything you’ve done, made and earned. Make it look like you, then share it with employers and schools when you’re ready.</DialogDescription>
      </div>
      <div className="-mx-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-6 pb-1 [scrollbar-width:none]" aria-label="Example portfolios">
        {EXAMPLES.map((example) => <Example key={example.name} example={example} />)}
      </div>
      <Button type="button" variant="brand" size="cta" className="w-full" onClick={onStart}>Let’s go</Button>
    </DialogContent>
  </Dialog>
}
