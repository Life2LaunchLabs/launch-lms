'use client'

import React from 'react'
import { MoreHorizontal, Pencil } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import PlanShareDialog from '../PlanShareDialog'
import { PersonAvatar } from '../PlanEditorShared'
import { planningApi } from '@services/planning/planning'
import StepOrderSetting from './StepOrderSetting'

export default function PlanHeaderActions({ detail, token, refresh, onBack, initialEditing = false, onEditFinished }: { detail: any; token?: string; refresh: () => Promise<unknown>; onBack: () => void; initialEditing?: boolean; onEditFinished?: () => void }) {
  const [shareOpen, setShareOpen] = React.useState(false)
  const [editing, setEditing] = React.useState(initialEditing)
  const [saving, setSaving] = React.useState(false)
  const [draft, setDraft] = React.useState({ name: detail.name, description: detail.description || '', due_date: detail.due_date?.slice(0, 10) || '', step_order: detail.step_order || 'any' })
  const can = (capability: string) => detail.capabilities?.includes(capability)
  const people = (detail.collaborators || []).filter((person: any) => !person.is_subject)
  const label = people.length === 1 ? `Shared with ${people[0].user?.name || '1 person'}` : people.length ? `Shared with ${people.length} people` : can('manage_collaborators') || can('request_collaborators') ? 'Share plan' : 'People with access'
  React.useEffect(() => { setEditing(initialEditing); setShareOpen(false); setDraft({ name: detail.name, description: detail.description || '', due_date: detail.due_date?.slice(0, 10) || '', step_order: detail.step_order || 'any' }) }, [detail.plan_uuid, detail.name, detail.description, detail.due_date, detail.step_order, initialEditing])
  const save = async () => {
    setSaving(true)
    try {
      await planningApi.update(detail.slug, { ...(can('edit_plan_details') ? { name: draft.name.trim(), description: draft.description } : {}), ...(can('edit_schedule') ? { due_date: draft.due_date || null } : {}), ...(can('edit_structure') ? { step_order: draft.step_order } : {}) }, token)
      onEditFinished?.(); await refresh(); setEditing(false); toast.success('Plan saved')
    } catch (error: any) { toast.error(error?.message || 'Could not save this plan') } finally { setSaving(false) }
  }
  const status = async () => {
    if (detail.status !== 'completed' && detail.completed_objective_count < detail.objective_count && !window.confirm('Some steps are unfinished. Complete this plan anyway?')) return
    try { await planningApi.status(detail.slug, detail.status === 'completed' ? 'reopen' : 'complete', token); await refresh() } catch (error: any) { toast.error(error?.message || 'Could not update this plan') }
  }
  return <div className="text-foreground">
    <div className="flex items-center justify-between gap-2 px-1 py-0">
      <button type="button" onClick={() => setShareOpen(true)} className="flex min-h-11 min-w-0 sm:min-h-9 items-center gap-2 rounded-lg text-xs font-medium focus-visible:outline focus-visible:outline-2">
        {people.length ? <span className="flex -space-x-2" aria-hidden="true">{people.slice(0, 3).map((person: any) => <span key={person.collaborator_uuid} className="rounded-full ring-2 ring-card"><PersonAvatar user={person.user} size="xs" /></span>)}</span> : null}
        <span className="truncate">{label}</span>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        {can('edit_plan_details') || can('edit_schedule') ? <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(!editing)} aria-expanded={editing}><Pencil size={14} />Details</Button> : null}
        {can('complete_plan') || can('delete_plan') ? <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Plan actions"><MoreHorizontal size={18} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
          {can('complete_plan') ? <DropdownMenuItem onSelect={() => void status()}>{detail.status === 'completed' ? 'Reopen plan' : 'Complete plan'}</DropdownMenuItem> : null}
          {can('delete_plan') ? <DropdownMenuItem onSelect={async () => { if (!window.confirm(`Delete “${detail.name}” and its progress?`)) return; try { await planningApi.remove(detail.slug, token); await refresh(); onBack() } catch { toast.error('Could not delete this plan') } }}>Delete plan</DropdownMenuItem> : null}
        </DropdownMenuContent></DropdownMenu> : null}
      </div>
    </div>
    {editing ? <form className="grid gap-3 border-t border-border p-4" onSubmit={(event) => { event.preventDefault(); void save() }}>
      {can('edit_plan_details') ? <><label className="grid gap-1 text-sm font-medium">Goal<input autoFocus={initialEditing} onFocus={(event) => { if (initialEditing) event.target.select() }} required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="h-10 rounded-lg border border-input bg-background px-3" /></label><label className="grid gap-1 text-sm font-medium">Description<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} className="min-h-20 rounded-lg border border-input bg-background p-3" /></label></> : null}
      {can('edit_schedule') ? <label className="grid gap-1 text-sm font-medium">Target date (optional)<input type="date" value={draft.due_date} onChange={(event) => setDraft({ ...draft, due_date: event.target.value })} className="h-10 rounded-lg border border-input bg-background px-3" /></label> : null}
      <StepOrderSetting detail={detail} value={draft.step_order} disabled={saving} onChange={(step_order) => setDraft({ ...draft, step_order })} />
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={saving} onClick={() => { setEditing(false); onEditFinished?.(); setDraft({ name: detail.name, description: detail.description || '', due_date: detail.due_date?.slice(0, 10) || '', step_order: detail.step_order || 'any' }) }}>Cancel</Button><Button type="submit" disabled={saving || !draft.name.trim()}>{saving ? 'Saving…' : 'Save changes'}</Button></div>
    </form> : null}
    <PlanShareDialog detail={detail} token={token} refresh={refresh} onLeft={onBack} open={shareOpen} setOpen={setShareOpen} />
  </div>
}
