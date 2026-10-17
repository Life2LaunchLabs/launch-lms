import type { Step } from '@services/goals/types'
import { stepDefinition } from '../steps'

const DAY = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const DAY_YEAR = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

export function shortDate(value?: string | null) {
  if (!value) return ''
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  return (date.getFullYear() === new Date().getFullYear() ? DAY : DAY_YEAR).format(date)
}

/** The sentence a locked step shows when it's opened. */
export function lockedSentence(step: Step) {
  const reason = step.locked_reason
  if (!reason) return ''
  if (reason.kind === 'opens') return `This opens on ${shortDate(reason.date)}.`
  if (reason.kind === 'after') return `Finish ${reason.title} first, then this opens.`
  if (reason.kind === 'stage') return reason.date ? `This opens when ${reason.title} starts on ${shortDate(reason.date)}.` : `This opens when the goal moves on to ${reason.title}.`
  return 'Someone helping with this goal has put this step on hold.'
}

/** One short line under a step's title: why it's closed, where it stands, or when it's due. */
export function statusLine(step: Step) {
  if (step.state === 'locked') {
    const reason = step.locked_reason
    if (reason?.kind === 'opens') return `Opens ${shortDate(reason.date)}`
    if (reason?.kind === 'after') return `After ${reason.title}`
    if (reason?.kind === 'stage') return reason.date ? `Opens ${shortDate(reason.date)}` : `Opens with ${reason.title}`
    return reason?.kind === 'held' ? 'On hold for now' : 'Not open yet'
  }
  if (step.state === 'done') return step.status === 'excused' ? 'Excused' : step.completed_at ? `Done ${shortDate(step.completed_at)}` : 'Done'
  if (step.state === 'waiting') return 'Waiting on review'
  if (step.state === 'retry') return 'Needs another go'
  const own = stepDefinition(step.type).statusLine?.(step as never)
  const due = step.due_date ? `Closes ${shortDate(step.due_date)}` : ''
  if (own) return due ? `${own} · ${due.toLowerCase()}` : own
  return due || 'Any time'
}
