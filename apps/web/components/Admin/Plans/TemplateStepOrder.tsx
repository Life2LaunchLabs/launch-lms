'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'
import { programsApi } from '@services/programs/programs'

const OPTIONS = [
  { value: 'any', label: 'Any order', hint: 'Learners can start every step any time.' },
  { value: 'in_order', label: 'In order', hint: 'Each step opens when the one before it is done.' },
  { value: 'by_chapter', label: 'Chapter by chapter', hint: 'A phase opens when the one before it is done.' },
]

/** Template setting copied onto every plan assigned from it: when learners can start steps. */
export default function TemplateStepOrder({ orgId, token, program, refresh }: { orgId: number; token?: string; program: any; refresh: () => Promise<unknown> }) {
  const [value, setValue] = React.useState(program.step_order || 'any')
  const [saving, setSaving] = React.useState(false)
  const change = async (next: string) => {
    setValue(next)
    setSaving(true)
    try { await programsApi.update(orgId, program.program_uuid, { step_order: next }, token); await refresh() } catch (error: any) { setValue(program.step_order || 'any'); toast.error(error?.message || 'Could not save when steps open.') } finally { setSaving(false) }
  }
  return <section className="rounded-xl border border-border bg-card p-6 shadow-xs">
    <h2 className="flex items-center gap-2 text-lg font-bold">When steps open{saving ? <Loader2 size={15} className="animate-spin text-muted-foreground" /> : null}</h2>
    <p className="mt-1 text-sm text-muted-foreground">Copied onto plans assigned from this template. Steps that aren't open yet show learners why.</p>
    <div className="mt-5 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="When steps open">
      {OPTIONS.map((option) => <button key={option.value} type="button" role="radio" aria-checked={value === option.value} disabled={saving} onClick={() => change(option.value)}
        className={`rounded-lg border p-3 text-left transition ${value === option.value ? 'border-foreground ring-1 ring-foreground' : 'border-border hover:border-foreground/40'}`}>
        <span className="block text-sm font-black">{option.label}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{option.hint}</span>
      </button>)}
    </div>
  </section>
}
