'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Award, BriefcaseBusiness, Play } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Label } from '@components/ui/label'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { templateKeys, templatesApi } from '@services/goals/templates'
import { BadgeMedal } from '@components/Badges/BadgeMedal'
import type { PortfolioConfig, Step } from '@services/goals/types'
import type { ConfigPanelProps, StepCardProps, StepDefinition } from './registry'
import { CardNote, Feedback, FinishControls, StepIntro } from './shared'

import { tr } from '@/lib/tr'
// Activity, Badge and Portfolio steps finish on their own: a run, an award, a portfolio change.

function ActivityCard(props: StepCardProps<'activity'>) {
  const { step, actions, canWork } = props
  const started = step.status !== 'not_started'
  // Handed in counts as done here: the learner can look back at it while it waits on review.
  const done = step.status === 'completed' || step.status === 'excused' || step.status === 'submitted'
  return <div className="flex flex-col gap-3">
    <StepIntro step={step} />
    <Feedback step={step} />
    {step.reference?.page_count ? <CardNote icon={Play}>{step.reference.page_count} {step.reference.page_count === 1 ? 'page' : 'pages'}{started && !done ? tr('goals.linked.round_through', ' · {{round}}% through', { round: Math.round(step.fraction * 100) }) : ''}</CardNote> : null}
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {canWork && !step.locked ? <Button type="button" variant={done ? 'surface' : 'plan'} onClick={actions.openActivity}><Play size={15} aria-hidden="true" />{done ? tr('goals.linked.review', 'Review') : started ? tr('goals.linked.continue', 'Continue') : tr('goals.linked.start', 'Start')}</Button> : null}
      <FinishControls {...props} finishesItself />
    </div>
  </div>
}

function ActivityConfigPanel({ config }: ConfigPanelProps<'activity'>) {
  return <CardNote icon={Play}>{config.activity_uuid ? tr('goals.linked.edit_the_activity_from_the', 'Edit the activity from the step in the template editor.') : tr('goals.linked.save_the_step_to_create', 'Save the step to create its activity.')}</CardNote>
}

export const activity: StepDefinition<'activity'> = {
  type: 'activity',
  get label() { return tr('goals.linked.activity', 'Activity') },
  color: '#C9501E',
  get hint() { return tr('goals.linked.an_interactive_lesson_or_quiz', 'An interactive lesson or quiz played in the app.') },
  get example() { return tr('lit.linked.needs_vs_wants_sorting_game', 'Needs vs wants sorting game') },
  icon: Play,
  statusLine: (step) => step.status === 'in_progress' ? `${Math.round(step.fraction * 100)}% through` : null,
  CardBody: ActivityCard,
  ConfigPanel: ActivityConfigPanel,
  defaultConfig: () => ({ activity_uuid: '' }),
  finishesItself: true,
}

function BadgeCard(props: StepCardProps<'badge'>) {
  const { step, orgslug } = props
  const plan = step.reference
  return <div className="flex flex-col gap-3">
    <StepIntro step={step} />
    <div className="flex items-center gap-3">
      {plan?.badge ? <BadgeMedal badge={plan.badge} size={48} /> : <span className="grid h-12 w-12 place-items-center rounded-full bg-muted text-[var(--plan-accent)]"><Award size={22} /></span>}
      <div className="min-w-0">
        <p className="truncate font-bold">{plan?.badge?.name || plan?.title || tr('goals.linked.badge', 'Badge')}</p>
        <CardNote>{step.status === 'completed' ? tr('goals.linked.awarded', 'Awarded') : tr('goals.linked.done_when_you_earn_itvalue', 'Done when you earn it{{value}}', { value: plan?.title ? ` by finishing ${plan.title}` : '' })}</CardNote>
      </div>
    </div>
    {step.config.template_uuid && step.status !== 'completed' ? <Button asChild variant="surface" className="self-start"><Link href={getUriWithOrg(orgslug, routePaths.org.discoverPlan(step.config.template_uuid))}>{tr('goals.linked.see_the_plan', 'See the plan')}</Link></Button> : null}
    {props.staff ? <FinishControls {...props} finishesItself /> : null}
  </div>
}

