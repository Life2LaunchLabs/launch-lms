import type { Shell } from '../portfolioTypes'
import { skillsOf } from './resultTemplates'

// Progress on the portfolio is three quests, each unlocking a real action: sharing, then the résumé,
// then the mastery badge by the learner's name. Everything is worked out from the portfolio itself;
// the API only keeps which unlocks the learner has seen, so an unlock never goes away again.

/** Where a quest item is done on the front page. The page outlines that spot with the item's instruction. */
export type Spot = 'avatar' | 'about' | 'links' | 'experience' | 'projects' | 'credentials' | 'results' | 'headed' | 'people' | 'settings' | 'name'
export type QuestItem = { key: string; label: string; detail?: string; done: boolean; have?: number; need?: number; spot: Spot }
export type Quest = { n: 1 | 2 | 3; title: string; why: string; items: QuestItem[]; done: number; total: number; complete: boolean }
/** working: items left on quest n. unlocked: quest n is finished and its unlock moment hasn't been seen. mastered: all done. */
export type Stage = { kind: 'working' | 'unlocked'; quest: Quest } | { kind: 'mastered' }

const TITLES = { 1: 'Unlock sharing', 2: 'Unlock your résumé', 3: 'Portfolio mastery' } as const
const WHY = { 1: 'Finish these to share your portfolio.', 2: 'Finish these to turn your portfolio into a résumé.', 3: 'Round it out to earn the mastery badge by your name.' } as const

const words = (text: string | undefined) => String(text || '').trim().split(/\s+/).filter(Boolean).length
const count = (key: string, label: string, have: number, need: number, spot: Spot, detail?: string): QuestItem => ({ key, label, detail, have: Math.min(have, need), need, done: have >= need, spot })

function quest(n: 1 | 2 | 3, items: QuestItem[]): Quest {
  const done = items.filter((item) => item.done).length
  return { n, title: TITLES[n], why: WHY[n], items, done, total: items.length, complete: done === items.length }
}

export function quests(shell: Shell): Quest[] {
  const timeline = shell.timeline || []
  const projects = shell.projects || []
  const skills = new Set((shell.results || []).flatMap((item) => skillsOf(item).map((part) => part.toLowerCase())))
  for (const badge of shell.badges?.earned || []) for (const skill of badge.skills || []) skills.add(skill.toLowerCase())
  const socials = (shell.portfolio.socials || []) as Array<{ url?: string }>
  return [
    quest(1, [
      // Asked at sign-up, so it's usually ticked already.
      { key: 'name', label: 'Add your first and last name', done: Boolean(shell.identity?.first_name?.trim() && shell.identity?.last_name?.trim()), spot: 'name' },
      { key: 'photo', label: 'Add a profile photo', done: Boolean(shell.portfolio.avatar_image), spot: 'avatar' },
      { key: 'bio', label: 'Write a short bio', done: Boolean(String(shell.portfolio.short_bio || '').trim()), spot: 'about' },
      { key: 'now', label: 'Add where you are right now', done: timeline.length >= 1, spot: 'experience' },
      { key: 'made', label: 'Add something you made', done: projects.length >= 1, spot: 'projects' },
      { key: 'look', label: 'Pick your look', done: Boolean(shell.layout?.look), spot: 'settings' },
    ]),
    quest(2, [
      count('xp3', 'Add 3 experiences', timeline.length, 3, 'experience'),
      { key: 'school', label: 'Add your school', done: timeline.some((entry) => entry.entry_type === 'education'), spot: 'experience' },
      { key: 'links', label: 'Add a link where people can find you', done: socials.some((social) => social.url), spot: 'links' },
      count('skills', 'Name 3 skills', skills.size, 3, 'results'),
    ]),
    quest(3, [
      count('work', 'Show your work', projects.filter((item) => item.cover_url).length, 3, 'projects', '3 projects with a real photo'),
      count('stories', 'Tell your stories', timeline.filter((entry) => words(entry.summary) >= 25).length, 2, 'experience', '2 experiences told in a few sentences'),
      count('vouched', 'Get vouched for', (shell.quotes || []).filter((item) => item.confirmed).length, 2, 'people', '2 quotes confirmed by a boss, coach or teacher'),
      // Only what can be backed up counts: a badge earned here. Uploaded cards wait until they can be checked.
      count('proven', 'Prove it', (shell.badges?.earned || []).length, 1, 'credentials', 'Earn a badge by finishing a plan'),
      count('like', 'Show what you’re like', (shell.results || []).filter((item) => item.kind !== 'skills' || (item.data?.values || []).length).length, 1, 'results', 'Your interests, strengths or values'),
      { key: 'headed', label: 'Plan your now and next', detail: 'The phase you’re in now and the one after it', done: Boolean(shell.headed?.now && shell.headed.next.length), spot: 'headed' },
    ]),
  ]
}

