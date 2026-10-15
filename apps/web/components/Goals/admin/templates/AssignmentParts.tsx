'use client'

import React from 'react'
import { Check, Loader2, Search } from 'lucide-react'
import type { TemplateDocument } from '@services/goals/types'
import { cn } from '@/lib/utils'

// Pieces of the assign dialog: pickers, the stage schedule and small status bits.

export type StageDate = { stage_key: string; due_date: string }
export type StepRule = { step_key: string; stage_key: string; custom: boolean; due_date: string; allow_late: boolean; default_allow_late: boolean }

export interface OrgMember { id: number; username?: string; first_name?: string; last_name?: string; email?: string }
export interface Membership { user?: OrgMember; role?: { id: number; name?: string; rights?: Record<string, Record<string, boolean>> }; id?: number }

export const personName = (person: OrgMember) => [person.first_name, person.last_name].filter(Boolean).join(' ') || person.username || person.email || 'Organization member'
export const memberOf = (membership: Membership): OrgMember => membership.user || (membership as unknown as OrgMember)

/** Staff who can manage goal templates: admins and maintainers, or roles with dashboard access and activity editing. */
export function canStaff(membership: Membership) {
  const role = membership?.role
  if (!role) return false
  if ([1, 2].includes(Number(role.id))) return true
  const rights = role.rights || {}
  return Boolean(rights.dashboard?.action_access && rights.learning_activities?.action_update)
}

const dateValue = (date: Date) => date.toISOString().slice(0, 10)
export const today = () => dateValue(new Date())
const addDays = (value: string, days: number) => { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + days); return dateValue(date) }

/** A first schedule: each stage ends after its length in weeks (one week when it has none). */
export function defaultSchedule(document: TemplateDocument): { stages: StageDate[]; steps: StepRule[] } {
  let target = today()
  const stages = document.stages.map((stage) => { target = addDays(target, Math.max(1, Number(stage.duration_weeks || 1)) * 7); return { stage_key: stage.key as string, due_date: target } })
  const steps = document.stages.flatMap((stage) => stage.steps.map((step) => ({ step_key: step.key as string, stage_key: stage.key as string, custom: false, due_date: '', allow_late: !!step.allow_late, default_allow_late: !!step.allow_late })))
  return { stages, steps }
}

export function scheduleProblem(stages: StageDate[], steps: StepRule[]) {
  if (stages.some((stage) => !stage.due_date)) return 'Set a target date for every stage.'
  if (stages.some((stage, index) => index > 0 && stage.due_date < stages[index - 1].due_date)) return 'Stage target dates must follow stage order.'
  if (steps.some((rule) => rule.custom && !rule.due_date)) return 'Pick a date for every step with a custom target.'
  return null
}

type ScheduleProps = {
  document: TemplateDocument
  stages: StageDate[]
  steps: StepRule[]
  // eslint-disable-next-line no-unused-vars
  setStage: (stageKey: string, dueDate: string) => void
  // eslint-disable-next-line no-unused-vars
  setStep: (stepKey: string, patch: Partial<StepRule>) => void
}

