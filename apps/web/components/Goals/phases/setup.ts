import type { Activity, Phase } from '@services/life/life'
import { tr } from '@/lib/tr'

/*
 * What makes a phase: where (and how you live there) and what you're doing. A phase is "set up" when
 * it has a place, a way of living, something it's about, a start, a budget and at least one goal.
 */

const LIVING_EN: [string, string][] = [
  ['family', 'With family'],
  ['own', 'My own place'],
  ['roommates', 'With roommates'],
  ['partner', 'With a partner'],
  ['dorm', 'In a dorm'],
  ['other', 'Something else'],
]
/** How you live, as [key, label]; the label is read in the current language each time. */
export const LIVING: [string, string][] = LIVING_EN.map(([key, en]) => {
  const row = [key, en] as [string, string]
  Object.defineProperty(row, 1, { get: () => tr(`phases.living.${key}`, en), enumerable: true })
  return row
})
export const livingLabel = (key?: string | null) => LIVING.find(([k]) => k === key)?.[1] || ''

export const KINDS: { key: Activity['kind']; title: string; hint: string }[] = [
  { key: 'learning', get title() { return tr('phases.kinds.learning', 'Learning') }, get hint() { return tr('phases.kinds.learning_hint', 'School, college, training') } },
  { key: 'working', get title() { return tr('phases.kinds.working', 'Working') }, get hint() { return tr('phases.kinds.working_hint', 'A job, an apprenticeship') } },
  { key: 'looking', get title() { return tr('phases.kinds.looking', 'Looking for work') }, get hint() { return tr('phases.kinds.looking_hint', 'Between jobs') } },
  { key: 'caring', get title() { return tr('phases.kinds.caring', 'Caring for family') }, get hint() { return tr('phases.kinds.caring_hint', 'Kids, parents') } },
  { key: 'gap', get title() { return tr('phases.kinds.gap', 'Gap or travel') }, get hint() { return tr('phases.kinds.gap_hint', 'Time off, exploring') } },
  { key: 'other', get title() { return tr('phases.kinds.other', 'Something else') }, get hint() { return tr('phases.kinds.other_hint', 'Recovering, volunteering…') } },
]
export const LEVELS: { key: string; title: string; short: string; college?: boolean }[] = [
  { key: 'middle', get title() { return tr('phases.levels.middle', 'Middle school') }, get short() { return tr('phases.levels.middle_short', 'Middle school') } },
  { key: 'high', get title() { return tr('phases.levels.high', 'High school') }, get short() { return tr('phases.levels.high_short', 'High school') } },
  { key: 'ged', get title() { return tr('phases.levels.ged', 'GED or adult classes') }, get short() { return tr('phases.levels.ged_short', 'GED') } },
  { key: 'trade', get title() { return tr('phases.levels.trade', 'Trade school or certificate') }, get short() { return tr('phases.levels.trade_short', 'Trade school') }, college: true },
  { key: 'cc', get title() { return tr('phases.levels.cc', 'Community college') }, get short() { return tr('phases.levels.cc_short', 'Community college') }, college: true },
  { key: 'uni', get title() { return tr('phases.levels.uni', 'College or university') }, get short() { return tr('phases.levels.uni_short', 'College') }, college: true },
  { key: 'grad', get title() { return tr('phases.levels.grad', 'Graduate school') }, get short() { return tr('phases.levels.grad_short', 'Graduate school') }, college: true },
]
export const levelOf = (key?: string | null) => LEVELS.find((l) => l.key === key)

const singular = (t: string) => t.split(/,| and /)[0].trim().replace(/s$/, '')

/** "Learning at Sheldon High School", "Electrician at Northwest Electric". */
export function activityText(a?: Activity | null): string {
  if (!a) return ''
  if (a.kind === 'learning') {
    const lv = levelOf(a.level)?.short || tr('phases.school', 'School')
    return a.school ? (a.school.toLowerCase().includes(lv.toLowerCase().split(' ')[0]) ? a.school : `${lv} · ${a.school}`) : a.schools?.length ? tr('phases.schools_in_mind', '{{level}} · {{count}} in mind', { level: lv, count: a.schools.length }) : a.field ? `${lv} · ${a.field}` : lv
  }
  if (a.kind === 'working') {
    const job = a.career_title ? singular(a.career_title) : tr('phases.kinds.working', 'Working')
    const role = a.apprentice ? tr('phases.apprentice', '{{job}} apprentice', { job }) : job
    return a.employer ? tr('phases.job_at', '{{job}} at {{employer}}', { job: role, employer: a.employer }) : role
  }
  return KINDS.find((k) => k.key === a.kind)?.title || ''
}

/** The name we suggest: what you're learning, else the job, else how you live, else where. */
export function suggestTitle(p: Pick<Phase, 'activities' | 'living' | 'place_label'>): string {
  const acts = p.activities || []
  const learn = acts.find((a) => a.kind === 'learning')
  if (learn) return levelOf(learn.level)?.short || tr('phases.school', 'School')
  const work = acts.find((a) => a.kind === 'working')
  if (work?.career_title) return work.apprentice ? tr('phases.apprentice', '{{job}} apprentice', { job: singular(work.career_title) }) : singular(work.career_title)
  if (acts[0]) return KINDS.find((k) => k.key === acts[0].kind)?.title || tr('phases.this_phase', 'This phase')
  if (p.living) return livingLabel(p.living)
  return p.place_label?.split(',')[0] || tr('phases.this_phase', 'This phase')
}
/** The old `kind` field (used for the drawn covers) from what the phase is about. */
export function kindFor(acts?: Activity[]): string {
  const a = acts?.[0]
  if (!a) return 'other'
  if (a.kind === 'learning') return levelOf(a.level)?.college ? 'study' : 'school'
  if (a.kind === 'working') return 'work'
  if (a.kind === 'caring') return 'family'
  if (a.kind === 'gap') return 'gap'
  return 'other'
}

export interface CheckItem { key: 'place' | 'living' | 'doing' | 'starts' | 'budget' | 'goals'; title: string; done: boolean }
/** The "fully defined" list for a phase. Budget counts; goals count. */
export function checklist(p: Phase, goals: number): CheckItem[] {
  return [
    { key: 'place', title: tr('phases.check.place', 'Where'), done: Boolean(p.place || p.places?.length) },
    { key: 'living', title: tr('phases.check.living', 'How you live'), done: Boolean(p.living) },
    { key: 'doing', title: tr('phases.check.doing', 'What you’re doing'), done: Boolean(p.activities?.length) },
    { key: 'starts', title: tr('phases.check.starts', 'When it starts'), done: Boolean(p.starts) && !p.undated },
    { key: 'budget', title: tr('phases.check.budget', 'A budget'), done: (p.lines || []).length > 0 },
    { key: 'goals', title: tr('phases.check.goals', 'A goal'), done: goals > 0 },
  ]
}
