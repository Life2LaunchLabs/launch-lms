import type { LifeDoc } from '@services/life/life'
import { tr } from '@/lib/tr'
import { addAfter, byId, kids, mi, thisMonthIndex, type RouteStep } from './graph'

export type { RouteStep }

const starts = (p: { starts?: string | null }) => (p.starts ? mi(p.starts) : 0)

/* ---------- careers: the usual ways in, added as ideas ---------- */

export interface CareerLike { code: string; title: string; job_zone?: number | null }

export interface CareerRoute { common?: boolean; why?: string; steps: RouteStep[] }

const plural = (t: string) => t.replace(/s$/, '')
/** "Electrician" from O*NET's "Electricians"; drops "and ..." tails so names stay short. */
export const careerName = (title: string) => plural(title.split(/,| and /)[0].trim())

/**
 * The routes people usually take into a career, from its O*NET job zone. The trades (SOC 47, 49 and
 * 51) start with an apprenticeship. The last step is working in the career, linked to it by code.
 * Shared with the career explorer, so both offer the same routes.
 */
export function routesFor(career: CareerLike): CareerRoute[] {
  const name = careerName(career.title), jz = career.job_zone || 3
  const job: RouteStep = { title: name, years: 3, activities: [{ kind: 'working', career: career.code, career_title: career.title }], living: 'roommates' }
  const school = (title: string, years: number, level: string): RouteStep => ({ title, years, living: level === 'uni' || level === 'grad' ? 'dorm' : 'family', activities: [{ kind: 'learning', level, schools: [] }] })
  if (jz >= 5) return [{ common: true, steps: [school(tr('lit.graph.college', 'College'), 4, 'uni'), school(tr('lit.graph.graduate_school', 'Graduate school'), 2, 'grad'), job] }]
  if (jz === 4) return [
    { common: true, steps: [school(tr('lit.graph.college', 'College'), 4, 'uni'), job] },
    { why: tr('goals.graph.cheaper_first_two_years_then', 'Cheaper first two years, then transfer'), steps: [school(tr('lit.graph.community_college', 'Community college'), 2, 'cc'), school(tr('lit.graph.university', 'University'), 2, 'uni'), job] },
  ]
  if (jz === 3) {
    if (/^(47|49|51)/.test(career.code)) return [
      { common: true, steps: [{ title: `${name} apprentice`, years: 4, living: 'family', activities: [{ kind: 'working', career: career.code, career_title: career.title, apprentice: true }] }, job] },
      { steps: [school(tr('lit.graph.trade_school', 'Trade school'), 1, 'trade'), job] },
    ]
    return [
      { common: true, why: tr('goals.graph.a_short_program_at_a', 'A short program at a community college or training center'), steps: [school(tr('lit.graph.certificate_program', 'Certificate program'), 1, 'trade'), job] },
      { why: tr('goals.graph.an_associate_degree_which_can', 'An associate degree, which can also count toward a 4-year degree later'), steps: [school('2-year degree', 2, 'cc'), job] },
      { why: tr('goals.graph.some_people_start_in_a', 'Some people start in a related job'), steps: [{ title: tr('goals.graph.entry_job', 'Entry job'), years: 2, living: 'roommates', activities: [{ kind: 'working' }] }, job] },
    ]
  }
  return [
    { common: true, why: tr('goals.graph.most_learn_on_the_job', 'Most learn on the job'), steps: [job] },
    { steps: [school(tr('lit.graph.short_training_program', 'Short training program'), 1, 'trade'), job] },
  ]
}

/**
 * Add a route's steps after a phase as dashed ideas, one after another. If something already comes
 * after that phase, the route is a new option beside it.
 */
export function addRoute(doc: LifeDoc, afterId: string, steps: RouteStep[], start?: number): { doc: LifeDoc; ids: string[] } {
  let next = doc, from = afterId
  const ids: string[] = []
  const after = byId(doc, afterId)
  const k = after ? kids(doc, afterId) : []
  let at = start ?? (after ? (k.length ? starts(k[0]) : Math.max(thisMonthIndex() + 1, starts(after) + Math.max(1, after.months || 12))) : thisMonthIndex() + 1)
  for (const s of steps) {
    const r = addAfter(next, from, { title: s.title, activities: s.activities, living: s.living, months: Math.round((s.years || 3) * 12) }, at)
    next = r.doc; from = r.id; ids.push(r.id)
    at += Math.round((s.years || 3) * 12)
  }
  return { doc: next, ids }
}
