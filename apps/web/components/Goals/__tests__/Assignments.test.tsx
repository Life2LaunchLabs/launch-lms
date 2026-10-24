import { afterAll, beforeAll, describe, expect, setSystemTime, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SWRConfig } from 'swr'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import AssignmentPlan from '@components/Goals/admin/assignments/AssignmentPlan'
import AssignmentLearners from '@components/Goals/admin/assignments/AssignmentLearners'
import { needsOf } from '@components/Goals/admin/assignments/AssignmentsList'
import PlanCard from '@components/Goals/admin/assignments/PlanCard'
import { planFilterSpecs, shownPlans, stackSummary } from '@components/Goals/admin/assignments/planStack'
import { readFilters } from '@/lib/admin/filters'
import type { Inbox, PlanAssignment, PlansStack } from '@services/goals/admin'
import { matrix } from '@services/goals/__tests__/cohortFixture'

const router = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} }

beforeAll(() => setSystemTime(new Date('2026-10-19T15:00:00Z')))
afterAll(() => setSystemTime())

function render(node: React.ReactNode) {
  return renderToStaticMarkup(<AppRouterContext.Provider value={router as never}>
    <SWRConfig value={{ provider: () => new Map() }}>{node}</SWRConfig>
  </AppRouterContext.Provider>)
}

const ctx = { orgslug: 'school', orgId: 1, token: 'token', assignmentUuid: 'a1', admin: true, refresh: () => undefined }

describe('an assignment’s plan', () => {
  test('counts each step across learners, with what’s left for staff under it', () => {
    const data = matrix()
    data.assignment.status = 'active'
    const html = render(<AssignmentPlan matrix={data} ctx={ctx} viewerUserId={9} />)
    // The template's stages and steps, counted.
    expect(html).toContain('aria-label="Explore"')
    expect(html).toContain('All 3 done')
    // Hand-ins go to the grading stack, back to this assignment.
    expect(html).toContain('to grade')
    expect(/<\/svg>Grade \d/.test(html)).toBe(true)
    expect(html).toContain('from=assignment')
    // Late hand-ins: reminded today already, so no second reminder.
    expect(html).toContain('Reminded today')
    // The fair is staff's to settle.
    expect(html).toContain('Staff confirm this')
  })
})

describe('an assignment’s learners', () => {
  test('rows by need, with dots, pace, attention and who else helps', () => {
    const html = render(<AssignmentLearners matrix={matrix()} orgslug="school" orgId={1} token="token" />)
    expect(html).toContain('aria-label="Search learners"')
    expect(html).toContain('Export evidence CSV for 3')
    expect(html).toContain('Plan</b> now')
    // Learner 3 is late on Values, so they come first.
    expect(html.indexOf('Open L3’s plan feed')).toBeLessThan(html.indexOf('Open L1’s plan feed'))
    expect(html).toContain('Behind · 1 step')
    expect(html).toContain('Handed in: resume')
    expect(html).toContain('Sent back: resume')
    // The assignment's own staff are left out of helpers.
    expect(html).toContain('Pat · Guardian')
    expect(html).not.toContain('Ms. Rivera · Staff')
  })
})

describe('what an assignment list says waits on staff', () => {
  test('grading and settling counted per assignment, nudges left out', () => {
    const inbox = { groups: [
      { assignment_uuid: 'a1', kind: 'review', count: 2 }, { assignment_uuid: 'a1', kind: 'grade', count: 1 },
      { assignment_uuid: 'a1', kind: 'confirm', count: 3 }, { assignment_uuid: 'a2', kind: 'nudge', count: 4 },
    ] } as unknown as Inbox
    expect(needsOf(inbox)).toEqual({ a1: { grade: 3, settle: 3 } })
  })
})

function planAssignment(uuid: string, extra: Partial<PlanAssignment> = {}): PlanAssignment {
  return {
    assignment_uuid: uuid, template_uuid: 'goal_template_ccr', template_title: 'College & Career Readiness', version: 1, usergroup_id: null, user_id: 2,
    subject_email: null, welcome_message: '', staff_user_ids: [9], staff: [{ id: 9, first_name: 'Jo', last_name: 'Park' }], start_date: '2026-09-29', due_date: '2027-01-07',
    status: 'active', paused_at: null, ended_at: null, creation_date: '2026-09-29', cohort: null, user: { id: 2, first_name: 'Priya', last_name: 'Shah' },
    learner_count: 1, goal_uuid: 'g1', assignment_type: 'individual', step_count: 9, completed_count: 3, review_count: 1,
    progress_percent: 33, min_progress_percent: 33, max_progress_percent: 33, learner_ids: [2], ...extra,
  }
}

