import type { AssignmentListItem, AssignmentPlan } from './assignments'
import { needTotal, plural, shortDate } from './status'

export interface ListFilter { query: string; ended: boolean; needsMe: boolean }

const today = () => new Date().toISOString().slice(0, 10)

/** Who and where, under the name: "18 learners · Stage 2: Explore careers", "Self-paced", "Paused". */
export function rowSubtitle(item: AssignmentListItem, now = today()) {
  if (item.status === 'ended') return `Ended · ${plural(item.learner_count, 'learner')}`
  if (!item.learner_count) return 'Invite sent · hasn’t joined yet'
  const bits = [item.target.type === 'group' ? plural(item.learner_count, 'learner') : '']
  if (item.status === 'paused') bits.push('Paused')
  else if (item.scheduled && item.start_date && item.start_date.slice(0, 10) > now) bits.push('Not started')
  else if (item.stage && item.stage.of > 1) bits.push(`Stage ${item.stage.position + 1}: ${item.stage.title}`)
  else if (!item.scheduled) bits.push('Self-paced')
  return bits.filter(Boolean).join(' · ')
}

/** The callouts under a row's bar: start and end, or when a self-paced one started and its end, if any. */
export function rowDates(item: AssignmentListItem): [string, string] {
  if (item.scheduled) return [shortDate(item.start_date), item.due_date ? shortDate(item.due_date) : 'No end date']
  return [`Started ${shortDate(item.start_date || item.creation_date)}`, item.due_date ? shortDate(item.due_date) : 'No end date']
}

/** The rows a filter keeps: running or ended, matching the search, and (for Needs me) with something waiting. */
export function filterRows(items: AssignmentListItem[], filter: ListFilter) {
  const query = filter.query.trim().toLowerCase()
  return items.filter((item) => (item.status === 'ended') === filter.ended
    && (!query || `${item.target.name || ''} ${item.plan.title}`.toLowerCase().includes(query))
    && (!filter.needsMe || needTotal(item.needs) > 0))
}

/** Rows under their plan, plans in the order their newest assignment came. */
export function byPlan(items: AssignmentListItem[]) {
  const groups = new Map<string, { plan: AssignmentPlan; rows: AssignmentListItem[] }>()
  for (const item of items) {
    const group = groups.get(item.plan.template_uuid) || { plan: item.plan, rows: [] }
    group.rows.push(item)
    groups.set(item.plan.template_uuid, group)
  }
  return [...groups.values()]
}
