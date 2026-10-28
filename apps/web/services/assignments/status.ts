import type { AssignmentPerson, Needs, StatusCategory, StatusCounts } from './assignments'

/** The five places a learner can be on a step, in time order, so "now" falls between behind and open. */
export const CATEGORIES: Array<{ key: StatusCategory; label: string }> = [
  { key: 'done', label: 'Complete' },
  { key: 'review', label: 'Awaiting review' },
  { key: 'behind', label: 'Behind schedule' },
  { key: 'open', label: 'Open' },
  { key: 'locked', label: 'Not open yet' },
]

export const zeroCounts = (): StatusCounts => ({ done: 0, review: 0, behind: 0, open: 0, locked: 0 })

export const totalOf = (counts: StatusCounts) => CATEGORIES.reduce((sum, { key }) => sum + (counts[key] || 0), 0)

/** Where "now" sits along a bar, from 0 to 1, or null when everything is on one side of it. */
export function nowAt(counts: StatusCounts): number | null {
  const total = totalOf(counts)
  if (!total) return null
  const past = counts.done + counts.review + counts.behind
  return past > 0 && past < total ? past / total : null
}

/** One segment's hover tip: who is in it, or how many. */
export function segmentTip(label: string, count: number, names?: string[], unit?: string) {
  return names?.length ? `${label}: ${names.join(', ')}` : `${label}: ${count}${unit ? ` ${unit}` : ''}`
}

export const plural = (count: number, word: string, words = `${word}s`) => `${count} ${count === 1 ? word : words}`

export const needTotal = (needs: Needs) => needs.questions + needs.review + needs.behind

/** "2 questions · 3 to review · 1 past due", leaving out what's zero. */
export function needsText(needs: Needs) {
  return [needs.questions && plural(needs.questions, 'question'), needs.review && `${needs.review} to review`, needs.behind && `${needs.behind} past due`]
    .filter(Boolean).join(' · ')
}

/** A person's name: first and last, else their username. */
export function personLabel(person?: Pick<AssignmentPerson, 'username' | 'first_name' | 'last_name'> | null) {
  if (!person) return 'Former member'
  return [person.first_name, person.last_name].filter(Boolean).join(' ') || person.username
}

export const firstName = (person?: Pick<AssignmentPerson, 'username' | 'first_name' | 'last_name'> | null) => personLabel(person).split(' ')[0]

const day = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00`)
/** "Oct 23". */
export const shortDate = (value?: string | null) => value ? day(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''

/** A step's own dates and switches on an assignment's schedule. */
export interface StepDates { start_date?: string | null; due_date?: string | null; open_early?: boolean; allow_late?: boolean }

/** A schedule line's summary: "Oct 1 → Oct 9", "Stage start → Oct 9", or "Follows stage". */
export function scheduleSummary(dates: StepDates, event?: string | null) {
  if (event && !dates.due_date) return `Event ${shortDate(event)}`
  if (!dates.start_date && !dates.due_date) return 'Follows stage'
  return `${dates.start_date ? shortDate(dates.start_date) : 'Stage start'} → ${dates.due_date ? shortDate(dates.due_date) : 'stage end'}`
}

/** What a step's switches change from the defaults: "Locked until start · No late work". */
export function scheduleFlags(dates: StepDates) {
  return [dates.start_date && dates.open_early === false ? 'Locked until start' : '', dates.allow_late === false ? 'No late work' : ''].filter(Boolean).join(' · ')
}
