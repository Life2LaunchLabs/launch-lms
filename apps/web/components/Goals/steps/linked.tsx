'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Award, BriefcaseBusiness, Play } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Label } from '@components/ui/label'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { getLearningBadges } from '@services/learning/learning'
import type { PortfolioConfig, Step } from '@services/goals/types'
import type { ConfigPanelProps, StepCardProps, StepDefinition } from './registry'
import { CardNote, Feedback, FinishControls, StepIntro } from './shared'

// Activity, Badge and Portfolio steps finish on their own: a run, an award, a portfolio change.

function ActivityCard(props: StepCardProps<'activity'>) {
  const { step, actions, canWork } = props
  const started = step.status !== 'not_started'
  // Handed in counts as done here: the learner can look back at it while it waits on review.
  const done = step.status === 'completed' || step.status === 'excused' || step.status === 'submitted'
  return <div className="flex flex-col gap-3">
    <StepIntro step={step} />
    <Feedback step={step} />
    {step.reference?.page_count ? <CardNote icon={Play}>{step.reference.page_count} {step.reference.page_count === 1 ? 'page' : 'pages'}{started && !done ? ` · ${Math.round(step.fraction * 100)}% through` : ''}</CardNote> : null}
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {canWork && !step.locked ? <Button type="button" variant={done ? 'surface' : 'plan'} onClick={actions.openActivity}><Play size={15} aria-hidden="true" />{done ? 'Review' : started ? 'Continue' : 'Start'}</Button> : null}
      <FinishControls {...props} finishesItself />
    </div>
  </div>
}

function ActivityConfigPanel({ config }: ConfigPanelProps<'activity'>) {
  return <CardNote icon={Play}>{config.activity_uuid ? 'Edit the activity from the step in the template editor.' : 'Save the step to create its activity.'}</CardNote>
}

export const activity: StepDefinition<'activity'> = {
  type: 'activity',
  label: 'Activity',
  color: '#C9501E',
  hint: 'An interactive lesson or quiz played in the app.',
  example: 'Needs vs wants sorting game',
  icon: Play,
  statusLine: (step) => step.status === 'in_progress' ? `${Math.round(step.fraction * 100)}% through` : null,
  CardBody: ActivityCard,
  ConfigPanel: ActivityConfigPanel,
  defaultConfig: () => ({ activity_uuid: '' }),
  finishesItself: true,
}

function BadgeCard(props: StepCardProps<'badge'>) {
  const { step, orgslug } = props
  const badge = step.reference
  return <div className="flex flex-col gap-3">
    <StepIntro step={step} />
    <div className="flex items-center gap-3">
      {badge?.thumbnail_image ? <img src={badge.thumbnail_image} alt="" className="h-12 w-12 rounded-full object-cover" /> : <span className="grid h-12 w-12 place-items-center rounded-full bg-muted text-[var(--plan-accent)]"><Award size={22} /></span>}
      <div className="min-w-0">
        <p className="truncate font-bold">{badge?.title || 'Badge'}</p>
        <CardNote>{step.status === 'completed' ? 'Awarded' : 'Done when the badge is awarded'}</CardNote>
      </div>
    </div>
    {step.config.badge_uuid && step.status !== 'completed' ? <Button asChild variant="surface" className="self-start"><Link href={getUriWithOrg(orgslug, `/badges/${step.config.badge_uuid}`)}>Open the badge</Link></Button> : null}
    {props.staff ? <FinishControls {...props} finishesItself /> : null}
  </div>
}

type BadgeChoice = { badge_uuid: string; name?: string; title?: string; thumbnail_image?: string | null }

function BadgeConfigPanel({ config, onChange, orgId, token }: ConfigPanelProps<'badge'>) {
  const { data: badges = [], isLoading } = useSWR<BadgeChoice[]>(token ? ['goal-step-badges', orgId ?? '', token] : null, async () => {
    const response = await getLearningBadges(orgId ?? undefined, token)
    return Array.isArray(response) ? response : response?.data || []
  }, { revalidateOnFocus: false })
  const known = badges.some((item) => item.badge_uuid === config.badge_uuid)
  return <div className="flex flex-col gap-2">
    <div className="flex flex-col gap-1">
      <Label htmlFor="step-badge">Badge</Label>
      <select id="step-badge" value={config.badge_uuid || ''} disabled={isLoading} onChange={(event) => onChange({ ...config, badge_uuid: event.target.value })} className="h-9 rounded-xl border-2 border-border bg-background px-2 text-sm font-semibold">
        <option value="">{isLoading ? 'Loading badges…' : 'Choose a badge'}</option>
        {config.badge_uuid && !known && !isLoading ? <option value={config.badge_uuid}>A badge this organization can’t see</option> : null}
        {badges.map((item) => <option key={item.badge_uuid} value={item.badge_uuid}>{item.name || item.title || 'Untitled badge'}</option>)}
      </select>
    </div>
    <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={!!config.accept_previous_major_versions} onChange={(event) => onChange({ ...config, accept_previous_major_versions: event.target.checked })} />Earlier versions of the badge count</label>
  </div>
}

export const badge: StepDefinition<'badge'> = {
  type: 'badge',
  label: 'Badge',
  color: '#A47100',
  hint: 'Earning another badge counts as this step.',
  example: 'Earn the Workplace Ready badge',
  icon: Award,
  CardBody: BadgeCard,
  ConfigPanel: BadgeConfigPanel,
  defaultConfig: () => ({ badge_uuid: '' }),
  finishesItself: true,
}

export const PORTFOLIO_CHECKS: Record<PortfolioConfig['check'], string> = {
  welcome: 'Write your welcome',
  timeline: 'Add to your timeline',
  project: 'Add a project',
  traits: 'Choose your traits',
  launch: 'Launch your portfolio',
  badges: 'Show your badges',
}

function PortfolioCard(props: StepCardProps<'portfolio'>) {
  const { step, orgslug } = props
  return <div className="flex flex-col gap-3">
    <StepIntro step={step} />
    <CardNote icon={BriefcaseBusiness}>{PORTFOLIO_CHECKS[step.config.check]}. This finishes itself when your portfolio has it.</CardNote>
    {step.status !== 'completed' && !step.locked ? <Button asChild variant="surface" className="self-start"><Link href={getUriWithOrg(orgslug, routePaths.org.portfolio())}>Open my portfolio</Link></Button> : null}
    {props.staff ? <FinishControls {...props} finishesItself /> : null}
  </div>
}

function PortfolioConfigPanel({ config, onChange }: ConfigPanelProps<'portfolio'>) {
  return <div className="flex flex-col gap-1">
    <Label>What the portfolio needs</Label>
    <select className="h-9 rounded-md border bg-transparent px-2 text-sm" value={config.check} onChange={(event) => onChange({ check: event.target.value as PortfolioConfig['check'] })}>
      {Object.entries(PORTFOLIO_CHECKS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
  </div>
}

export const portfolio: StepDefinition<'portfolio'> = {
  type: 'portfolio',
  label: 'Portfolio',
  color: '#46566B',
  hint: 'Finish a section of their portfolio, like projects.',
  example: 'Add two projects to your portfolio',
  icon: BriefcaseBusiness,
  statusLine: (step: Step<'portfolio'>) => PORTFOLIO_CHECKS[step.config.check] || null,
  CardBody: PortfolioCard,
  ConfigPanel: PortfolioConfigPanel,
  defaultConfig: () => ({ check: 'welcome' }),
  finishesItself: true,
}
