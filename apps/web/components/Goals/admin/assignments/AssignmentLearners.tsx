'use client'

import React from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ChevronRight, Loader2, Search, Users } from 'lucide-react'
import { GoalChatProvider, useGoalChat } from '@components/Goals/chat/GoalChat'
import { getUriWithOrg, routePaths } from '@services/config/config'
import type { AssignmentMatrix, MatrixLearner } from '@services/goals/admin'
import { attentionOf, byNeed, currentStage, dayOf, dotOf, helpersOf, paceLabel, paceOf, type Dot } from '@services/goals/cohort'
import { goalsApi, goalUrl } from '@services/goals/goals'
import type { Goal } from '@services/goals/types'
import { cn } from '@/lib/utils'
import RequirementEvidenceExport from '../live/RequirementEvidenceExport'
import { EmptyState, PersonAvatar, personName } from '../live/ui'
import { Chip } from './shared'

export const DOT_LOOK: Record<Dot, { cls: string; label: string }> = {
  done: { cls: 'bg-green-600', label: 'Done' },
  waiting: { cls: 'bg-blue-500', label: 'Handed in' },
  retry: { cls: 'bg-amber-500', label: 'Sent back' },
  late: { cls: 'bg-red-500', label: 'Past due' },
  open: { cls: 'bg-background ring-1 ring-inset ring-gray-400', label: 'Open' },
  locked: { cls: 'bg-gray-200', label: 'Not open yet' },
}
const PACE_TONE = { ahead: 'blue', on_pace: 'green', behind: 'red' } as const
const ATTENTION_TONE = { waiting: 'blue', retry: 'amber', late: 'red' } as const

/**
 * The assignment's learners, the ones who need the most help first. Each row shows a dot per
 * step by stage, their pace, what needs attention, and who else is helping on their plan.
 * A row opens that learner's plan feed beside the list.
 */
