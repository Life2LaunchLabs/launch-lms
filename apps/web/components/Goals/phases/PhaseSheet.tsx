'use client'
/* eslint-disable no-unused-vars -- parameter names in function types */

import React from 'react'
import { Check, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@components/ui/button'
import type { LifeDoc, Phase, PlacePhoto } from '@services/life/life'
import PhaseCover from './PhaseCover'
import { byId, canJoin, kids, monthText, whenOf } from './graph'

import { tr } from '@/lib/tr'
/** A phase's details: a bottom sheet on a phone, a dialog on a wider screen. */
export default function PhaseSheet({ doc, p, photos, state, setState, onOpen, onRename, onKeep, onRemove, onMove, onSplit, onJoin }: {
  doc: LifeDoc; p: Phase; photos?: Record<string, PlacePhoto>; state: { id: string; renaming?: string; confirmRm?: boolean }; setState: (s: { id: string; renaming?: string; confirmRm?: boolean } | null) => void
  onOpen: () => void; onRename: (t: string) => void; onKeep: () => void; onRemove: () => void; onMove: () => void; onSplit: (fromId: string) => void; onJoin: (toId: string) => void
}) {
  const wh = whenOf(doc, p), fixed = wh === 'now' || wh === 'done', leaf = !kids(doc, p.id).length
  const joinTo = leaf ? doc.phases.filter((x) => canJoin(doc, p.id, x.id)) : []
  const renaming = state.renaming != null
  const close = () => setState(null)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const act = 'h-11 rounded-2xl bg-muted px-3.5 text-left text-sm font-extrabold hover:bg-muted/70'
  return <div className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-6" style={{ zIndex: 'var(--z-modal)' }}>
    <button type="button" aria-label={tr('goals.explore_board.close', 'Close')} className="absolute inset-0 cursor-default bg-black/45" onClick={close} />
    <div role="dialog" aria-modal="true" aria-label={p.title} className="relative grid max-h-[90dvh] w-full gap-3 overflow-y-auto rounded-t-[28px] bg-card p-4 pb-[max(18px,env(safe-area-inset-bottom))] text-foreground shadow-2xl sm:max-w-[480px] sm:rounded-[28px] sm:p-5">
      <span className="mx-auto h-1.5 w-10 rounded-full bg-border sm:hidden" aria-hidden="true" />
      <div className="relative h-28 overflow-hidden rounded-[18px]"><PhaseCover phase={p} photos={photos} className="absolute inset-0 h-full w-full" />
        <button type="button" onClick={close} aria-label={tr('goals.explore_board.close', 'Close')} className="absolute right-2.5 top-2.5 grid size-8 place-items-center rounded-full bg-black/40 text-white"><X size={16} aria-hidden="true" /></button></div>
      <div>
        <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">{p.idea ? tr('goals.phase_sheet.idea', 'Idea · ') : ''}{{ now: 'You’re here', done: 'Before now', next: 'Up next', later: 'Later' }[wh]}</span>
        {renaming
          ? <form onSubmit={(e) => { e.preventDefault(); onRename(state.renaming || '') }} className="mt-1 flex gap-2">
            <input autoFocus aria-label={tr('goals.phase_sheet.name', 'Name')} value={state.renaming} placeholder={p.title} onChange={(e) => setState({ ...state, renaming: e.target.value })} className="h-11 min-w-0 flex-1 rounded-xl bg-muted px-3 text-xl font-extrabold outline-none focus:ring-2 focus:ring-[var(--org-primary-color)]" />
            <Button type="submit" variant="brand">{tr('goals.goal_stages.save', 'Save')}</Button></form>
          : <h3 className="text-[26px] font-extrabold leading-tight tracking-tight">{p.title}</h3>}
        <p className="text-sm text-muted-foreground">{p.undated ? tr('goals.phase_sheet.no_start_date_yet', 'No start date yet') : `From ${monthText(p.starts!)}`}{p.place_label ? ` · ${p.place_label}` : ''}{(p.after?.length || 0) > 1 ? tr('goals.phase_sheet.length_ways_lead_here', ' · {{length}} ways lead here', { length: p.after!.length }) : ''}</p>
      </div>
      {state.confirmRm ? <div className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-100 px-3 py-2 text-sm font-bold text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
        {tr('goals.phase_sheet.remove_title_its_budget_goes', 'Remove {{title}}? Its budget goes too, and its goals go back to the phase you’re in.', { title: p.title })}
        <Button size="sm" variant="destructive" onClick={onRemove}>{tr('goals.upload.remove', 'Remove')}</Button><Button size="sm" variant="ghost" onClick={() => setState({ id: p.id })}>{tr('goals.phase_sheet.keep', 'Keep')}</Button>
      </div> : null}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="brand" className="col-span-2 justify-between" onClick={onOpen}>{tr('goals.phase_sheet.open_title', 'Open {{title}}', { title: p.title })}<ChevronRight size={16} aria-hidden="true" /></Button>
        {renaming ? null : <button type="button" className={act} onClick={() => setState({ id: p.id, renaming: p.title })}>{tr('goals.phase_sheet.rename', 'Rename')}</button>}
        {p.idea ? <button type="button" className={act} onClick={onKeep}><Check size={14} className="mr-1 inline" aria-hidden="true" />{tr('goals.phase_page.make_it_real', 'Make it real')}</button> : null}
        {!fixed ? <button type="button" className={act} onClick={onMove}>{tr('goals.phase_sheet.move', 'Move')}</button> : null}
        {(p.after?.length || 0) > 1 ? p.after!.map((id) => <button key={id} type="button" className={cn(act, 'col-span-2')} onClick={() => onSplit(id)}>{tr('goals.phase_sheet.split_off_the_title_way', 'Split off the {{title}} way', { title: byId(doc, id)?.title })}</button>) : null}
        {joinTo.length ? <label className={cn(act, 'col-span-2 flex items-center gap-2')}>{tr('goals.phase_sheet.leads_into', 'Leads into')}
          <select aria-label={tr('goals.phase_sheet.leads_into', 'Leads into')} className="min-w-0 flex-1 bg-transparent font-extrabold" value="" onChange={(e) => { if (e.target.value) onJoin(e.target.value) }}>
            <option value="">…</option>{joinTo.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select></label> : null}
        {fixed ? null : <button type="button" className={cn(act, 'bg-transparent text-muted-foreground')} onClick={() => (p.idea ? onRemove() : setState({ id: p.id, confirmRm: true }))}>{tr('goals.upload.remove', 'Remove')}</button>}
      </div>
    </div>
  </div>
}
