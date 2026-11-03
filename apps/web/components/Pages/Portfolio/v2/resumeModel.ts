import { timelineDateLabel, type TimelineEntry } from '../Timeline'
import type { Shell } from '../portfolioTypes'

// The résumé is a view of the portfolio: these sections, built from what's there, minus what a version took off.
// Keys match the API's excluded list: "section:<key>", "timeline:<uuid>", "credential:<uuid>", "project:<uuid>",
// "contact:<uuid>".

export type ResumeItem = { key: string; title: string; detail?: string; when?: string; text?: string }
export type ResumeSection = { key: string; title: string; items: ResumeItem[]; removed: ResumeItem[]; text?: string }

export const RESUME_LAYOUTS = [['classic', 'Classic'], ['modern', 'Modern'], ['compact', 'Compact']] as const
export const RESUME_ACCENTS: Record<string, string> = { blue: '#2F66D6', violet: '#6539D8', teal: '#0B7D73', pink: '#B42C6F', orange: '#A9431A', ink: '#1b2830' }

const LEGACY: Record<string, string> = { employment: 'work_career', volunteering: 'leadership_service', training: 'learning_experiences', experience: 'other' }
const typeOf = (entry: TimelineEntry) => LEGACY[entry.entry_type] || entry.entry_type
const month = (value?: string | null) => value && /^\d{4}-\d{2}$/.test(value) ? new Date(`${value}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : ''

const SECTIONS: Array<{ key: string; title: string; types?: string[] }> = [
  { key: 'profile', title: 'Profile' },
  { key: 'experience', title: 'Experience', types: ['work_career', 'other'] },
  { key: 'leadership', title: 'Leadership & activities', types: ['leadership_service', 'teams_activities'] },
  { key: 'education', title: 'Education', types: ['education', 'learning_experiences'] },
  { key: 'projects', title: 'Projects' },
  { key: 'awards', title: 'Awards', types: ['awards_recognition', 'challenges_milestones'] },
  { key: 'certifications', title: 'Certifications' },
  { key: 'skills', title: 'Skills' },
  { key: 'references', title: 'References' },
]

export function sectionTitle(key: string) {
  return SECTIONS.find((section) => section.key === key)?.title || key
}

/** Every section with something in it, split into what's on this version and what it took off. Sections a version
 *  took off come back as ``removedSections``. */
export function buildResume(shell: Shell, excluded: string[]) {
  const off = new Set(excluded)
  const split = (items: ResumeItem[]) => ({ items: items.filter((item) => !off.has(item.key)), removed: items.filter((item) => off.has(item.key)) })
  const timeline = [...(shell.timeline || [])].sort((a, b) => Number(b.is_current) - Number(a.is_current) || (b.start_date || '').localeCompare(a.start_date || ''))
  const credentials = shell.credentials || []
  const sections: ResumeSection[] = []
  const removedSections: string[] = []
  for (const section of SECTIONS) {
    let items: ResumeItem[] = []
    let text = ''
    if (section.types) {
      items = timeline.filter((entry) => section.types!.includes(typeOf(entry))).map((entry) => ({ key: `timeline:${entry.timeline_uuid}`, title: entry.title, detail: entry.organization, when: timelineDateLabel(entry), text: entry.summary }))
      if (section.key === 'education') items.push(...credentials.filter((item) => item.kind === 'diploma' || item.kind === 'test_score').map((item) => ({ key: `credential:${item.credential_uuid}`, title: item.kind === 'test_score' && item.score ? `${item.name}: ${item.score}` : item.name, detail: item.issuer, when: item.issued_on ? month(item.issued_on) : item.expected_on ? `Expected ${month(item.expected_on)}` : '' })))
    } else if (section.key === 'profile') text = [shell.portfolio.headline, shell.portfolio.short_bio].filter(Boolean).join('. ').replace(/\.\./g, '.')
    else if (section.key === 'projects') items = [...(shell.projects || [])].sort((a, b) => Number(b.featured) - Number(a.featured)).map((project) => ({ key: `project:${project.project_uuid}`, title: project.title, text: project.subtitle || project.summary }))
    else if (section.key === 'certifications') items = credentials.filter((item) => item.kind === 'card' || item.kind === 'certificate').map((item) => ({ key: `credential:${item.credential_uuid}`, title: item.name, detail: item.issuer, when: item.expires_on ? `Valid until ${month(item.expires_on)}` : month(item.issued_on) }))
    else if (section.key === 'skills') text = (shell.results || []).filter((result) => ['skills', 'strengths'].includes(result.kind) && result.visibility !== 'private').map((result) => result.summary).filter(Boolean).join(' · ')
    else if (section.key === 'references') items = (shell.contacts || []).filter((person) => person.is_reference).map((person) => ({ key: `contact:${person.contact_uuid}`, title: person.name, detail: person.role_label }))
    if (!items.length && !text) continue
    if (off.has(`section:${section.key}`)) { removedSections.push(section.key); continue }
    sections.push({ key: section.key, title: section.title, text, ...split(items) })
  }
  return { sections, removedSections }
}
