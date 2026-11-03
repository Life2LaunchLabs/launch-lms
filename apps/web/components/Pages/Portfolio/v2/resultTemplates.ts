import type { PortfolioResult } from '../portfolioTypes'

// The assessments "What I'm like" knows. Each one is a form the learner fills from a result they got
// somewhere else (we link to where to take it), shown the way that assessment is usually shown. Anything
// else is "Something else": a name and a line. The result's `data.template` names its template.

export type Score = { key: string; label: string }
type Base = { id: string; name: string; kind: PortfolioResult['kind']; blurb: string; take: Array<{ label: string; url: string; free: boolean }> }
export type ResultTemplate =
  | Base & { input: 'scores'; scores: Score[]; max: number }
  | Base & { input: 'type'; options: Array<{ value: string; label: string }> }
  | Base & { input: 'pick'; options: string[]; count: number }

export const HOLLAND: Score[] = [
  { key: 'R', label: 'Realistic' }, { key: 'I', label: 'Investigative' }, { key: 'A', label: 'Artistic' },
  { key: 'S', label: 'Social' }, { key: 'E', label: 'Enterprising' }, { key: 'C', label: 'Conventional' },
]
const BIG_FIVE: Score[] = [
  { key: 'O', label: 'Openness' }, { key: 'C', label: 'Conscientiousness' }, { key: 'E', label: 'Extraversion' },
  { key: 'A', label: 'Agreeableness' }, { key: 'N', label: 'Emotional sensitivity' },
]
const SIXTEEN = ['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP', 'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP']
const ENNEAGRAM = ['Reformer', 'Helper', 'Achiever', 'Individualist', 'Investigator', 'Loyalist', 'Enthusiast', 'Challenger', 'Peacemaker']
const CLIFTON = ['Achiever', 'Activator', 'Adaptability', 'Analytical', 'Arranger', 'Belief', 'Command', 'Communication', 'Competition', 'Connectedness', 'Consistency', 'Context', 'Deliberative', 'Developer', 'Discipline', 'Empathy', 'Focus', 'Futuristic', 'Harmony', 'Ideation', 'Includer', 'Individualization', 'Input', 'Intellection', 'Learner', 'Maximizer', 'Positivity', 'Relator', 'Responsibility', 'Restorative', 'Self-Assurance', 'Significance', 'Strategic', 'Woo']

export const RESULT_TEMPLATES: ResultTemplate[] = [
  { id: 'riasec', name: 'Interest Profiler (RIASEC)', kind: 'interests', input: 'scores', scores: HOLLAND, max: 40, blurb: 'Six kinds of work you might enjoy, and how much.', take: [{ label: 'O*NET Interest Profiler', url: 'https://www.mynextmove.org/explore/ip', free: true }] },
  { id: 'sixteen', name: '16 personality types', kind: 'personality', input: 'type', options: SIXTEEN.map((code) => ({ value: code, label: code })), blurb: 'Four letters, like INFJ, in the Myers-Briggs style.', take: [{ label: 'A free 16-type test', url: 'https://www.16personalities.com/free-personality-test', free: true }, { label: 'The official MBTI', url: 'https://www.mbtionline.com', free: false }] },
  { id: 'clifton', name: 'CliftonStrengths top 5', kind: 'strengths', input: 'pick', options: CLIFTON, count: 5, blurb: 'Your five strongest talent themes, in order.', take: [{ label: 'Gallup CliftonStrengths', url: 'https://www.gallup.com/cliftonstrengths', free: false }] },
  { id: 'bigfive', name: 'Big Five', kind: 'personality', input: 'scores', scores: BIG_FIVE, max: 100, blurb: 'Five traits, each from low to high.', take: [{ label: 'Open Big Five test', url: 'https://bigfive-test.com', free: true }] },
  { id: 'enneagram', name: 'Enneagram', kind: 'personality', input: 'type', options: ENNEAGRAM.map((name, index) => ({ value: String(index + 1), label: `${index + 1} · ${name}` })), blurb: 'One of nine types.', take: [{ label: 'Truity Enneagram test', url: 'https://www.truity.com/test/enneagram-personality-test', free: true }] },
]

export const templateOf = (result?: Pick<PortfolioResult, 'data'> | null) => RESULT_TEMPLATES.find((item) => item.id === result?.data?.template)

/** The one line a result shows on the portfolio, worked out from what was entered. */
export function summaryFor(template: ResultTemplate, data: Record<string, any>): string {
  if (template.input === 'scores') {
    const scores = data.scores || {}
    const top = [...template.scores].sort((a, b) => Number(scores[b.key] || 0) - Number(scores[a.key] || 0))
    return template.id === 'bigfive' ? top.slice(0, 2).map((item) => `High ${item.label.toLowerCase()}`).join(' · ') : top.slice(0, 3).map((item) => item.label).join(' · ')
  }
  if (template.input === 'type') return template.id === 'enneagram' ? (data.type ? `Type ${data.type}, the ${ENNEAGRAM[Number(data.type) - 1]}` : '') : String(data.type || '')
  return (data.top || []).join(' · ')
}

/** Whether the form has enough to save: some score, a type, or every pick. */
export function filled(template: ResultTemplate, data: Record<string, any>): boolean {
  if (template.input === 'scores') return template.scores.some((item) => Number(data.scores?.[item.key]) > 0)
  if (template.input === 'type') return Boolean(data.type)
  return (data.top || []).length === template.count
}
