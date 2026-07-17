'use client'

import { useMemo, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'

export type CategorizedOption = { id: string; text: string; category?: string }

export const PORTFOLIO_VALUES: CategorizedOption[] = [
  ['Personal Qualities', ['Authenticity', 'Creativity', 'Mindfulness', 'Responsibility', 'Self-discipline']],
  ['Relationships', ['Kindness', 'Empathy', 'Loyalty', 'Respect', 'Trust']],
  ['Growth', ['Curiosity', 'Learning', 'Courage', 'Resilience', 'Reflection']],
  ['Impact', ['Service', 'Leadership', 'Justice', 'Community', 'Stewardship']],
].flatMap(([category, items]) => (items as string[]).map((text) => ({ id: text.toLowerCase().replace(/\W+/g, '-'), text, category: category as string })))

export const PORTFOLIO_STRENGTHS: CategorizedOption[] = [
  ['Thinking', ['Analysis', 'Strategy', 'Problem solving', 'Systems thinking', 'Decision making']],
  ['Creating', ['Storytelling', 'Design sense', 'Experimentation', 'Originality', 'Making ideas real']],
  ['Working With Others', ['Collaboration', 'Facilitation', 'Mentoring', 'Listening', 'Conflict navigation']],
  ['Execution', ['Focus', 'Follow-through', 'Organization', 'Adaptability', 'Initiative']],
].flatMap(([category, items]) => (items as string[]).map((text) => ({ id: text.toLowerCase().replace(/\W+/g, '-'), text, category: category as string })))

export function CategorizedMultiSelect({ options, customOptions = [], value, onChange, onCustomOptionsChange, min = 0, max, disabled = false }: { options: CategorizedOption[]; customOptions?: CategorizedOption[]; value: string[]; onChange: (value: string[]) => void; onCustomOptionsChange?: (options: CategorizedOption[]) => void; min?: number; max?: number; disabled?: boolean }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const allOptions = useMemo(() => [...options, ...customOptions], [options, customOptions])
  const selected = useMemo(() => new Set(value), [value])
  const groups = useMemo(() => Object.entries(options.reduce<Record<string, CategorizedOption[]>>((all, option) => { (all[option.category || 'Options'] ||= []).push(option); return all }, {})), [options])
  const toggle = (id: string) => {
    if (disabled) return
    if (selected.has(id)) onChange(value.filter((item) => item !== id))
    else if (max === undefined || value.length < max) onChange([...value, id])
  }
  const finishCustom = () => {
    const text = draft.trim().replace(/\s+/g, ' ').slice(0, 80)
    if (!text) { setAdding(false); setDraft(''); return }
    const duplicate = allOptions.find((option) => option.text.toLocaleLowerCase() === text.toLocaleLowerCase())
    const id = duplicate?.id || text
    if (!selected.has(id) && (max === undefined || value.length < max)) onChange([...value, id])
    if (!duplicate) onCustomOptionsChange?.([...customOptions, { id, text, category: 'Your own' }])
    setAdding(false); setDraft('')
  }
  const removeCustom = (id: string) => {
    onChange(value.filter((item) => item !== id))
    onCustomOptionsChange?.(customOptions.filter((option) => option.id !== id))
  }
  return <div className="space-y-5">
    {groups.map(([category, items]) => <fieldset key={category}><legend className="mb-2 text-sm font-bold text-foreground">{category}</legend><div className="flex flex-wrap gap-2">{items.map((option) => { const active = selected.has(option.id); return <button key={option.id} type="button" aria-pressed={active} disabled={disabled || (!active && max !== undefined && value.length >= max)} onClick={() => toggle(option.id)} className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-semibold transition ${active ? 'border-foreground bg-foreground text-background' : 'border-border bg-muted text-muted-foreground hover:bg-card'} disabled:cursor-not-allowed disabled:opacity-45`}>{option.text}</button> })}</div></fieldset>)}
    {!disabled && <fieldset><legend className="mb-2 text-sm font-bold text-foreground">Your own</legend><div className="flex flex-wrap items-center gap-2">{customOptions.map((option) => { const active = selected.has(option.id); return <span key={option.id} className={`inline-flex items-center overflow-hidden rounded-full border text-sm font-semibold ${active ? 'border-foreground bg-foreground text-background' : 'border-border bg-muted text-muted-foreground'}`}><button type="button" aria-pressed={active} disabled={!active && max !== undefined && value.length >= max} onClick={() => toggle(option.id)} className="inline-flex items-center py-1.5 pl-3 pr-1">{option.text}</button><button type="button" aria-label={`Remove ${option.text}`} onClick={() => removeCustom(option.id)} className="py-1.5 pl-1 pr-2 opacity-75 hover:opacity-100"><X className="h-3.5 w-3.5" /></button></span> })}{adding ? <span className="inline-flex items-center rounded-full border border-foreground bg-card px-3 py-1.5"><input ref={inputRef} autoFocus value={draft} maxLength={80} aria-label="Custom option" placeholder="Type your own…" onChange={(event) => setDraft(event.target.value)} onBlur={finishCustom} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); finishCustom() } else if (event.key === 'Escape') { setAdding(false); setDraft('') } }} className="w-36 bg-transparent text-sm font-semibold outline-none" /></span> : <button type="button" aria-label="Add a custom option" disabled={max !== undefined && value.length >= max} onClick={() => { setAdding(true); queueMicrotask(() => inputRef.current?.focus()) }} className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground transition hover:border-foreground hover:text-foreground disabled:opacity-40"><Plus className="h-4 w-4" /></button>}</div></fieldset>}
    <p className="text-xs font-semibold text-muted-foreground" aria-live="polite">{value.length} selected{value.length < min ? ` · choose at least ${min}` : ''}</p>
  </div>
}
