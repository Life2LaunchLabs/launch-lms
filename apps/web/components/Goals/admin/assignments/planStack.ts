// Plans › Assignments: which plan cards and rows show under the tab's filters. Pure, so it runs under the unit tests.

import { isOn, matchesSearch, SEARCH_KEY, type FilterSpec, type FilterValues } from '@/lib/admin/filters'
import type { PlanAssignment, PlanCardData, PlansStack, StaffPerson } from '@services/goals/admin'
import { personName } from '../live/ui'
import { assignmentLabel } from './shared'

export type StatusFilter = 'current' | 'active' | 'paused' | 'ended' | 'all'

/** One card as shown: the rows that pass the filters, the other orgs running it, and how many ended rows are tucked away. */
export interface ShownPlan {
  plan: PlanCardData
  rows: PlanAssignment[]
  partners: PlanCardData['authorized_orgs']
  /** Ended assignments left out only because the status filter shows current ones ("Show them"). */
  endedHidden: number
  /** "Run by: Authorized orgs" leaves the org's own assignments out altogether. */
  onlyPartners: boolean
  /** Assignments of the plan here, whatever the filters. */
  total: number
}

export interface ShownStack { cards: ShownPlan[]; rows: number; hidden: number }

const byName = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label)

/** The tab's filters, from what the stack holds (groups, learners and staff on its assignments). */
export function planFilterSpecs(stack: PlansStack | undefined, { admin }: { admin: boolean }): FilterSpec[] {
  const assignments = (stack?.plans || []).flatMap((plan) => plan.assignments)
  const groups = new Map<string, string>()
  const staff = new Map<string, string>()
  for (const assignment of assignments) {
    if (assignment.cohort) groups.set(String(assignment.cohort.id), assignment.cohort.name)
    for (const person of assignment.staff) staff.set(String(person.id), personName(person))
  }
  const options = (entries: Map<string, string>) => [...entries].map(([value, label]) => ({ value, label })).sort(byName)
  const specs: FilterSpec[] = [{ key: 'status', label: 'Status', default: 'current', options: [
    { value: 'current', label: 'Active and paused' }, { value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' },
    { value: 'ended', label: 'Ended' }, { value: 'all', label: 'Any status' },
  ] }]
  if (admin && stack?.plans.some((plan) => plan.authorized_orgs.length)) {
    specs.push({ key: 'scope', label: 'Run by', options: [{ value: '', label: 'Anyone' }, { value: 'own', label: 'Your org' }, { value: 'orgs', label: 'Authorized orgs' }] })
  }
  specs.push({ key: 'group', label: 'Group', options: [{ value: '', label: 'Any group' }, ...options(groups)] })
  specs.push({ key: 'learner', label: 'Learner', options: [{ value: '', label: 'Any learner' },
    ...(stack?.learners || []).map((person) => ({ value: String(person.id), label: personName(person) })).sort(byName)] })
  if (admin) specs.push({ key: 'staff', label: 'Staff', options: [{ value: '', label: 'Any staff' }, ...options(staff)] })
  specs.push({ key: 'badge', label: 'Earns a badge', bool: true }, { key: 'req', label: 'Has requirements', bool: true })
  return specs
}

function statusMatches(status: string, filter: string) {
  if (filter === 'all') return true
  if (filter === 'active' || filter === 'paused' || filter === 'ended') return status === filter
  return status !== 'ended'
}

/** Current assignments first, then ended ones; newest first within each (as the API sends them). */
const currentFirst = (rows: PlanAssignment[]) => [...rows.filter((row) => row.status !== 'ended'), ...rows.filter((row) => row.status === 'ended')]

/**
 * The cards under the filters. A plan whose title, badge or framework matches the search shows all its rows;
 * otherwise only the rows whose assignee or learners match. A card with nothing left to show is hidden
 * once a row filter or the search is applied; a plan nobody has been handed yet still shows, to Assign.
 */
export function shownPlans(stack: PlansStack | undefined, values: FilterValues, { admin }: { admin: boolean }): ShownStack {
  const status = values.status || 'current'
  const scope = values.scope || ''
  const query = (values[SEARCH_KEY] || '').trim()
  const names = new Map<number, string>((stack?.learners || []).map((person: StaffPerson) => [person.id, personName(person)]))
  const rowFilter = Boolean(values.group || values.learner || values.staff || scope)
  const cards: ShownPlan[] = []
  let rowsShown = 0
  let hidden = 0
  for (const plan of stack?.plans || []) {
    if ((isOn(values, 'badge') && !plan.badges.length) || (isOn(values, 'req') && !plan.frameworks.length)) { hidden++; continue }
    const all = plan.assignments
    const planHit = !query || matchesSearch(query, plan.template.title, ...plan.badges.map((badge) => badge.name), ...plan.frameworks.map((framework) => framework.name))
    let rows = scope === 'orgs' ? [] : all.filter((row) => statusMatches(row.status, status)
      && (!values.group || String(row.cohort?.id ?? '') === values.group)
      && (!values.learner || row.learner_ids.map(String).includes(values.learner))
      && (!values.staff || row.staff.some((person) => String(person.id) === values.staff)))
    const partnersShown = admin && scope !== 'own' && !values.group && !values.learner && !values.staff && status !== 'ended' && status !== 'paused'
    let partners = partnersShown ? plan.authorized_orgs : []
    if (!planHit) {
      rows = rows.filter((row) => matchesSearch(query, assignmentLabel(row), ...row.learner_ids.map((id) => names.get(id))))
      partners = partners.filter((item) => matchesSearch(query, item.org?.name))
    }
    if (!rows.length && !partners.length && (rowFilter || !planHit || (all.length && status !== 'current'))) { hidden++; continue }
    const endedHidden = scope === 'orgs' || status !== 'current' ? 0 : all.filter((row) => row.status === 'ended' && !rows.includes(row)).length
    rowsShown += rows.length
    cards.push({ plan, rows: currentFirst(rows), partners, endedHidden, total: all.length, onlyPartners: scope === 'orgs' })
  }
  return { cards, rows: rowsShown, hidden }
}

/** "4 plans · 7 assignments · 1 plan hidden by filters". */
export function stackSummary(shown: ShownStack) {
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`
  return [plural(shown.cards.length, 'plan'), plural(shown.rows, 'assignment'), shown.hidden ? `${plural(shown.hidden, 'plan')} hidden by filters` : ''].filter(Boolean).join(' · ')
}
