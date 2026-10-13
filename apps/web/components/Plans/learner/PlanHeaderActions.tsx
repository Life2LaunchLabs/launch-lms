'use client'

import React from 'react'
import { Award, MoreHorizontal, Pencil, UserPlus } from 'lucide-react'
import toast from 'react-hot-toast'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { getUriWithOrg } from '@services/config/config'
import { planningApi } from '@services/planning/planning'
import PlanShareDialog from '../PlanShareDialog'
import { PersonAvatar } from '../PlanEditorShared'

const chip = 'flex min-h-10 items-center gap-2 rounded-xl bg-black/15 px-3 text-xs font-bold text-[var(--plan-deep-ink)] transition hover:bg-black/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--plan-deep-ink)]'

/** Who a plan is shared with, Edit, and the plan's other actions, sitting on its header card. */
export default function PlanHeaderActions({ orgslug, detail, token, refresh, onBack, onEdit }: { orgslug: string; detail: any; token?: string; refresh: () => Promise<unknown>; onBack: () => void; onEdit?: () => void }) {
  const [shareOpen, setShareOpen] = React.useState(false)
  const can = (capability: string) => detail.capabilities?.includes(capability)
  const people = (detail.collaborators || []).filter((person: any) => !person.is_subject)
  const label = people.length === 1 ? `Shared with ${people[0].user?.name || '1 person'}` : people.length ? `Shared with ${people.length} people` : can('manage_collaborators') || can('request_collaborators') ? 'Share' : 'People with access'
  const badge = detail.source_badge
  React.useEffect(() => setShareOpen(false), [detail.plan_uuid])
  const status = async () => {
    if (detail.status !== 'completed' && detail.completed_objective_count < detail.objective_count && !window.confirm('Some steps are unfinished. Complete this plan anyway?')) return
    try { await planningApi.status(detail.slug, detail.status === 'completed' ? 'reopen' : 'complete', token); await refresh() } catch (error: any) { toast.error(error?.message || 'Could not update this plan') }
  }
  const remove = async () => {
    if (!window.confirm(`Delete “${detail.name}” and its progress?`)) return
    try { await planningApi.remove(detail.slug, token); await refresh(); onBack() } catch { toast.error('Could not delete this plan') }
  }
  const menu = can('complete_plan') || can('delete_plan') || badge
  return <div className="flex flex-wrap items-center gap-2">
    <button type="button" onClick={() => setShareOpen(true)} className={chip}>
      {people.length ? <span className="flex -space-x-2" aria-hidden="true">{people.slice(0, 3).map((person: any) => <span key={person.collaborator_uuid} className="rounded-full ring-2 ring-[var(--plan-deep)]"><PersonAvatar user={person.user} size="xs" /></span>)}</span> : <UserPlus size={15} aria-hidden="true" />}
      <span className="max-w-40 truncate">{label}</span>
    </button>
    <span className="flex-1" />
    {onEdit ? <button type="button" onClick={onEdit} className={chip}><Pencil size={14} aria-hidden="true" />Edit</button> : null}
    {menu ? <DropdownMenu>
      <DropdownMenuTrigger asChild><button type="button" aria-label="Plan actions" className={chip}><MoreHorizontal size={18} /></button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {badge ? <DropdownMenuItem asChild><a href={getUriWithOrg(orgslug, `/badges/${String(badge.badge_uuid).replace(/^badge_/, '')}`)}><Award size={14} className="mr-2" />View badge</a></DropdownMenuItem> : null}
        {can('complete_plan') ? <DropdownMenuItem onSelect={() => void status()}>{detail.status === 'completed' ? 'Reopen plan' : 'Complete plan'}</DropdownMenuItem> : null}
        {can('delete_plan') ? <DropdownMenuItem onSelect={() => void remove()} className="text-red-600">Delete plan</DropdownMenuItem> : null}
      </DropdownMenuContent>
    </DropdownMenu> : null}
    <PlanShareDialog detail={detail} token={token} refresh={refresh} onLeft={onBack} open={shareOpen} setOpen={setShareOpen} />
  </div>
}
