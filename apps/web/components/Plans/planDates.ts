/** Shared date helpers for plan views and editors. */
export function dateValue(value?: string | null) { return value ? String(value).slice(0, 10) : '' }

export function isBeforeToday(value?: string) {
  if (!value) return false
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return new Date(`${dateValue(value)}T00:00:00`).getTime() < today.getTime()
}

export function targetDateLabel(value?: string | null) {
  if (!value) return ''
  const target = new Date(`${dateValue(value)}T12:00:00`)
  const today = new Date(); today.setHours(12, 0, 0, 0)
  const days = Math.round((target.getTime() - today.getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days > 0 && days <= 30) return `in ${days} day${days === 1 ? '' : 's'}`
  if (days < 0) return `${Math.abs(days)} day${days === -1 ? '' : 's'} ago`
  return target.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Inline inputs that look like text until focused. */
export const inlineEditableClass = 'border-b border-dashed border-foreground/35 bg-transparent outline-none transition-colors focus:border-foreground'
