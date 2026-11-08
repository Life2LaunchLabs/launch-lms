'use client'

import React from 'react'
import { Check, ChevronLeft, ChevronRight, Map as MapIcon, MoreHorizontal, Sparkles } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import type { LifeDoc, Phase } from '@services/life/life'
import { byId, kids, monthText, parents } from '@components/Goals/phases/graph'
import PhaseCover from '@components/Goals/phases/PhaseCover'
import { useLife } from './LifeContext'
import { LifeIcon } from './icons'
import { monthLabel, phaseOffset, type Per } from './model'

import { tr } from '@/lib/tr'

/** An arrow that splits in two, the top way solid and the other dashed: more than one phase that way. */
function ForkArrow({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" className={`size-5 ${dir === 'left' ? '-scale-x-100' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12h6" />
      <path d="M9 12c3 0 5-5 11-5" /><path d="M17 4l3 3-3 3" />
      <path d="M9 12c3 0 5 5 11 5" strokeDasharray="2.5 3" /><path d="M17 14l3 3-3 3" />
    </svg>
  )
}

/**
 * Sticky: back to the phase, which phase the budget shows (with arrows to the ones before and after it
 * on the map, a sheet to choose where there's more than one) and which stretch of it.
 * `owner` is set when someone shared their plan with you: their name heads it, and nothing can be changed.
 */
