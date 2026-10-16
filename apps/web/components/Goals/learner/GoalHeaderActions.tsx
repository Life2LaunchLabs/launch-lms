'use client'

import React from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { Award, BookOpen, MoreHorizontal, Sparkles, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import GoalShareDialog from '@components/Goals/share/GoalShareDialog'
import { getUriWithOrg } from '@services/config/config'
import { goalUrl, isGoalsKey } from '@services/goals/goals'
import { goalLifecycleApi } from '@services/goals/lifecycle'
import { can, type Goal, type PersonSummary } from '@services/goals/types'
import { getUserAvatarMediaDirectory } from '@services/media/media'
import { swrFetcher } from '@services/utils/ts/requests'
import type { GoalBadge } from './GoalHeader'

const chip = 'flex min-h-10 items-center gap-2 rounded-xl bg-black/15 px-3 text-xs font-bold text-[var(--plan-deep-ink)] transition hover:bg-black/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--plan-deep-ink)]'

type Person = { collaborator_uuid: string | null; user: PersonSummary | null; is_subject: boolean }

function Avatar({ user }: { user: PersonSummary | null }) {
  const src = user?.avatar_image ? (String(user.avatar_image).startsWith('http') ? user.avatar_image : getUserAvatarMediaDirectory(user.user_uuid || '', user.avatar_image)) : ''
  return src ? <img src={src} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
    : <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[8px] font-black text-background">{String(user?.name || '?').split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()}</span>
}

/** Who a goal is shared with, Edit, and the goal's other actions, sitting on its header card. */
export default function GoalHeaderActions({ orgslug, goal, badge, token, onBack, editing = false, onToggleEdit, coachWorking = false, waiting = 0, onPlanWithCoach }: {
  orgslug: string; goal: Goal; badge?: GoalBadge; token?: string; onBack: () => void; editing?: boolean; onToggleEdit?: () => void
  /** Coach has a session running on this goal. */
  coachWorking?: boolean
  /** Coach's suggestions waiting while Edit is off. */
  waiting?: number
  onPlanWithCoach?: () => void
}) {
  const { mutate } = useSWRConfig()
  const [shareOpen, setShareOpen] = React.useState(false)
  const { data: people } = useSWR<{ collaborators: Person[] }>(token ? goalUrl(goal.goal_uuid, '/people') : null, (url: string) => swrFetcher(url, token))
  const others = (people?.collaborators || []).filter((person) => !person.is_subject)
  const label = others.length === 1 ? `Shared with ${others[0].user?.name || '1 person'}` : others.length ? `Shared with ${others.length} people` : can(goal, 'manage_collaborators') || can(goal, 'request_collaborators') ? 'Share' : 'People with access'
  const personal = goal.ownership === 'personal'
  const finished = goal.status === 'finished' || goal.status === 'archived'
  React.useEffect(() => setShareOpen(false), [goal.goal_uuid])
  const refresh = () => mutate((key) => isGoalsKey(key))

  const finishOrReopen = async () => {
    if (!finished && goal.progress.done < goal.progress.total && !window.confirm('Some steps are unfinished. Finish this goal anyway?')) return
    try { await (finished ? goalLifecycleApi.reopen : goalLifecycleApi.finish)(goal.goal_uuid, token); await refresh() } catch (error: any) { toast.error(error?.message || 'Could not update this goal') }
  }
  const remove = async () => {
    if (!window.confirm(`Delete “${goal.title}” and its progress?`)) return
    try { await goalLifecycleApi.remove(goal.goal_uuid, token); onBack(); await refresh() } catch (error: any) { toast.error(error?.message || 'Could not delete this goal') }
  }
  const canFinish = personal && can(goal, 'edit_plan_details')
  const canDelete = personal && can(goal, 'delete_plan')
  return <div className="flex flex-wrap items-center gap-2">
    <button type="button" onClick={() => setShareOpen(true)} className={chip}>
      {others.length ? <span className="flex -space-x-2" aria-hidden="true">{others.slice(0, 3).map((person, index) => <span key={person.collaborator_uuid || `owner-${index}`} className="rounded-full ring-2 ring-[var(--plan-deep)]"><Avatar user={person.user} /></span>)}</span> : <UserPlus size={15} aria-hidden="true" />}
      <span className="max-w-40 truncate">{label}</span>
    </button>
    <span className="flex-1" />
    {coachWorking ? <span className="flex min-h-10 items-center gap-1.5 px-1 text-xs font-bold text-[var(--plan-deep-ink)]" title="Coach’s suggestions show on the goal as you edit">
      <Sparkles size={14} aria-hidden="true" className="animate-pulse motion-reduce:animate-none" />Coach is working with you
    </span> : null}
    {onToggleEdit ? <button type="button" role="switch" aria-checked={editing} onClick={onToggleEdit} className={chip}>
      <span aria-hidden="true" className={cn('relative h-4 w-7 rounded-full transition-colors', editing ? 'bg-[var(--plan-deep-ink)]' : 'bg-black/25')}>
        <span className={cn('absolute top-0.5 h-3 w-3 rounded-full transition-all', editing ? 'left-3.5 bg-[var(--plan-deep)]' : 'left-0.5 bg-[var(--plan-deep-ink)]')} />
      </span>Edit
      {waiting ? <span className="rounded-full bg-[var(--plan-deep-ink)] px-1.5 text-[10px] text-[var(--plan-deep)]" title={`${waiting} of Coach’s suggestions are waiting`}>{waiting}<span className="sr-only"> suggestions waiting</span></span> : null}
    </button> : null}
    {badge?.badge_uuid || canFinish || canDelete || onPlanWithCoach || goal.status === 'finished' ? <DropdownMenu>
      <DropdownMenuTrigger asChild><button type="button" aria-label="Goal actions" className={chip}><MoreHorizontal size={18} /></button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onPlanWithCoach ? <DropdownMenuItem onSelect={onPlanWithCoach}><Sparkles size={14} className="mr-2" />Plan with Coach</DropdownMenuItem> : null}
        {badge?.badge_uuid ? <DropdownMenuItem asChild><a href={getUriWithOrg(orgslug, `/badges/${String(badge.badge_uuid).replace(/^badge_/, '')}`)}><Award size={14} className="mr-2" />View badge</a></DropdownMenuItem> : null}
        {goal.status === 'finished' ? <DropdownMenuItem asChild><a href={getUriWithOrg(orgslug, `/plans/${encodeURIComponent(goal.goal_uuid)}/story`)}><BookOpen size={14} className="mr-2" />Watch your story</a></DropdownMenuItem> : null}
        {canFinish ? <DropdownMenuItem onSelect={() => void finishOrReopen()}>{finished ? 'Reopen goal' : 'Finish goal'}</DropdownMenuItem> : null}
        {canDelete ? <DropdownMenuItem onSelect={() => void remove()} className="text-red-600">Delete goal</DropdownMenuItem> : null}
      </DropdownMenuContent>
    </DropdownMenu> : null}
    <GoalShareDialog goal={goal} token={token} open={shareOpen} setOpen={setShareOpen} onLeft={onBack} />
  </div>
}
