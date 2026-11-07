import { PORTFOLIO_STRENGTHS, PORTFOLIO_VALUES, type CategorizedOption } from '@components/Portfolio/traitOptions'
import type { PortfolioResult } from '../portfolioTypes'

import { tr } from '@/lib/tr'
// The assessments "What I'm like" knows. Each one is a form the learner fills from a result they got
// somewhere else (we link to where to take it), shown the way that assessment is usually shown. Skills and
// values is our own: chips to tap, right here. The result's `data.template` names its template.

export type Score = { key: string; label: string }
type Base = { id: string; name: string; kind: PortfolioResult['kind']; blurb: string; take: Array<{ label: string; url: string; free: boolean }> }
export type ResultTemplate =
  | Base & { input: 'scores'; scores: Score[]; max: number }
  | Base & { input: 'type'; options: Array<{ value: string; label: string }> }
  | Base & { input: 'pick'; options: string[]; count: number }
  | Base & { input: 'chips'; groups: ChipGroup[] }

/** One set of chips in a chip test: picked ids go in data[key], your own chips in data.custom[key]. */
export type ChipGroup = { key: 'skills' | 'values'; label: string; hint: string; options: CategorizedOption[] }
export const SKILLS_VALUES = 'skills-values'

export const HOLLAND: Score[] = [
  { key: 'R', get label() { return tr('portfolio.result_templates.realistic', 'Realistic') } }, { key: 'I', get label() { return tr('portfolio.result_templates.investigative', 'Investigative') } }, { key: 'A', get label() { return tr('portfolio.result_templates.artistic', 'Artistic') } },
  { key: 'S', get label() { return tr('portfolio.result_templates.social', 'Social') } }, { key: 'E', get label() { return tr('portfolio.result_templates.enterprising', 'Enterprising') } }, { key: 'C', get label() { return tr('portfolio.result_templates.conventional', 'Conventional') } },
]
const BIG_FIVE: Score[] = [
  { key: 'O', get label() { return tr('portfolio.result_templates.openness', 'Openness') } }, { key: 'C', get label() { return tr('portfolio.result_templates.conscientiousness', 'Conscientiousness') } }, { key: 'E', get label() { return tr('portfolio.result_templates.extraversion', 'Extraversion') } },
  { key: 'A', get label() { return tr('portfolio.result_templates.agreeableness', 'Agreeableness') } }, { key: 'N', get label() { return tr('portfolio.result_templates.emotional_sensitivity', 'Emotional sensitivity') } },
]
const SIXTEEN = ['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP', 'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP']
const ENNEAGRAM = ['Reformer', 'Helper', 'Achiever', 'Individualist', 'Investigator', 'Loyalist', 'Enthusiast', 'Challenger', 'Peacemaker']
const CLIFTON = ['Achiever', 'Activator', 'Adaptability', 'Analytical', 'Arranger', 'Belief', 'Command', 'Communication', 'Competition', 'Connectedness', 'Consistency', 'Context', 'Deliberative', 'Developer', 'Discipline', 'Empathy', 'Focus', 'Futuristic', 'Harmony', 'Ideation', 'Includer', 'Individualization', 'Input', 'Intellection', 'Learner', 'Maximizer', 'Positivity', 'Relator', 'Responsibility', 'Restorative', 'Self-Assurance', 'Significance', 'Strategic', 'Woo']

