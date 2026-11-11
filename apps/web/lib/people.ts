/**
 * What the organization calls the people it supports: "students", "trainees", "team members".
 *
 * Organizations aren't all schools, and their people can be any age, so the app never says "learner"
 * to anyone: it says the organization's own word (Settings › General, filled in from the role picked at
 * /start; apps/api/src/services/orgs/people_words.py). Without one it says "participant".
 *
 * Copy keeps writing "learner"/"learners" and runs through `inOrgWords()`, which swaps in the word with the
 * same capitals and number. Everything translated with i18next gets this for free (lib/i18n.ts adds it
 * as a post-processor); plain English text in components is wrapped in `inOrgWords(...)`. OrgProvider sets
 * the word for the organization on screen, so this works outside React too, like `tr`.
 */

export interface PeopleWords {
  one: string
  many: string
}

export const DEFAULT_PEOPLE: PeopleWords = { one: 'participant', many: 'participants' }

let current: PeopleWords = DEFAULT_PEOPLE

/** The organization's words from its config, or the neutral default. */
export function peopleWordsOf(org: any): PeopleWords {
  const general = org?.config?.config?.customization?.general || {}
  const one = typeof general.people_one === 'string' ? general.people_one.trim() : ''
  const many = typeof general.people_many === 'string' ? general.people_many.trim() : ''
  return one && many ? { one, many } : DEFAULT_PEOPLE
}

/** Use this organization's words from now on (OrgProvider calls it with the org it shows). */
export function setPeopleWords(words: PeopleWords | null | undefined): void {
  current = words && words.one && words.many ? words : DEFAULT_PEOPLE
}

export function currentPeopleWords(): PeopleWords {
  return current
}

const LEARNER = /\b(LEARNER|[Ll]earner)(S|s)?\b/g
const HAS_LEARNER = /\b(LEARNER|[Ll]earner)(S|s)?\b/

const shape = (word: string, like: string): string => {
  if (like === like.toUpperCase()) return word.toUpperCase()
  if (like[0] === like[0].toUpperCase()) return word.charAt(0).toUpperCase() + word.slice(1)
  return word
}

/** The text with "learner(s)" in any case swapped for the organization's word. */
export function inOrgWords(text: string, words: PeopleWords = current): string {
  if (!text || (words.one === 'learner' && words.many === 'learners')) return text
  return text.replace(LEARNER, (_, base: string, plural?: string) => shape(plural ? words.many : words.one, base))
}

/** `inOrgWords(text)`, leaving alone the names filled into it (a plan called "Learner safety" stays so). */
export function peopleAround(text: string, filled: string[]): string {
  const keep = filled.filter((item) => item && HAS_LEARNER.test(item))
  if (!keep.length) return inOrgWords(text)
  const pattern = new RegExp(`(${keep.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`)
  return text.split(pattern).map((part, index) => (index % 2 ? part : inOrgWords(part))).join('')
}

/** i18next post-processor: every English string the app translates says the organization's word. */
export const peoplePostProcessor = {
  type: 'postProcessor' as const,
  name: 'people',
  process(value: string, _key: string | string[], options: Record<string, unknown> | undefined, translator: any): string {
    const language = translator?.language || 'en'
    if (typeof value !== 'string' || !String(language).startsWith('en')) return value
    return peopleAround(value, Object.entries(options || {}).filter(([name, item]) => name !== 'defaultValue' && typeof item === 'string').map(([, item]) => item as string))
  },
}