/** Quests already finished before progress existed stay unlocked: a public portfolio keeps sharing, a saved résumé keeps the résumé. */
export function seenQuests(shell: Shell): number[] {
  const seen = new Set(shell.progress?.seen || [])
  if (shell.portfolio.first_published_at || shell.portfolio.published_at) seen.add(1)
  if ((shell.resume_versions || []).length) { seen.add(1); seen.add(2) }
  return [...seen]
}

export function stageOf(shell: Shell): Stage {
  const seen = seenQuests(shell)
  for (const item of quests(shell)) {
    if (seen.includes(item.n)) continue
    return { kind: item.complete ? 'unlocked' : 'working', quest: item }
  }
  return { kind: 'mastered' }
}

/** Unlocked actions: sharing after quest 1, the résumé after quest 2. */
export const unlocked = (stage: Stage, n: 1 | 2 | 3) => stage.kind === 'mastered' || stage.quest.n > n || (stage.kind === 'unlocked' && stage.quest.n === n)

/** The first unfinished item for each spot on the page, while a quest is being worked on. */
export function spotsFor(stage: Stage): Partial<Record<Spot, string>> {
  if (stage.kind !== 'working') return {}
  const spots: Partial<Record<Spot, string>> = {}
  for (const item of stage.quest.items) if (!item.done && !spots[item.spot]) spots[item.spot] = item.label
  return spots
}

/**
 * Where an item is done when that's another page, with the item's words carried along so the page can put
 * the "!" on the field or button that finishes it. Items done on the front page itself have no path.
 */
export function questPath(item: QuestItem, shell: Shell): string | null {
  const mark = `mark=${encodeURIComponent(item.detail || item.label)}`
  const untold = (shell.timeline || []).find((entry) => words(entry.summary) < 25)
  const bare = (shell.projects || []).find((project) => !project.cover_url)
  const paths: Record<string, string | null> = {
    now: `/portfolio/timeline/new?${mark}`, xp3: `/portfolio/timeline/new?${mark}`, school: `/portfolio/timeline/new?type=education&${mark}`,
    stories: untold ? `/portfolio/timeline/${untold.timeline_uuid}?${mark}` : '/portfolio/timeline',
    made: `/portfolio/projects/new?${mark}`, work: bare ? `/portfolio/projects/${bare.project_uuid}?${mark}` : `/portfolio/projects/new?${mark}`,
    vouched: '/portfolio/people', headed: '/plans',
    // What you're like starts with the interest quiz (RIASEC), right here.
    like: `/portfolio/interests?${mark}`,
  }
  return paths[item.key] ?? null
}

/** The page each spot's open item is done on, for the tiles that link away. */
export function spotPaths(stage: Stage, shell: Shell): Partial<Record<Spot, string>> {
  if (stage.kind !== 'working') return {}
  const paths: Partial<Record<Spot, string>> = {}
  for (const item of stage.quest.items) if (!item.done && !(item.spot in paths)) { const path = questPath(item, shell); if (path) paths[item.spot] = path }
  return paths
}