/** Target dates per stage; the last is the goal's target. Steps follow their stage unless overridden. */
export function ScheduleStep({ document, stages, steps, setStage, setStep }: ScheduleProps) {
  return <div className="space-y-5">
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4"><p className="text-sm font-black text-blue-950">Schedule by stage</p><p className="mt-1 text-xs leading-5 text-blue-800">The last stage&apos;s date is the goal&apos;s target. Steps are due with their stage; open the overrides only for exceptions.</p></div>
    {document.stages.map((stage, index) => {
      const date = stages.find((item) => item.stage_key === stage.key)
      return <section key={stage.key} className="overflow-hidden rounded-xl border border-border">
        <header className="flex flex-wrap items-end gap-3 bg-muted/40 px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-xs font-black text-background">{index + 1}</span>
          <div className="min-w-44 flex-1"><p className="text-sm font-black">{stage.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{stage.duration_weeks ? `${stage.duration_weeks} weeks suggested` : `${stage.steps.length} steps`}</p></div>
          <label className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground"><span className="mb-1 block">{index === document.stages.length - 1 ? 'Goal target' : 'Stage target'}</span><input type="date" value={date?.due_date || ''} onChange={(event) => setStage(stage.key as string, event.target.value)} className="h-8 rounded-md border border-border bg-card px-2 text-xs font-normal text-foreground" /></label>
        </header>
        {stage.steps.length ? <details className="border-t border-border"><summary className="cursor-pointer px-4 py-3 text-xs font-black text-muted-foreground hover:bg-muted/30">Step overrides</summary><div className="space-y-2 px-4 pb-4">
          {stage.steps.map((step) => {
            const rule = steps.find((item) => item.step_key === step.key)
            if (!rule) return null
            return <div key={step.key} className="grid gap-2 rounded-lg bg-muted/40 p-3 sm:grid-cols-[minmax(180px,1fr)_170px_150px_80px] sm:items-center">
              <p className="truncate text-xs font-bold" title={step.title}>{step.title}</p>
              <select aria-label={`Target for ${step.title}`} value={rule.custom ? 'custom' : 'stage'} onChange={(event) => setStep(rule.step_key, { custom: event.target.value === 'custom', due_date: event.target.value === 'custom' ? rule.due_date : '' })} className="h-8 min-w-0 rounded-md border border-border bg-card px-2 text-xs"><option value="stage">Due with its stage</option><option value="custom">Custom date</option></select>
              {rule.custom ? <input type="date" aria-label={`Date for ${step.title}`} value={rule.due_date} onChange={(event) => setStep(rule.step_key, { due_date: event.target.value })} className="h-8 min-w-0 rounded-md border border-border px-2 text-[11px]" /> : <span className="text-xs text-muted-foreground">{date?.due_date || 'Stage target'}</span>}
              <label className="inline-flex items-center gap-1.5 text-[10px] font-bold"><input type="checkbox" checked={rule.allow_late} onChange={(event) => setStep(rule.step_key, { allow_late: event.target.checked })} />Late OK</label>
            </div>
          })}
        </div></details> : null}
      </section>
    })}
  </div>
}

// eslint-disable-next-line no-unused-vars
export function PickerSection({ title, count, search, setSearch, placeholder, children }: { title: string; count: number; search: string; setSearch: (value: string) => void; placeholder: string; children: React.ReactNode }) {
  return <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border"><div className="shrink-0 border-b border-border p-3"><div className="flex items-center justify-between"><h3 className="text-sm font-black">{title}</h3><Count value={count} /></div><SearchInput value={search} onChange={setSearch} placeholder={placeholder} /></div><div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">{children}</div></section>
}
// eslint-disable-next-line no-unused-vars
export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div className="relative mt-3"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></div>
}
export function PickerRow({ selected, onClick, icon, title, description, disabled = false }: { selected: boolean; onClick: () => void; icon: React.ReactNode; title: string; description: string; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} aria-pressed={selected} className={cn('flex w-full items-center gap-3 rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50', selected ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-100' : 'border-border bg-card hover:border-foreground/30')}><span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', selected ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground')}>{selected ? <Check size={15} /> : icon}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-black">{title}</span><span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{description}</span></span></button>
}
export function StepNumber({ active, complete = false, children }: { active: boolean; complete?: boolean; children: React.ReactNode }) {
  return <span className={cn('flex h-6 w-6 items-center justify-center rounded-full border text-[10px]', (active || complete) ? 'border-black bg-black text-white' : 'border-border text-muted-foreground')}>{complete ? <Check size={12} /> : children}</span>
}
export function Count({ value }: { value: number }) { return <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-black text-muted-foreground">{value} selected</span> }
export function Loading() { return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted-foreground" size={20} /></div> }
export function Empty({ children }: { children: React.ReactNode }) { return <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">{children}</div> }
