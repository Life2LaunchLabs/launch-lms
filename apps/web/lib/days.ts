/**
 * "Today", "yesterday" and "N days ago" counted in the viewer's own calendar days (DEV-205). A timestamp without
 * an offset is the API's UTC time; a bare date (YYYY-MM-DD) is a calendar day and stays that day.
 */

function parse(value: string): Date {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (day) return new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]))
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`)
}

/** Whole calendar days between the value and now, in the viewer's time zone; never negative. */
export function calendarDaysAgo(value: string, now: Date = new Date()): number {
  const then = parse(value)
  const dayOf = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.max(0, Math.round((dayOf(now) - dayOf(then)) / 86400000))
}

export function daysAgoLabel(value: string, now: Date = new Date()): string {
  const days = calendarDaysAgo(value, now)
  return days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
}
