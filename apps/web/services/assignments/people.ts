import type { AssignmentLearner } from './assignments'
import { personLabel } from './status'

export type PeopleFilter = 'all' | 'needs' | 'questions' | 'review' | 'behind'
export type PeopleSort = 'az' | 'za' | 'most' | 'least'

export const SORTS: Array<{ value: PeopleSort; label: string }> = [
  { value: 'az', label: 'Name, A to Z' },
  { value: 'za', label: 'Name, Z to A' },
  { value: 'most', label: 'Most complete' },
  { value: 'least', label: 'Least complete' },
]

const nameOf = (row: AssignmentLearner) => row.person ? personLabel(row.person) : row.email || ''

/** Learners who have joined, filtered to what needs staff and sorted; ties on progress go to who has more to review. */
export function shownLearners(rows: AssignmentLearner[], filter: PeopleFilter, sort: PeopleSort) {
  const joined = rows.filter((row) => row.person)
  const kept = filter === 'all' ? joined : joined.filter((row) => filter === 'needs'
    ? row.needs.questions + row.needs.review + row.needs.behind > 0 : row.needs[filter] > 0)
  const byName = (a: AssignmentLearner, b: AssignmentLearner) => nameOf(a).localeCompare(nameOf(b))
  const byProgress = (a: AssignmentLearner, b: AssignmentLearner) => (b.counts.done - a.counts.done) || (b.counts.review - a.counts.review) || byName(a, b)
  const order = { az: byName, za: (a: AssignmentLearner, b: AssignmentLearner) => byName(b, a), most: byProgress, least: (a: AssignmentLearner, b: AssignmentLearner) => byProgress(b, a) }[sort]
  return [...kept].sort(order)
}

/** Invitations nobody has taken up yet. */
export const invitedRows = (rows: AssignmentLearner[]) => rows.filter((row) => !row.person)
