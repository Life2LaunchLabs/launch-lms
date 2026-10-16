'use client'

import React from 'react'
import { Check } from 'lucide-react'

/** How a choice question draws its options: a lettered list (the default), pills, a sized scale, or cards with an icon and description. */
export type ChoiceStyle = 'list' | 'pills' | 'scale' | 'cards'

type Option = { id: string; text: string; icon?: string; description?: string }

const ring = 'border-[var(--org-primary-color)] ring-2 ring-[var(--org-primary-color)]'

export default function ChoiceOptions({ options, selected, multiple, style = 'list', onToggle }: {
  options: Option[]; selected: string[]; multiple: boolean; style?: ChoiceStyle
  // eslint-disable-next-line no-unused-vars
  onToggle: (id: string) => void
}) {
  const role = multiple ? 'checkbox' : 'radio'
  const item = (option: Option, index: number, className: string, body: React.ReactNode) => {
    const id = option.id || String(index)
    const on = selected.includes(id)
    return <button key={id} type="button" role={role} aria-checked={on} onClick={() => onToggle(id)} className={`${className} ${on ? ring : 'border-border hover:border-foreground/30'}`}>{body}</button>
  }
  const label = (option: Option, index: number) => option.text || `Option ${index + 1}`

  if (style === 'pills') {
    return <div role={multiple ? 'group' : 'radiogroup'} className="mt-6 flex flex-wrap gap-2.5">
      {options.map((option, index) => item(option, index, 'inline-flex min-h-11 items-center gap-2 rounded-full border bg-card px-5 py-2 text-sm font-semibold text-foreground shadow-sm transition',
        <>{option.icon ? <span aria-hidden="true">{option.icon}</span> : null}{label(option, index)}</>))}
    </div>
  }
  if (style === 'scale') {
    // Sized steps: each option a little larger than the one before, with the ends labelled.
    return <div className="mt-6">
      <div role={multiple ? 'group' : 'radiogroup'} className="flex items-end justify-between gap-2">
        {options.map((option, index) => item(option, index, 'flex flex-1 items-center justify-center rounded-xl border bg-card text-sm font-bold text-foreground shadow-sm transition',
          <span className="flex w-full items-center justify-center" style={{ height: 44 + index * (40 / Math.max(1, options.length - 1)) }} aria-label={label(option, index)}>{option.icon || index + 1}</span>))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>{options[0]?.text}</span><span>{options.at(-1)?.text}</span></div>
    </div>
  }
  if (style === 'cards') {
    return <div role={multiple ? 'group' : 'radiogroup'} className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {options.map((option, index) => item(option, index, 'relative flex flex-col items-start gap-2 rounded-2xl border bg-card p-4 text-left shadow-sm transition',
        <>
          {option.icon ? <span aria-hidden="true" className="text-2xl leading-none">{option.icon}</span> : null}
          <span className="font-semibold text-foreground">{label(option, index)}</span>
          {option.description ? <span className="text-sm text-muted-foreground">{option.description}</span> : null}
          {selected.includes(option.id || String(index)) ? <Check aria-hidden="true" size={16} className="absolute right-3 top-3 text-[var(--org-primary-color)]" /> : null}
        </>))}
    </div>
  }
  return <div role={multiple ? 'group' : 'radiogroup'} className="mt-6 space-y-3">
    {options.map((option, index) => {
      const on = selected.includes(option.id || String(index))
      return item(option, index, 'flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-left shadow-sm transition', <>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${on ? 'border-[var(--org-primary-color)] bg-[var(--org-primary-color)] text-white' : 'border-border text-muted-foreground'}`}>{String.fromCharCode(65 + index)}</span>
        <span className="min-w-0 flex-1 text-foreground">{label(option, index)}</span>
      </>)
    })}
  </div>
}
