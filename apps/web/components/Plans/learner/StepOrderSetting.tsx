'use client'

import React from 'react'

const OPTIONS = [
  { value: 'any', label: 'Any order', hint: 'Every step can be started any time.' },
  { value: 'in_order', label: 'In order', hint: 'Each step opens when the one before it is done.' },
  { value: 'by_chapter', label: 'Chapter by chapter', hint: 'A chapter opens when the one before it is done, or on its start date.' },
]

/** Lets people who can edit a plan's structure choose when its steps open. */
// eslint-disable-next-line no-unused-vars
export default function StepOrderSetting({ detail, value, disabled, onChange }: { detail: any; value: string; disabled: boolean; onChange: (value: string) => void }) {
  if (!detail?.capabilities?.includes('edit_structure')) return null
  const current = OPTIONS.find((option) => option.value === value) || OPTIONS[0]
  return <div className="border-t border-border pt-4">
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground">When steps open</span>
      <select value={current.value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="mt-2 h-9 w-full rounded-lg border border-border bg-background px-2 text-xs font-black">
        {OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
    <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">{current.hint}</p>
  </div>
}