export const RESULT_TEMPLATES: ResultTemplate[] = [
  { id: 'riasec', name: 'Interest Profiler (RIASEC)', kind: 'interests', input: 'scores', scores: HOLLAND, max: 40, get blurb() { return tr('portfolio.result_templates.six_kinds_of_work_you', 'Six kinds of work you might enjoy, and how much.') }, take: [{ get label() { return tr('portfolio.result_templates.o_net_interest_profiler', 'O*NET Interest Profiler') }, url: 'https://www.mynextmove.org/explore/ip', free: true }] },
  { id: 'sixteen', name: '16 personality types', kind: 'personality', input: 'type', options: SIXTEEN.map((code) => ({ value: code, label: code })), get blurb() { return tr('portfolio.result_templates.four_letters_like_infj_in', 'Four letters, like INFJ, in the Myers-Briggs style.') }, take: [{ get label() { return tr('portfolio.result_templates.a_free_16_type_test', 'A free 16-type test') }, url: 'https://www.16personalities.com/free-personality-test', free: true }, { get label() { return tr('portfolio.result_templates.the_official_mbti', 'The official MBTI') }, url: 'https://www.mbtionline.com', free: false }] },
  { id: 'clifton', name: 'CliftonStrengths top 5', kind: 'strengths', input: 'pick', options: CLIFTON, count: 5, get blurb() { return tr('portfolio.result_templates.your_five_strongest_talent_themes', 'Your five strongest talent themes, in order.') }, take: [{ get label() { return tr('portfolio.result_templates.gallup_cliftonstrengths', 'Gallup CliftonStrengths') }, url: 'https://www.gallup.com/cliftonstrengths', free: false }] },
  { id: 'bigfive', name: 'Big Five', kind: 'personality', input: 'scores', scores: BIG_FIVE, max: 100, get blurb() { return tr('portfolio.result_templates.five_traits_each_from_low', 'Five traits, each from low to high.') }, take: [{ get label() { return tr('portfolio.result_templates.open_big_five_test', 'Open Big Five test') }, url: 'https://bigfive-test.com', free: true }] },
  { id: SKILLS_VALUES, name: 'Skills and values', kind: 'skills', input: 'chips', get blurb() { return tr('portfolio.result_templates.tap_what_you_re_good', 'Tap what you’re good at and what matters most to you.') }, take: [], groups: [
    { key: 'skills', get label() { return tr('portfolio.resume_model.skills', 'Skills') }, get hint() { return tr('portfolio.result_templates.what_you_re_good_at', 'What you’re good at. Add your own, like Spanish or welding.') }, options: PORTFOLIO_STRENGTHS },
    { key: 'values', get label() { return tr('portfolio.result_templates.values', 'Values') }, get hint() { return tr('portfolio.result_templates.what_matters_most_to_you', 'What matters most to you. They guide your choices.') }, options: PORTFOLIO_VALUES },
  ] },
  { id: 'enneagram', name: 'Enneagram', kind: 'personality', input: 'type', options: ENNEAGRAM.map((name, index) => ({ value: String(index + 1), label: `${index + 1} · ${name}` })), get blurb() { return tr('portfolio.result_templates.one_of_nine_types', 'One of nine types.') }, take: [{ get label() { return tr('portfolio.result_templates.truity_enneagram_test', 'Truity Enneagram test') }, url: 'https://www.truity.com/test/enneagram-personality-test', free: true }] },
]

/** Free to take: ours, or offered free somewhere. */
export const isFree = (template: ResultTemplate) => template.id === 'riasec' || !template.take.length || template.take.some((place) => place.free)

/** The words of the chips picked in one group of a chip test, in the order they were picked. */
export function chipTexts(template: Extract<ResultTemplate, { input: 'chips' }>, data: Record<string, any>, key: ChipGroup['key']): string[] {
  const group = template.groups.find((item) => item.key === key)
  const known = [...(group?.options || []), ...((data.custom?.[key] || []) as CategorizedOption[])]
  return ((data[key] || []) as string[]).map((id) => known.find((option) => option.id === id)?.text || id)
}

/** The skills a result names: a chip test's picked skills, or an older skills line split at its commas. */
export function skillsOf(result: Pick<PortfolioResult, 'kind' | 'summary' | 'data'>): string[] {
  const template = templateOf(result)
  if (template?.input === 'chips') return chipTexts(template, result.data || {}, 'skills')
  if (result.kind !== 'skills') return []
  return (result.summary || '').split(/[,;·]/).map((part) => part.trim()).filter(Boolean)
}

export const templateOf = (result?: Pick<PortfolioResult, 'data'> | null) => RESULT_TEMPLATES.find((item) => item.id === result?.data?.template)

/** The one line a result shows on the portfolio, worked out from what was entered. */
export function summaryFor(template: ResultTemplate, data: Record<string, any>): string {
  if (template.input === 'scores') {
    const scores = data.scores || {}
    const top = [...template.scores].sort((a, b) => Number(scores[b.key] || 0) - Number(scores[a.key] || 0))
    return template.id === 'bigfive' ? top.slice(0, 2).map((item) => `High ${item.label.toLowerCase()}`).join(' · ') : top.slice(0, 3).map((item) => item.label).join(' · ')
  }
  if (template.input === 'chips') { const skills = chipTexts(template, data, 'skills'); return (skills.length ? skills : chipTexts(template, data, 'values')).join(' · ') }
  if (template.input === 'type') return template.id === 'enneagram' ? (data.type ? `Type ${data.type}, the ${ENNEAGRAM[Number(data.type) - 1]}` : '') : String(data.type || '')
  return (data.top || []).join(' · ')
}

/** Whether the form has enough to save: some score, a type, or every pick. */
export function filled(template: ResultTemplate, data: Record<string, any>): boolean {
  if (template.input === 'scores') return template.scores.some((item) => Number(data.scores?.[item.key]) > 0)
  if (template.input === 'type') return Boolean(data.type)
  if (template.input === 'chips') return template.groups.some((group) => (data[group.key] || []).length > 0)
  return (data.top || []).length === template.count
}
