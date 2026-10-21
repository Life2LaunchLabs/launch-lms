import type { RoutineAction, RoutineConfig } from './types'

/**
 * The words a routine is read in: its cadence ("Monday, Wednesday and Friday"), what each
 * time asks for ("Add 3 job openings") and how a trigger is named. Weekdays run 0 (Sunday) to
 * 6, as the routine stores them.
 */
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function ordinal(day: number) {
  const tens = day % 100
  if (tens >= 11 && tens <= 13) return `${day}th`
  return `${day}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] || 'th'}`
}

export function listWords(words: string[]) {
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

export function plural(word: string, count: number) {
  if (count === 1 || !word) return word
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`
  return `${word}s`
}

/** When it comes round, as a person would say it. */
export function cadenceText(config: Pick<RoutineConfig, 'cadence' | 'days'>) {
  const days = [...new Set(config.days || [])].sort((a, b) => a - b)
  if (config.cadence === 'daily') return 'Every day'
  if (config.cadence === 'monthly') {
    const named = days.length ? days : [1]
    return `The ${listWords(named.map(ordinal))} of every month`
  }
  if (days.length === 7) return 'Every day'
  if (days.join() === '1,2,3,4,5') return 'Every weekday'
  if (days.join() === '0,6') return 'Every weekend'
  if (days.length === 1) return `Every ${WEEKDAYS[days[0]]}`
  // Monday first reads more naturally than Sunday first.
  const ordered = [...days.filter((day) => day !== 0), ...days.filter((day) => day === 0)]
  return listWords(ordered.map((day) => WEEKDAYS[day]))
}

/** What each time asks for. */
export function actionText(action: RoutineAction) {
  const label = (action.label || '').trim()
  if (action.kind === 'number') return label ? `Log ${label.toLowerCase()}` : 'Log a number'
  if (action.kind === 'check') return label || 'Do it'
  const target = action.target || 1
  return `Add ${target} ${plural(label || 'item', target)}`
}

/** How far the current time has got, in the action's own words. */
export function progressText(action: RoutineAction, done: number, wanted: number) {
  if (action.kind === 'check') return done ? 'Done' : 'Not done yet'
  if (action.kind === 'number') return wanted > 1 ? `${done} of ${wanted} logged` : done ? 'Logged' : 'Not logged yet'
  return `${done} of ${wanted} added`
}

export function localToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