export default function AssignmentLearners({ matrix, orgslug, orgId, token }: { matrix: AssignmentMatrix; orgslug: string; orgId: number; token?: string }) {
  const [query, setQuery] = React.useState('')
  const [open, setOpen] = React.useState<string | null>(null)
  const today = dayOf(new Date())
  const stages = matrix.stages
  const staffIds = matrix.assignment.staff_user_ids || []
  const sorted = React.useMemo(() => byNeed(matrix.learners, stages, today, personName), [matrix.learners, stages, today])
  const needle = query.trim().toLowerCase()
  const learners = needle ? sorted.filter((learner) => [personName(learner), learner.username, learner.first_name, learner.last_name].some((value) => value?.toLowerCase().includes(needle))) : sorted
  const paces = matrix.learners.map((learner) => paceOf(learner, stages, today).pace)
  const stage = currentStage(stages, today)
  const count = (pace: string) => paces.filter((item) => item === pace).length

  if (!matrix.learners.length) return <EmptyState icon={<Users size={34} />} title="No learners yet" detail={matrix.assignment.assignment_type === 'group' ? 'People who join the group get this plan.' : 'The learner gets this plan once they accept.'} />
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <p className="text-sm text-muted-foreground">
        {stage ? <><b className="text-foreground">{stage.title}</b> now · </> : null}
        {count('behind') ? <span className="font-semibold text-red-700">{count('behind')} behind</span> : '0 behind'} · {count('on_pace')} on pace{count('ahead') ? ` · ${count('ahead')} ahead` : ''}
      </p>
      <span className="flex-1" />
      <label className="relative flex items-center">
        <Search size={14} className="absolute left-2.5 text-muted-foreground" aria-hidden="true" />
        <input aria-label="Search learners" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${matrix.learners.length} learners`}
          className="h-9 w-56 rounded-lg border border-input bg-background pl-8 pr-3 text-[13px]" />
      </label>
      <RequirementEvidenceExport orgId={orgId} token={token} scope={{ assignment_uuid: matrix.assignment.assignment_uuid, user_ids: learners.filter((learner) => learner.id > 0).map((learner) => learner.id) }} />
    </div>
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
      {Object.entries(DOT_LOOK).map(([dot, look]) => <span key={dot} className="inline-flex items-center gap-1.5"><span className={cn('h-2.5 w-2.5 rounded-full', look.cls)} />{look.label}</span>)}
    </p>
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs" aria-label="Learners">
      {learners.map((learner) => <LearnerRow key={learner.goal_uuid} learner={learner} matrix={matrix} today={today} staffIds={staffIds} selected={open === learner.goal_uuid} onOpen={() => setOpen(learner.goal_uuid)} />)}
      {!learners.length ? <li className="p-8 text-center text-sm text-muted-foreground">Nobody matches “{query}”.</li> : null}
    </ul>
    {open ? <LearnerFeed key={open} goalUuid={open} orgslug={orgslug} orgId={orgId} token={token} onClose={() => setOpen(null)} /> : null}
  </div>
}

function LearnerRow({ learner, matrix, today, staffIds, selected, onOpen }: { learner: MatrixLearner; matrix: AssignmentMatrix; today: string; staffIds: number[]; selected: boolean; onOpen: () => void }) {
  const pace = paceOf(learner, matrix.stages, today)
  const attention = attentionOf(learner, matrix.stages, today)
  const helpers = helpersOf(learner, staffIds)
  const name = personName(learner)
  return <li>
    <button type="button" onClick={onOpen} aria-label={`Open ${name}’s plan feed`} aria-pressed={selected}
      className={cn('flex w-full flex-wrap items-center gap-x-4 gap-y-2 p-4 text-left transition hover:bg-muted/50', selected && 'bg-muted/60')}>
      <span className="flex min-w-0 flex-1 basis-48 items-center gap-3">
        <PersonAvatar person={learner} size={32} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-black">{name}</span>
          {helpers.length ? <span className="block truncate text-xs text-muted-foreground">{helpers.map((person) => `${personName(person)} · ${person.role}`).join(', ')}</span> : null}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-2.5" aria-label="Steps">
        {matrix.stages.map((stage) => <span key={stage.stage_key} className="flex gap-1" title={stage.title}>
          {stage.steps.map((column) => {
            const dot = dotOf(learner.cells[column.template_key], stage, today)
            return <span key={column.template_key} title={`${column.title}: ${DOT_LOOK[dot].label}`} className={cn('h-2.5 w-2.5 rounded-full', DOT_LOOK[dot].cls)} />
          })}
        </span>)}
      </span>
      <span className="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-1.5 sm:w-80 sm:flex-nowrap">
        {attention ? <Chip tone={ATTENTION_TONE[attention.tone]} className="min-w-0 max-w-full shrink"><span className="min-w-0 truncate" title={attention.text}>{attention.text}</span></Chip> : null}
        <Chip tone={PACE_TONE[pace.pace]}>{paceLabel(pace)}</Chip>
      </span>
      <ChevronRight size={16} className="hidden shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
    </button>
  </li>
}

/** One learner's plan feed, docked beside the list: their chat about the plan, with staff notes. */
function LearnerFeed({ goalUuid, orgslug, orgId, token, onClose }: { goalUuid: string; orgslug: string; orgId: number; token?: string; onClose: () => void }) {
  const { data: goal, error } = useSWR<Goal>(token ? goalUrl(goalUuid) : null, () => goalsApi.get(goalUuid, token), { revalidateOnFocus: false })
  if (error) return <p role="status" className="text-sm text-red-700">That learner’s plan didn’t load. <Link className="font-bold underline" href={getUriWithOrg(orgslug, routePaths.org.admin.livePlan(goalUuid))}>Open it</Link></p>
  if (!goal) return <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" />Opening their feed…</p>
  return <GoalChatProvider scope={{ goal }} token={token} orgslug={orgslug} staffOrgId={orgId} onClose={onClose}
    onOpenPlan={(uuid, step) => window.location.assign(`${getUriWithOrg(orgslug, routePaths.org.admin.livePlan(uuid))}${step ? `#step-${step}` : ''}`)}>
    <OpenWhenReady planHref={getUriWithOrg(orgslug, routePaths.org.admin.livePlan(goalUuid))} />
  </GoalChatProvider>
}

/** Opens the feed as soon as the learner's chat has loaded; says so if it never does. */
function OpenWhenReady({ planHref }: { planHref: string }) {
  const chat = useGoalChat()
  const opened = React.useRef(false)
  const [late, setLate] = React.useState(false)
  React.useEffect(() => {
    if (chat && !opened.current) { opened.current = true; chat.open(null) }
  }, [chat])
  React.useEffect(() => {
    const timer = window.setTimeout(() => setLate(true), 8_000)
    return () => window.clearTimeout(timer)
  }, [])
  if (chat) return null
  // A plan whose feed staff can't read (a personal plan they weren't added to) never gets a chat.
  return late ? <p role="status" className="text-sm text-muted-foreground">Their feed isn’t available to you. <Link className="font-bold underline" href={planHref}>Open their plan</Link></p>
    : <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" />Opening their feed…</p>
}