function stack(): PlansStack {
  const group = planAssignment('a-group', { cohort: { id: 7, uuid: 'ug7', name: 'Advisory B' }, user: null, user_id: null, usergroup_id: 7, assignment_type: 'group', learner_count: 2, learner_ids: [2, 3], progress_percent: 16 })
  return {
    learners: [{ id: 2, first_name: 'Priya', last_name: 'Shah' }, { id: 3, first_name: 'Diego', last_name: 'Alvarez' }],
    plans: [
      {
        template: { template_uuid: 'goal_template_ccr', title: 'College & Career Readiness', status: 'active', version: 2, stage_count: 3, step_count: 9, owner_org: { id: 5, name: 'Life2Launch', slug: 'l2l' }, own: false, run_with_permission: true },
        badges: [{ badge_uuid: 'badge_cr', name: 'Career Ready', thumbnail_image: '', org_id: 5, owner_org: { id: 5, name: 'Life2Launch', slug: 'l2l' } }],
        frameworks: [{ framework_uuid: 'fw_ccr', name: 'State CCR Standards', org_id: 1, node_count: 8 }],
        assignments: [group, planAssignment('a-priya'), planAssignment('a-old', { status: 'ended', user: { id: 3, first_name: 'Diego', last_name: 'Alvarez' }, user_id: 3, learner_ids: [3] })],
        authorized_orgs: [],
      },
      {
        template: { template_uuid: 'goal_template_capstone', title: 'Senior Capstone', status: 'active', version: 3, stage_count: 3, step_count: 7, owner_org: { id: 1, name: 'Northside', slug: 'school' }, own: true, run_with_permission: false },
        badges: [], frameworks: [], assignments: [],
        authorized_orgs: [{ org: { id: 8, name: 'Lakeview Charter', slug: 'lakeview' }, assignment_count: 2, learner_count: 112, since: '2026-03-02' }],
      },
    ],
  }
}

describe('the plan card stack', () => {
  test('filters: current rows by default, ended ones counted for Show them; partners for admins only', () => {
    const shown = shownPlans(stack(), readFilters(planFilterSpecs(stack(), { admin: true }), {}), { admin: true })
    expect(shown.cards.map((card) => card.plan.template.title)).toEqual(['College & Career Readiness', 'Senior Capstone'])
    expect(shown.cards[0].rows.map((row) => row.assignment_uuid)).toEqual(['a-group', 'a-priya'])
    expect(shown.cards[0].endedHidden).toBe(1)
    expect(shown.cards[1].partners.map((item) => item.learner_count)).toEqual([112])
    expect(stackSummary(shown)).toBe('2 plans · 2 assignments')
    // Staff don't see other organizations' runs.
    expect(shownPlans(stack(), {}, { admin: false }).cards[1].partners).toEqual([])
  })

  test('search reaches badges, requirements and people; row filters hide plans with nothing left', () => {
    const specs = planFilterSpecs(stack(), { admin: true })
    expect(specs.map((spec) => spec.key)).toEqual(['status', 'scope', 'group', 'learner', 'staff', 'badge', 'req'])
    const by = (params: Record<string, string>) => shownPlans(stack(), readFilters(specs, params), { admin: true })
    expect(by({ q: 'ccr standards' }).cards.map((card) => card.rows.length)).toEqual([2])
    expect(by({ q: 'diego', status: 'all' }).cards[0].rows.map((row) => row.assignment_uuid)).toEqual(['a-group', 'a-old'])
    expect(by({ learner: '2' }).cards[0].rows.map((row) => row.assignment_uuid)).toEqual(['a-group', 'a-priya'])
    expect(by({ group: '7' }).hidden).toBe(1)
    expect(by({ badge: '1' }).cards.map((card) => card.plan.template.title)).toEqual(['College & Career Readiness'])
    expect(by({ scope: 'orgs' }).cards.map((card) => card.plan.template.title)).toEqual(['Senior Capstone'])
  })

  test('a card shows the plan, its badge and requirements, then its rows with staff, progress and what waits on you', () => {
    const [card] = shownPlans(stack(), {}, { admin: true }).cards
    const html = render(<PlanCard {...card} orgslug="school" orgId={1} token="token" admin={false} needs={{ 'a-group': { grade: 3, settle: 4 } }} onChanged={() => undefined} onShowEnded={() => undefined} />)
    expect(html).toContain('3 stages · 9 steps · From Life2Launch · you run it with their permission')
    expect(html).toContain('Earns Career Ready')
    expect(html).toContain('/admin/plans/badge/cr/definition')
    expect(html).toContain('State CCR Standards · 8')
    expect(html).toContain('/admin/plans/requirements/fw_ccr')
    expect(html).toContain('Open plan')
    expect(html).toContain('Advisory B')
    expect(html).toContain('3 to grade')
    expect(html).toContain('4 to settle')
    expect(html).toContain('All clear')
    expect(html).toContain('Progress 16%')
    expect(html).toContain('Staff: Jo Park')
    expect(html).toContain('1 ended assignment hidden.')
    // Staff don't assign.
    expect(html).not.toContain('>Assign<')
  })

  test('a creator’s own plan lists the organizations running it, counts only', () => {
    const card = shownPlans(stack(), {}, { admin: true }).cards[1]
    const html = render(<PlanCard {...card} orgslug="school" orgId={1} token="token" admin needs={{}} onChanged={() => undefined} onShowEnded={() => undefined} />)
    // Your own plan doesn't say who made it, and missing badges or requirements get no placeholder chips.
    expect(html).not.toContain('Made by')
    expect(html).not.toContain('No badge')
    expect(html).toContain('Run by authorized orgs · 1')
    expect(html).toContain('Authorized · 112 learners')
    expect(html).toContain('Not assigned yet.')
  })
})
