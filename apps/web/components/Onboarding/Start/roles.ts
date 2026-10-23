/** Who's setting up at /start. One place for each role's words, color and whether it's usually one person. */
import type { StartRole } from '@services/onboarding/start'

export type { StartRole }

export interface RoleConfig {
  label: string
  blurb: string
  /** "Picked from Discover for …" */
  audience: string
  /** What they call the people they help: "Add your first …" */
  plural: string
  color: string
  dark: string
  /** Usually one person: the org switch starts off and the space is personal. */
  solo: boolean
  say: [string, string]
}

export const ROLES: Record<StartRole, RoleConfig> = {
  parent: {
    label: 'Parent or guardian', blurb: 'Helping my own kid', audience: 'parents', plural: 'kids', color: '#F08A24', dark: '#B85C0A', solo: true,
    say: ['Hand them the map', 'Pick a plan, give it to your kid, and watch each step get done. No nagging required.'],
  },
  mentor: {
    label: 'Mentor or life coach', blurb: 'Guiding a few people one-on-one', audience: 'mentors and coaches', plural: 'mentees', color: '#13B3A4', dark: '#0B7A70', solo: true,
    say: ['Momentum between sessions', 'Everyone you mentor has a next step waiting, and you see what they did before you meet.'],
  },
  teacher: {
    label: 'Teacher or counselor', blurb: 'Supporting a class or caseload', audience: 'teachers and counselors', plural: 'students', color: '#8B5CF6', dark: '#5B30C8', solo: false,
    say: ['Every student, their own path', 'Give each student a plan that fits, review their work in one place, and see who needs a nudge.'],
  },
  program: {
    label: 'Youth program staff', blurb: 'A nonprofit, club or community program', audience: 'youth programs', plural: 'participants', color: '#EC4F9A', dark: '#B0245F', solo: false,
    say: ['Your curriculum, finished', 'Run your program as plans, give out badges people keep, and let volunteers help review.'],
  },
  district: {
    label: 'School or district leader', blurb: 'Readiness across schools', audience: 'schools and districts', plural: 'students', color: '#4C8DFF', dark: '#2257C4', solo: false,
    say: ['Readiness you can see', 'Roll out plans to whole groups, link steps to graduation requirements, and track progress across schools.'],
  },
}

export const ROLE_IDS = Object.keys(ROLES) as StartRole[]

export const PALETTE: Array<[string, string]> = [
  ['Blue', '#2F66D6'], ['Violet', '#6B3FE0'], ['Teal', '#0B8077'], ['Sky', '#1A86AE'],
  ['Lime', '#5E9A14'], ['Amber', '#C77A0E'], ['Orange', '#C9501E'], ['Pink', '#C8327D'],
]

export const AVATAR_COLORS = ['#C8327D', '#0B8077', '#6B3FE0', '#C77A0E', '#1A86AE', '#C9501E', '#5E9A14', '#2F66D6']

/** Group names that follow the calendar: the classes graduating next, and the season coming up. */
export function groupSuggestions(now = new Date()): string[] {
  const year = now.getFullYear()
  const month = now.getMonth()
  const grad = month >= 6 ? year + 1 : year
  const season = month >= 7 ? 'Spring' : month <= 2 ? 'Summer' : 'Fall'
  return [`Class of ${grad}`, `Class of ${grad + 1}`, `${season} workshop`, 'New hires']
}

export const initials = (text: string) => {
  const parts = text.trim().split(/[\s@._]+/).filter(Boolean)
  return ((parts[0] || '?')[0] + (parts[1] ? parts[1][0] : '')).toUpperCase()
}

export const slugify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'your-space'
