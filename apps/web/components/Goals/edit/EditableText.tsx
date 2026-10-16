'use client'

import React from 'react'
import { cn } from '@/lib/utils'

type Props = {
  value: string
  // eslint-disable-next-line no-unused-vars
  onSave: (value: string) => Promise<unknown> | void
  label: string
  placeholder?: string
  multiline?: boolean
  /** An empty value goes back to what was saved instead of saving. */
  required?: boolean
  autoFocus?: boolean
  disabled?: boolean
  className?: string
}

/**
 * Text that is a field while the goal is being edited: it saves when the learner leaves it or
 * presses Enter, and Escape puts back what was saved. No Save button.
 */
export default function EditableText({ value, onSave, label, placeholder, multiline = false, required = false, autoFocus = false, disabled = false, className }: Props) {
  const [draft, setDraft] = React.useState(value)
  const reverting = React.useRef(false)
  React.useEffect(() => setDraft(value), [value])

  const commit = () => {
    if (reverting.current) { reverting.current = false; return }
    const next = draft.trim()
    if (next === value.trim()) return
    if (required && !next) { setDraft(value); return }
    void Promise.resolve(onSave(next)).catch(() => setDraft(value))
  }
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === 'Escape') { reverting.current = true; setDraft(value); event.currentTarget.blur() }
    if (event.key === 'Enter' && (!multiline || !event.shiftKey)) { event.preventDefault(); event.currentTarget.blur() }
  }
  const look = cn('-mx-1 w-full min-w-0 rounded-md border-b border-current/15 bg-transparent px-1 outline-none transition placeholder:text-current placeholder:opacity-45 hover:bg-current/[0.04] focus:border-current/50 focus:bg-current/[0.06]', className)
  const shared = {
    'aria-label': label, placeholder, value: draft, disabled, autoFocus,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.target.value),
    onBlur: commit, onKeyDown,
    onFocus: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { if (autoFocus) event.target.select() },
  }
  return multiline ? <textarea rows={2} {...shared} className={cn(look, 'resize-none [field-sizing:content]')} /> : <input {...shared} className={look} />
}
