'use client'

import React from 'react'
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { useLife } from './LifeContext'
import { LifeIcon } from './icons'
import { monthLabel, phaseOffset, uid } from './model'
import { PhaseForm } from './PhaseForm'

/** Sticky: which phase and which stretch of it the budget below is showing. */
export default function ContextBar({ saving }: { saving: 'idle' | 'saving' | 'saved' | 'error' }) {
  const { doc, phase, stretch, stretchesOf, selectStretch, update, token } = useLife()
  const [edit, setEdit] = React.useState<'edit' | 'add' | null>(null)
  const k = doc.phases.findIndex((p) => p.id === phase.id)
  const off = phaseOffset(doc, phase.id)
  const chips = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const box = chips.current, on = box?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (box && on) box.scrollLeft = on.offsetLeft - (box.clientWidth - on.offsetWidth) / 2
  }, [stretch.i, phase.id])
  const go = (d: number) => { const p = doc.phases[k + d]; if (p) selectStretch(p.id, 0) }
  const label = (i: number) => (i === 0 ? 'Start' : stretchesOf[i].why.join(', '))

  return (
    <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-border/70 bg-background/90 px-4 pb-3 pt-3 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight">Life plan</h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground" aria-live="polite">{saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Saved' : saving === 'error' ? 'Not saved' : ''}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Phase options"><MoreHorizontal /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEdit('edit')}>Edit this phase</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setEdit('add')}>Add a phase after this one</DropdownMenuItem>
              {doc.phases.length > 1 && <><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive" onSelect={() => {
                if (!window.confirm(`Remove "${phase.title}" and its budget?`)) return
                update((d) => { d.phases = d.phases.filter((p) => p.id !== phase.id); d.events = d.events.filter((e) => e.phase !== phase.id) })
                selectStretch(doc.phases[Math.max(0, k - 1)].id === phase.id ? doc.phases[k + 1].id : doc.phases[Math.max(0, k - 1)].id, 0)
              }}>Remove this phase</DropdownMenuItem></>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-1 rounded-2xl bg-card p-1 shadow-[0_1px_0_hsl(var(--border))]">
        {k > 0 ? <Button variant="ghost" size="icon" onClick={() => go(-1)} aria-label={`Earlier phase: ${doc.phases[k - 1].title}`}><ChevronLeft /></Button> : <span />}
        <div className="min-w-0 text-center leading-tight">
          <div className="truncate font-bold">{phase.title}</div>
          <div className="truncate text-xs text-muted-foreground">
            {monthLabel(doc.start, off)} to {monthLabel(doc.start, off + phase.months - 1)}{phase.place_label ? ` · ${phase.place_label}` : ''} · phase {k + 1} of {doc.phases.length}
          </div>
        </div>
        {k < doc.phases.length - 1 ? <Button variant="ghost" size="icon" onClick={() => go(1)} aria-label={`Next phase: ${doc.phases[k + 1].title}`}><ChevronRight /></Button> : <Button variant="ghost" size="icon" onClick={() => setEdit('add')} aria-label="Add the next phase" title="Add the next phase"><span className="text-lg leading-none">+</span></Button>}
      </div>
      {stretchesOf.length > 1 && (
        <div ref={chips} className="relative mt-2 flex items-center gap-2 overflow-x-auto px-0.5 py-1 [scrollbar-width:none]" role="group" aria-label="Stretches in this phase">
          <span className="pointer-events-none absolute inset-x-0 top-1/2 h-0.5 min-w-full bg-border" />
          {stretchesOf.map((s) => {
            const on = s.i === stretch.i
            return (
              <button key={s.i} type="button" aria-pressed={on} onClick={() => selectStretch(phase.id, s.i)} title={`${label(s.i)} · ${monthLabel(doc.start, s.g0)}`}
                className={`relative z-10 inline-flex shrink-0 items-center gap-2 rounded-full p-1 ${on ? 'bg-[var(--org-primary-color)] pr-4 text-[var(--org-on-primary-color)]' : 'bg-card text-muted-foreground ring-1 ring-border hover:text-foreground'}`}>
                <span className="grid size-7 place-items-center rounded-full"><LifeIcon name={s.icon} /></span>
                {on ? <span className="grid text-left leading-tight"><b className="whitespace-nowrap text-sm">{label(s.i)}</b><small className="whitespace-nowrap text-xs opacity-85">{monthLabel(doc.start, s.g0)} to {monthLabel(doc.start, s.g1)}</small></span> : <span className="sr-only">{label(s.i)}</span>}
              </button>
            )
          })}
        </div>
      )}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit === 'add' ? 'Add the next phase' : 'Edit this phase'}</DialogTitle></DialogHeader>
          <div className="pt-4">
            {edit && (
              <PhaseForm
                token={token}
                initial={edit === 'edit' ? { title: phase.title, kind: phase.kind, place: phase.place ?? null, placeLabel: phase.place_label || '', months: phase.months } : { title: '', kind: 'work', place: phase.place ?? null, placeLabel: phase.place_label || '', months: 12 }}
                submitLabel={edit === 'add' ? 'Add phase' : 'Save'}
                onCancel={() => setEdit(null)}
                onSubmit={(f) => {
                  if (edit === 'edit') update((d) => { const p = d.phases.find((x) => x.id === phase.id)!; Object.assign(p, { title: f.title, kind: f.kind, place: f.place, place_label: f.placeLabel, months: f.months }) })
                  else {
                    const id = uid('p')
                    update((d) => { d.phases.splice(k + 1, 0, { id, title: f.title, kind: f.kind, place: f.place, place_label: f.placeLabel, months: f.months, lines: phase.lines.map((l) => ({ ...l, id: uid('l'), start: 0, end: null })) }) })
                    selectStretch(id, 0)
                  }
                  setEdit(null)
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
