/** Who's setting up at /start. One place for each role's words, color and whether it's usually one person. */
import type { StartRole } from '@services/onboarding/start'

import { tr } from '@/lib/tr'
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
    get label() { return tr('lit.roles.parent_or_guardian', 'Parent or guardian') }, get blurb() { return tr('lit.roles.helping_my_own_kid', 'Helping my own kid') }, audience: 'parents', plural: 'kids', color: '#F08A24', dark: '#B85C0A', solo: true,
    say: ['Hand them the map', 'Pick a plan, give it to your kid, and watch each step get done. No nagging required.'],
  },
  mentor: {
    get label() { return tr('lit.roles.mentor_or_life_coach', 'Mentor or life coach') }, get blurb() { return tr('lit.roles.guiding_a_few_people_one', 'Guiding a few people one-on-one') }, audience: 'mentors and coaches', plural: 'mentees', color: '#13B3A4', dark: '#0B7A70', solo: true,
    say: ['Momentum between sessions', 'Everyone you mentor has a next step waiting, and you see what they did before you meet.'],
  },
  teacher: {
    get label() { return tr('lit.roles.teacher_or_counselor', 'Teacher or counselor') }, get blurb() { return tr('lit.roles.supporting_a_class_or_caseload', 'Supporting a class or caseload') }, audience: 'teachers and counselors', plural: 'students', color: '#8B5CF6', dark: '#5B30C8', solo: false,
    say: ['Every student, their own path', 'Give each student a plan that fits, review their work in one place, and see who needs a nudge.'],
  },
  program: {
    get label() { return tr('lit.roles.program_staff', 'Program staff') }, get blurb() { return tr('lit.roles.a_nonprofit_camp_club_or', 'A nonprofit, camp, club or community program') }, audience: 'programs', plural: 'participants', color: '#EC4F9A', dark: '#B0245F', solo: false,
    say: ['Your curriculum, finished', 'Run your program as plans, give out badges people keep, and let volunteers help review.'],
  },
  training: {
    get label() { return tr('lit.roles.workplace_or_adult_training', 'Workplace or adult training') }, get blurb() { return tr('lit.roles.onboarding_safety_or_skills_training', 'Onboarding, safety or skills training') }, audience: 'workplace training', plural: 'trainees', color: '#E2702B', dark: '#A8481A', solo: false,
    say: ['Training that sticks', 'Turn onboarding and safety training into plans, sign off on each step, and give out badges your trainees keep.'],
  },
  district: {
    get label() { return tr('lit.roles.school_or_district_leader', 'School or district leader') }, get blurb() { return tr('lit.roles.readiness_across_schools', 'Readiness across schools') }, audience: 'schools and districts', plural: 'students', color: '#4C8DFF', dark: '#2257C4', solo: false,
    say: ['Readiness you can see', 'Roll out plans to whole groups, link steps to graduation requirements, and track progress across schools.'],
  },
}

export const ROLE_IDS = Object.keys(ROLES) as StartRole[]

export const PALETTE: Array<[string, string]> = [
  ['Blue', '#2F66D6'], ['Violet', '#6B3FE0'], ['Teal', '#0B8077'], ['Sky', '#1A86AE'],
  ['Lime', '#5E9A14'], ['Amber', '#C77A0E'], ['Orange', '#C9501E'], ['Pink', '#C8327D'],
]

export const AVATAR_COLORS = ['#C8327D', '#0B8077', '#6B3FE0', '#C77A0E', '#1A86AE', '#C9501E', '#5E9A14', '#2F66D6']

/** Group names that follow the calendar and fit the role: graduating classes only for schools, cohorts and new hires for everyone else. */
export function groupSuggestions(now = new Date(), role: StartRole | null = null): string[] {
  const year = now.getFullYear()
  const month = now.getMonth()
  const grad = month >= 6 ? year + 1 : year
  const season = month >= 7 ? tr('lit.timeline.spring', 'Spring') : month <= 2 ? tr('lit.timeline.summer', 'Summer') : tr('lit.timeline.fall', 'Fall')
  if (role === 'teacher' || role === 'district') return [`Class of ${grad}`, `Class of ${grad + 1}`, `${season} workshop`, tr('lit.roles.new_hires', 'New hires')]
  if (role === 'training') return [tr('lit.roles.new_hires', 'New hires'), `${season} cohort`, `${season} workshop`]
  return [`${season} cohort`, `${season} workshop`, tr('lit.roles.new_hires', 'New hires')]
}

export const initials = (text: string) => {
  const parts = text.trim().split(/[\s@._]+/).filter(Boolean)
  return ((parts[0] || '?')[0] + (parts[1] ? parts[1][0] : '')).toUpperCase()
}

export const slugify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'your-space'