/** Pick the plan whose badge counts: one of the organization's plans that earns a badge. */
function BadgeConfigPanel({ config, onChange, orgId, token }: ConfigPanelProps<'badge'>) {
  const { data: plans = [], isLoading } = useSWR(token && orgId ? templateKeys.list(orgId) : null, () => templatesApi.list(orgId as number, token), { revalidateOnFocus: false })
  const choices = plans.filter((plan) => plan.badge)
  const known = choices.some((plan) => plan.template_uuid === config.template_uuid)
  return <div className="flex flex-col gap-1">
    <Label htmlFor="step-badge">{tr('goals.linked.badge', 'Badge')}</Label>
    <select id="step-badge" value={config.template_uuid || ''} disabled={isLoading} onChange={(event) => onChange({ ...config, template_uuid: event.target.value })} className="h-9 rounded-xl border-2 border-border bg-background px-2 text-sm font-semibold">
      <option value="">{isLoading ? tr('goals.linked.loading_plans', 'Loading plans…') : tr('goals.linked.choose_a_plan_that_earns', 'Choose a plan that earns a badge')}</option>
      {config.template_uuid && !known && !isLoading ? <option value={config.template_uuid}>{tr('goals.linked.another_organization_s_plan', 'Another organization’s plan')}</option> : null}
      {choices.map((plan) => <option key={plan.template_uuid} value={plan.template_uuid}>{plan.badge?.name || plan.title}{plan.badge?.name && plan.badge.name !== plan.title ? ` (${plan.title})` : ''}</option>)}
    </select>
  </div>
}

export const badge: StepDefinition<'badge'> = {
  type: 'badge',
  get label() { return tr('goals.linked.badge', 'Badge') },
  color: '#A47100',
  get hint() { return tr('goals.linked.earning_the_badge_of_another', 'Earning the badge of another plan counts as this step.') },
  get example() { return tr('lit.linked.earn_the_workplace_ready_badge', 'Earn the Workplace Ready badge') },
  icon: Award,
  CardBody: BadgeCard,
  ConfigPanel: BadgeConfigPanel,
  defaultConfig: () => ({ template_uuid: '' }),
  finishesItself: true,
}

export const PORTFOLIO_CHECKS: Record<PortfolioConfig['check'], string> = {
  get welcome() { return tr('lit.linked.write_your_welcome', 'Write your welcome') },
  get timeline() { return tr('lit.linked.add_to_your_timeline', 'Add to your timeline') },
  get project() { return tr('lit.linked.add_a_project', 'Add a project') },
  get traits() { return tr('lit.linked.choose_your_traits', 'Choose your traits') },
  get launch() { return tr('lit.linked.launch_your_portfolio', 'Launch your portfolio') },
  get badges() { return tr('lit.linked.show_your_badges', 'Show your badges') },
}

function PortfolioCard(props: StepCardProps<'portfolio'>) {
  const { step, orgslug } = props
  return <div className="flex flex-col gap-3">
    <StepIntro step={step} />
    <CardNote icon={BriefcaseBusiness}>{tr('goals.linked.value_this_finishes_itself_when', '{{value}}. This finishes itself when your portfolio has it.', { value: PORTFOLIO_CHECKS[step.config.check] })}</CardNote>
    {step.status !== 'completed' && !step.locked ? <Button asChild variant="surface" className="self-start"><Link href={getUriWithOrg(orgslug, routePaths.org.portfolio())}>{tr('goals.linked.open_my_portfolio', 'Open my portfolio')}</Link></Button> : null}
    {props.staff ? <FinishControls {...props} finishesItself /> : null}
  </div>
}

function PortfolioConfigPanel({ config, onChange }: ConfigPanelProps<'portfolio'>) {
  return <div className="flex flex-col gap-1">
    <Label>{tr('goals.linked.what_the_portfolio_needs', 'What the portfolio needs')}</Label>
    <select className="h-9 rounded-md border bg-transparent px-2 text-sm" value={config.check} onChange={(event) => onChange({ check: event.target.value as PortfolioConfig['check'] })}>
      {Object.entries(PORTFOLIO_CHECKS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
  </div>
}

export const portfolio: StepDefinition<'portfolio'> = {
  type: 'portfolio',
  get label() { return tr('goals.linked.portfolio', 'Portfolio') },
  color: '#46566B',
  get hint() { return tr('goals.linked.finish_a_section_of_their', 'Finish a section of their portfolio, like projects.') },
  get example() { return tr('lit.linked.add_two_projects_to_your', 'Add two projects to your portfolio') },
  icon: BriefcaseBusiness,
  statusLine: (step: Step<'portfolio'>) => PORTFOLIO_CHECKS[step.config.check] || null,
  CardBody: PortfolioCard,
  ConfigPanel: PortfolioConfigPanel,
  defaultConfig: () => ({ check: 'welcome' }),
  finishesItself: true,
}
