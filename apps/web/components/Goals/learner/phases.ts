import type { LifeDoc } from '@services/life/life'

// Goals live in the phases of the learner's life plan. A goal filed in no phase belongs to the
// phase they're in now (or the first one, before the plan starts). Without a plan, every goal
// sits in one group.

export type PhaseWhen = 'done' | 'now' | 'next' | 'later'
export type PhaseGroup<T> = { id: string | null; title: string; when: PhaseWhen | null; starts?: string; goals: T[] }
export type PhaseTime = { phase: NonNullable<LifeDoc['phases']>[number]; index: number; when: PhaseWhen; starts: string; ends: string }

const monthIndex = (value: string) => { const [year, month] = value.split('-').map(Number); return year * 12 + month - 1 }
const monthLabel = (index: number) => `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`

/** The plan's phases in order, each with when it is relative to this month. */
export function phaseTimes(doc: LifeDoc | null | undefined, today = new Date()): PhaseTime[] {
  if (!doc?.phases?.length || !doc.start) return []
  const current = today.getFullYear() * 12 + today.getMonth()
  const begins: number[] = []
  let month = monthIndex(doc.start)
  for (const phase of doc.phases) { begins.push(month); month += Math.max(1, phase.months || 1) }
  const last = doc.phases.length - 1
  // Past the plan's end, the last phase stays the one they're in.
  let nowIndex = begins.findIndex((start, index) => start <= current && current < (begins[index + 1] ?? month))
  if (nowIndex < 0 && month <= current) nowIndex = last
  const nextIndex = begins.findIndex((start) => start > current)
  return doc.phases.map((phase, index) => {
    const when: PhaseWhen = index === nowIndex ? 'now' : index === nextIndex ? 'next' : begins[index] > current ? 'later' : 'done'
    return { phase, index, when, starts: monthLabel(begins[index]), ends: monthLabel((begins[index + 1] ?? month) - 1) }
  })
}

/** Where goals without a phase go: the phase now, or the first one still to come. */
export function homePhaseId(doc: LifeDoc | null | undefined, today = new Date()): string | null {
  const times = phaseTimes(doc, today)
  return (times.find((item) => item.when === 'now') || times.find((item) => item.when === 'next') || times[0])?.phase.id || null
}

/** The phase a goal is in. */
export function phaseOfGoal(doc: LifeDoc | null | undefined, goalUuid: string, today = new Date()): string | null {
  return doc?.phases?.find((phase) => phase.goals?.includes(goalUuid))?.id || homePhaseId(doc, today)
}

/** Goals grouped by phase, in plan order. Past phases show only when they still hold goals. */
export function groupByPhase<T extends { goal_uuid: string }>(doc: LifeDoc | null | undefined, goals: T[], today = new Date()): PhaseGroup<T>[] {
  const times = phaseTimes(doc, today)
  if (!times.length) return [{ id: null, title: 'Your goals', when: null, goals }]
  return times
    .map(({ phase, when, starts }) => ({ id: phase.id, title: phase.title, when, starts, goals: goals.filter((goal) => phaseOfGoal(doc, goal.goal_uuid, today) === phase.id) }))
    .filter((group) => group.when !== 'done' || group.goals.length)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "Sep 2026" from "2026-09". */
export const monthName = (value: string) => { const [year, month] = value.split('-').map(Number); return `${MONTHS[month - 1]} ${year}` }
/** A phase's span in years for its card: "2026–2029", or "2026" when it starts and ends in one year. */
export const phaseYears = (time: Pick<PhaseTime, 'starts' | 'ends'>) => {
  const a = time.starts.slice(0, 4), b = time.ends.slice(0, 4)
  return a === b ? a : `${a}–${b}`
}
