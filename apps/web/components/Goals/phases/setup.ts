/* eslint-disable no-unused-vars -- parameter names in function types */
import type { Activity, Line, Phase } from '@services/life/life'
import { uid } from '@components/LifePlan/model'

/*
 * What makes a phase: where (and how you live there) and what you're doing. A phase is "set up" when
 * it has a place, a way of living, something it's about, a start, a budget and at least one goal.
 */

export const LIVING: [string, string][] = [
  ['family', 'With family'],
  ['own', 'My own place'],
  ['roommates', 'With roommates'],
  ['partner', 'With a partner'],
  ['dorm', 'In a dorm'],
  ['other', 'Something else'],
]
export const livingLabel = (key?: string | null) => LIVING.find(([k]) => k === key)?.[1] || ''

export const KINDS: { key: Activity['kind']; title: string; hint: string }[] = [
  { key: 'learning', title: 'Learning', hint: 'School, college, training' },
  { key: 'working', title: 'Working', hint: 'A job, an apprenticeship' },
  { key: 'looking', title: 'Looking for work', hint: 'Between jobs' },
  { key: 'caring', title: 'Caring for family', hint: 'Kids, parents' },
  { key: 'gap', title: 'Gap or travel', hint: 'Time off, exploring' },
  { key: 'other', title: 'Something else', hint: 'Recovering, volunteering…' },
]
export const LEVELS: { key: string; title: string; short: string; college?: boolean }[] = [
  { key: 'middle', title: 'Middle school', short: 'Middle school' },
  { key: 'high', title: 'High school', short: 'High school' },
  { key: 'ged', title: 'GED or adult classes', short: 'GED' },
  { key: 'trade', title: 'Trade school or certificate', short: 'Trade school', college: true },
  { key: 'cc', title: 'Community college', short: 'Community college', college: true },
  { key: 'uni', title: 'College or university', short: 'College', college: true },
  { key: 'grad', title: 'Graduate school', short: 'Graduate school', college: true },
]
export const levelOf = (key?: string | null) => LEVELS.find((l) => l.key === key)

const singular = (t: string) => t.split(/,| and /)[0].trim().replace(/s$/, '')

/** "Learning at Sheldon High School", "Electrician at Northwest Electric". */
export function activityText(a?: Activity | null): string {
  if (!a) return ''
  if (a.kind === 'learning') {
    const lv = levelOf(a.level)?.short || 'School'
    return a.school ? (a.school.toLowerCase().includes(lv.toLowerCase().split(' ')[0]) ? a.school : `${lv} · ${a.school}`) : a.schools?.length ? `${lv} · ${a.schools.length} in mind` : a.field ? `${lv} · ${a.field}` : lv
  }
  if (a.kind === 'working') {
    const job = a.career_title ? singular(a.career_title) : 'Working'
    return `${a.apprentice ? `${job} apprentice` : job}${a.employer ? ` at ${a.employer}` : ''}`
  }
  return KINDS.find((k) => k.key === a.kind)?.title || ''
}

/** The name we suggest: what you're learning, else the job, else how you live, else where. */
export function suggestTitle(p: Pick<Phase, 'activities' | 'living' | 'place_label'>): string {
  const acts = p.activities || []
  const learn = acts.find((a) => a.kind === 'learning')
  if (learn) return levelOf(learn.level)?.short || 'School'
  const work = acts.find((a) => a.kind === 'working')
  if (work?.career_title) return work.apprentice ? `${singular(work.career_title)} apprentice` : singular(work.career_title)
  if (acts[0]) return KINDS.find((k) => k.key === acts[0].kind)?.title || 'This phase'
  if (p.living) return livingLabel(p.living)
  return p.place_label?.split(',')[0] || 'This phase'
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

/**
 * Starting budget lines from what the phase is: pay for each job (its estimate comes from BLS for the
 * place), rent or a dorm or living with family, and food. Lines already there are kept; nothing is
 * added twice.
 */
export function seedLines(p: Phase): Line[] {
  const lines = [...(p.lines || [])]
  const has = (item: string, f?: (l: Line) => boolean) => lines.some((l) => l.item === item && (!f || f(l)))
  for (const a of p.activities || []) {
    const soc = a.career?.slice(0, 7)
    if (a.kind === 'working' && soc && !a.apprentice && !has('job', (l) => l.settings?.soc === soc)) {
      lines.push({ id: uid('l'), cat: 'work', item: 'job', title: a.employer ? `Pay at ${a.employer}` : `Pay as ${singular(a.career_title || 'a worker').toLowerCase()}`, side: 'in', settings: { soc }, hours: 40, start: 0 })
    }
  }
  if (p.living === 'family' && !has('family_home')) lines.push({ id: uid('l'), cat: 'home', item: 'family_home', title: 'Living with family', side: 'out', settings: {}, start: 0, own: { unit: 'mo', value: 0 } })
  if (p.living === 'dorm' && !has('dorm')) lines.push({ id: uid('l'), cat: 'home', item: 'dorm', title: 'Dorm', side: 'out', settings: {}, start: 0 })
  if ((p.living === 'own' || p.living === 'roommates' || p.living === 'partner') && !has('rent')) {
    lines.push({ id: uid('l'), cat: 'home', item: 'rent', title: 'Rent', side: 'out', settings: { bedrooms: p.living === 'own' ? 1 : 2, share: p.living === 'own' ? 1 : 2 }, start: 0 })
  }
  return lines
}

export interface CheckItem { key: 'place' | 'living' | 'doing' | 'starts' | 'budget' | 'goals'; title: string; done: boolean }
/** The "fully defined" list for a phase. Budget counts; goals count. */
export function checklist(p: Phase, goals: number): CheckItem[] {
  return [
    { key: 'place', title: 'Where', done: Boolean(p.place || p.places?.length) },
    { key: 'living', title: 'How you live', done: Boolean(p.living) },
    { key: 'doing', title: 'What you’re doing', done: Boolean(p.activities?.length) },
    { key: 'starts', title: 'When it starts', done: Boolean(p.starts) },
    { key: 'budget', title: 'A budget', done: (p.lines || []).length > 0 },
    { key: 'goals', title: 'A goal', done: goals > 0 },
  ]
}
