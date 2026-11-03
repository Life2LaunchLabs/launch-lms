'use client'

import { Check } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { LOOKS, type LookId } from '@components/Looks/looks'
import type { OpenChange } from './parts'
import type { PortfolioLayout } from '../portfolioTypes'

// eslint-disable-next-line no-unused-vars
type LayoutChange = (next: Partial<PortfolioLayout>) => void

/** A look's card: a little page in its colors, a cover from accent A to B, and two tiles. */
function LookCard({ look, on, onPick }: { look: (typeof LOOKS)[number]; on: boolean; onPick: () => void }) {
  const [background, a, b, c] = look.colors
  return <button type="button" onClick={onPick} aria-pressed={on} className={`relative grid gap-1.5 rounded-2xl border-2 p-2 text-left transition ${on ? 'border-foreground' : 'border-border hover:border-foreground/40'}`}>
    <span className="relative block h-[86px] overflow-hidden rounded-xl border border-black/10" style={{ background }} aria-hidden="true">
      <i className="absolute inset-x-2 top-2 h-[30px] rounded-lg" style={{ background: `linear-gradient(120deg, ${a}, ${b})` }} />
      <i className="absolute left-2 top-11 h-[34px] w-[40%] rounded-lg" style={{ background: c }} />
      <i className="absolute right-2 top-11 h-[34px] w-[calc(60%-24px)] rounded-lg opacity-35" style={{ background: a }} />
    </span>
    <b className="px-1 text-sm font-extrabold">{look.name}</b>
    <small className="px-1 text-xs font-semibold leading-snug text-muted-foreground">{look.blurb}</small>
    {on ? <span className="absolute right-3.5 top-3.5 grid h-6 w-6 place-items-center rounded-full bg-foreground text-background"><Check className="h-3.5 w-3.5" /></span> : null}
  </button>
}

function Segments<T extends string>({ value, options, onPick }: { value: T; options: Array<[T, string]>; onPick: (next: T) => void }) { // eslint-disable-line no-unused-vars
  return <div className="inline-flex rounded-full bg-muted p-1">
    {options.map(([option, label]) => <button key={option} type="button" aria-pressed={value === option} onClick={() => onPick(option)} className={`rounded-full px-3.5 py-1.5 text-[13px] font-bold transition ${value === option ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>)}
  </div>
}

/** The learner's look (their theme for the whole app) and the front page's layout. */
export function LookDialog({ open, onOpenChange, layout, onChange, spot }: { open: boolean; onOpenChange: OpenChange; layout: PortfolioLayout; onChange: LayoutChange; spot?: string }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
      <DialogHeader><DialogTitle>Your look</DialogTitle><DialogDescription>Your theme for all of Launchpad. Visitors see your portfolio in it too.</DialogDescription></DialogHeader>
      <section aria-label="Theme" className={`grid grid-cols-2 gap-2.5 rounded-2xl sm:grid-cols-4 ${spot ? 'p-1 ring-4 ring-[#2F66D6]/25' : ''}`}>
        {LOOKS.map((look) => <LookCard key={look.id} look={look} on={layout.look === look.id} onPick={() => onChange({ look: look.id as LookId })} />)}
      </section>
      <section aria-label="Layout" className="grid gap-2.5">
        <h3 className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">Layout</h3>
        <div className="flex items-center justify-between gap-3"><b className="text-sm">Header</b><Segments value={layout.header} options={[['left', 'Left'], ['center', 'Centered']]} onPick={(header) => onChange({ header })} /></div>
        <div className="flex items-center justify-between gap-3"><b className="text-sm">Sections</b><Segments value={layout.sections} options={[['grid', 'Grid'], ['list', 'List']]} onPick={(sections) => onChange({ sections })} /></div>
      </section>
    </DialogContent>
  </Dialog>
}