export default function ContextBar({ saving, owner, onBack, backLabel, full, onMap }: { saving: 'idle' | 'saving' | 'saved' | 'error'; owner?: string; onBack: () => void; backLabel: string; full: LifeDoc | null; onMap?: () => void }) {
  const { doc, phase, stretch, stretchesOf, selectStretch, catalog, per, setPer, openEstimates } = useLife()
  const [sheet, setSheet] = React.useState<'left' | 'right' | null>(null)
  const off = phaseOffset(doc, phase.id)
  const chips = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const box = chips.current, on = box?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (box && on) box.scrollLeft = on.offsetLeft - (box.clientWidth - on.offsetWidth) / 2
  }, [stretch.i, phase.id])
  // The ways out of this phase on the whole map, not only the route the budget reads.
  const here = full ? byId(full, phase.id) : undefined
  const before: Phase[] = here ? parents(full!, here) : doc.phases.filter((_, i) => doc.phases[i + 1]?.id === phase.id)
  const after: Phase[] = here ? kids(full!, phase.id) : doc.phases.filter((_, i) => doc.phases[i - 1]?.id === phase.id)
  const go = (side: 'left' | 'right') => { const list = side === 'left' ? before : after; if (list.length > 1) setSheet(side); else if (list[0]) selectStretch(list[0].id, 0) }
  const label = (i: number) => (i === 0 ? tr('lit.context_bar.start', 'Start') : stretchesOf[i].why.join(', '))
  const photos = catalog?.place_photos
  const arrow = (side: 'left' | 'right') => {
    const list = side === 'left' ? before : after
    if (!list.length) return <span />
    const name = list.length > 1 ? (side === 'left' ? tr('budget.context_bar.choose_an_earlier_phase', 'Choose an earlier phase') : tr('budget.context_bar.choose_the_next_phase', 'Choose the next phase'))
      : side === 'left' ? tr('budget.context_bar.earlier_phase_title', 'Earlier phase: {{title}}', { title: list[0].title }) : tr('budget.context_bar.next_phase_title', 'Next phase: {{title}}', { title: list[0].title })
    return <Button variant="ghost" size="icon" onClick={() => go(side)} aria-label={name} title={name} aria-haspopup={list.length > 1 ? 'dialog' : undefined}>
      {list.length > 1 ? <ForkArrow dir={side} /> : side === 'left' ? <ChevronLeft /> : <ChevronRight />}
    </Button>
  }
  const options = sheet === 'left' ? before : sheet === 'right' ? after : []

  return (
    <div className="sticky top-0 z-20 -mx-4 mb-4 bg-background/90 px-4 pb-3 pt-3 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label={backLabel} title={backLabel}><ChevronLeft /></Button>
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{owner ? tr('budget.context_bar.owner_s_budget', '{{owner}}’s budget', { owner }) : tr('budget.context_bar.budget', 'Budget')}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {owner ? <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">{tr('budget.context_bar.shared_with_you_view_only', 'Shared with you · view only')}</span>
            : <span className="text-xs text-muted-foreground" aria-live="polite">{saving === 'saving' ? tr('discover.discover_settings_panel.saving', 'Saving…') : saving === 'saved' ? tr('discover.resource_shelves.saved', 'Saved') : saving === 'error' ? tr('budget.context_bar.not_saved', 'Not saved') : ''}</span>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="secondary" size="icon" className="rounded-full" aria-label={tr('budget.context_bar.budget_options', 'Budget options')}><MoreHorizontal /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {openEstimates && phase.lines.length ? <><DropdownMenuItem onSelect={openEstimates}><Sparkles className="mr-2 size-4" />{tr('budget.estimates_dialog.estimates', 'Estimates')}</DropdownMenuItem><DropdownMenuSeparator /></> : null}
              <DropdownMenuLabel className="text-xs text-muted-foreground">{tr('budget.life_plan_workspace.show_amounts_per', 'Show amounts per')}</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={per} onValueChange={(v) => setPer(v as Per)}>
                {(['wk', 'mo', 'yr'] as Per[]).map((p) => <DropdownMenuRadioItem key={p} value={p}>{p === 'wk' ? tr('budget.life_plan_workspace.week', 'Week') : p === 'mo' ? tr('budget.life_plan_workspace.month', 'Month') : tr('budget.life_plan_workspace.year', 'Year')}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="grid min-w-0 flex-1 grid-cols-[40px_minmax(0,1fr)_40px] items-center gap-1 rounded-2xl bg-card p-1.5 shadow-[0_1px_0_hsl(var(--border))]">
          {arrow('left')}
          <div className="flex min-w-0 items-center gap-2.5">
            <PhaseCover phase={phase} photos={photos} className="h-11 w-12 shrink-0 overflow-hidden rounded-lg sm:w-16" />
            <div className="min-w-0 leading-tight">
              <div className="truncate font-bold">{phase.title}</div>
              <div className="truncate text-xs text-muted-foreground">
                {tr('budget.context_bar.monthlabel_to_monthlabel2', '{{monthLabel}} to {{monthLabel2}}', { monthLabel: monthLabel(doc.start, off), monthLabel2: monthLabel(doc.start, off + phase.months - 1) })}{phase.place_label ? ` · ${phase.place_label}` : ''}
              </div>
            </div>
          </div>
          {arrow('right')}
        </div>
        {onMap ? <Button variant="secondary" size="icon" className="size-[58px] shrink-0 rounded-2xl bg-card shadow-[0_1px_0_hsl(var(--border))]" onClick={onMap} aria-label={tr('budget.context_bar.see_the_map', 'See the map')} title={tr('budget.context_bar.see_the_map', 'See the map')}><MapIcon /></Button> : null}
      </div>
      {stretchesOf.length > 1 && (
        <div ref={chips} className="relative mt-2 flex items-center gap-2 overflow-x-auto px-0.5 py-1 [scrollbar-width:none]" role="group" aria-label={tr('budget.context_bar.stretches_in_this_phase', 'Stretches in this phase')}>
          <span className="pointer-events-none absolute inset-x-0 top-1/2 h-0.5 min-w-full bg-border" />
          {stretchesOf.map((s) => {
            const on = s.i === stretch.i
            return (
              <button key={s.i} type="button" aria-pressed={on} onClick={() => selectStretch(phase.id, s.i)} title={`${label(s.i)} · ${monthLabel(doc.start, s.g0)}`}
                className={`relative z-10 inline-flex shrink-0 items-center gap-2 rounded-full p-1 ${on ? 'bg-[var(--org-primary-color)] pr-4 text-[var(--org-on-primary-color)]' : 'bg-card text-muted-foreground ring-1 ring-border hover:text-foreground'}`}>
                <span className="grid size-7 place-items-center rounded-full"><LifeIcon name={s.icon} /></span>
                {on ? <span className="grid text-left leading-tight"><b className="whitespace-nowrap text-sm">{label(s.i)}</b><small className="whitespace-nowrap text-xs opacity-85">{tr('budget.context_bar.monthlabel_to_monthlabel2', '{{monthLabel}} to {{monthLabel2}}', { monthLabel: monthLabel(doc.start, s.g0), monthLabel2: monthLabel(doc.start, s.g1) })}</small></span> : <span className="sr-only">{label(s.i)}</span>}
              </button>
            )
          })}
        </div>
      )}
      <Dialog open={!!sheet} onOpenChange={(o) => !o && setSheet(null)}>
        <DialogContent className="bottom-0 left-0 top-auto max-w-none translate-x-0 translate-y-0 gap-3 rounded-b-none rounded-t-3xl border-x-0 border-b-0 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border">
          <DialogTitle className="text-lg font-extrabold">{sheet === 'left' ? tr('budget.context_bar.which_way_in', 'Which phase before this one?') : tr('budget.context_bar.which_way_next', 'Which phase next?')}</DialogTitle>
          <DialogDescription className="-mt-2 text-sm">{tr('budget.context_bar.your_map_has_options', 'Your map has {{n}} ways here. Pick one to see its budget.', { n: options.length })}</DialogDescription>
          <ul className="space-y-2">
            {options.map((p, i) => (
              <li key={p.id}>
                <button type="button" onClick={() => { setSheet(null); selectStretch(p.id, 0) }} className="flex w-full items-center gap-3 rounded-2xl bg-muted/60 p-2 text-left hover:bg-muted">
                  <PhaseCover phase={p} photos={photos} className="h-12 w-16 shrink-0 overflow-hidden rounded-lg" />
                  <span className="min-w-0 flex-1 leading-tight">
                    <b className="block truncate">{p.title}</b>
                    <span className="block truncate text-xs text-muted-foreground">{p.starts ? tr('budget.context_bar.from_month', 'From {{month}}', { month: monthText(p.starts) }) : ''}{p.place_label ? ` · ${p.place_label}` : ''}{p.idea ? tr('budget.context_bar.idea', ' · idea') : ''}</span>
                  </span>
                  {sheet === 'right' && i === 0 && options.length > 1 ? <span className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-[11px] font-bold text-muted-foreground"><Check className="size-3" />{tr('budget.context_bar.first_choice', 'First choice')}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  )
}
