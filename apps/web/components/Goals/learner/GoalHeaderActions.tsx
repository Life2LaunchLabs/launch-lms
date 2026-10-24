'use client'

import React from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { Award, BookOpen, MoreHorizontal, Settings2, Sparkles, UserPlus, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { useGoalEditing } from '@components/Goals/edit/GoalEditing'
import GoalShareDialog from '@components/Goals/share/GoalShareDialog'
import { GoalChatChip } from '@components/Goals/chat/GoalChat'
import { getUriWithOrg, routePaths } from '@services/config/config'
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

/** Who a goal is shared with, its settings, and the goal's other actions, sitting on its header card. */
export default function GoalHeaderActions({ orgslug, goal, badge, token, onBack, coachWorking = false, onEndCoach, onPlanWithCoach }: {
  orgslug: string; goal: Goal; badge?: GoalBadge; token?: string; onBack: () => void
  /** Coach has a session running on this goal. */
  coachWorking?: boolean
  onEndCoach?: () => void
  onPlanWithCoach?: () => void
}) {
  const { mutate } = useSWRConfig()
  // The goal's settings (name, why, icon, colour, dates) open in a sheet, for whoever can change them.
  const editing = useGoalEditing()
  const onSettings = editing && (can(goal, 'edit_plan_details') || can(goal, 'edit_schedule')) ? () => editing.open({ kind: 'settings' }) : undefined
  const [shareOpen, setShareOpen] = React.useState(false)
  const { data: people } = useSWR<{ collaborators: Person[] }>(token ? goalUrl(goal.goal_uuid, '/people') : null, (url: string) => swrFetcher(url, token))
  const others = (people?.collaborators || []).filter((person) => !person.is_subject)
  const label = others.length === 1 ? `Shared with ${others[0].user?.name || '1 person'}` : others.length ? `Shared with ${others.length} people` : can(goal, 'manage_collaborators') || can(goal, 'request_collaborators') ? 'Share' : 'People with access'
  const personal = goal.ownership === 'personal'
  const finished = goal.status === 'finished' || goal.status === 'archived'
  React.useEffect(() => setShareOpen(false), [goal.goal_uuid])
  const refresh = () => mutate((key) => isGoalsKey(key))

  // Finishing is the goal's last step; the menu only reopens a finished goal.
  const reopen = async () => {
    try { await goalLifecycleApi.reopen(goal.goal_uuid, token); await refresh() } catch (error: any) { toast.error(error?.message || 'Could not reopen this goal') }
  }
  const remove = async () => {
    if (!window.confirm(`Delete “${goal.title}” and its progress?`)) return
    try { await goalLifecycleApi.remove(goal.goal_uuid, token); onBack(); await refresh() } catch (error: any) { toast.error(error?.message || 'Could not delete this goal') }
  }
  const canReopen = finished && personal && can(goal, 'edit_plan_details')
  const canDelete = personal && can(goal, 'delete_plan')
  return <div className="flex flex-wrap items-center gap-2">
    <button type="button" onClick={() => setShareOpen(true)} className={chip}>
      {others.length ? <span className="flex -space-x-2" aria-hidden="true">{others.slice(0, 3).map((person, index) => <span key={person.collaborator_uuid || `owner-${index}`} className="rounded-full ring-2 ring-[var(--plan-deep)]"><Avatar user={person.user} /></span>)}</span> : <UserPlus size={15} aria-hidden="true" />}
      <span className="max-w-40 truncate">{label}</span>
    </button>
    <GoalChatChip className={chip} />
    <span className="flex-1" />
    {coachWorking ? <span className="flex min-h-10 items-center gap-1.5 px-1 text-xs font-bold text-[var(--plan-deep-ink)]" title="Coach’s suggestions show on the goal; ones you haven’t reviewed stay after the session ends">
      <Sparkles size={14} aria-hidden="true" className="animate-pulse motion-reduce:animate-none" />Coach is working with you
      {onEndCoach ? <button type="button" onClick={onEndCoach} aria-label="End Coach’s session" className="ml-1 flex h-7 w-7 items-center justify-center rounded-lg bg-black/15 hover:bg-black/25"><X size={13} aria-hidden="true" /></button> : null}
    </span> : null}
    {onSettings ? <button type="button" onClick={onSettings} aria-label="Goal settings" className={chip}><Settings2 size={16} aria-hidden="true" /></button> : null}
    {badge || canReopen || canDelete || onPlanWithCoach || goal.status === 'finished' ? <DropdownMenu>
      <DropdownMenuTrigger asChild><button type="button" aria-label="Goal actions" className={chip}><MoreHorizontal size={18} /></button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onPlanWithCoach ? <DropdownMenuItem onSelect={onPlanWithCoach}><Sparkles size={14} className="mr-2" />Plan with Coach</DropdownMenuItem> : null}
        {badge ? <DropdownMenuItem asChild><a href={getUriWithOrg(orgslug, routePaths.org.discoverPlan(badge.template_uuid))}><Award size={14} className="mr-2" />View badge</a></DropdownMenuItem> : null}
        {goal.status === 'finished' ? <DropdownMenuItem asChild><a href={getUriWithOrg(orgslug, `/plans/${encodeURIComponent(goal.goal_uuid)}/story`)}><BookOpen size={14} className="mr-2" />Watch your story</a></DropdownMenuItem> : null}
        {canReopen ? <DropdownMenuItem onSelect={() => void reopen()}>Reopen goal</DropdownMenuItem> : null}
        {canDelete ? <DropdownMenuItem onSelect={() => void remove()} className="text-red-600">Delete goal</DropdownMenuItem> : null}
      </DropdownMenuContent>
    </DropdownMenu> : null}
    <GoalShareDialog goal={goal} token={token} open={shareOpen} setOpen={setShareOpen} onLeft={onBack} />
  </div>
}
