'use client'

import React from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Loader2, Pencil, Play, Plus } from 'lucide-react'
import { programsApi } from '@services/programs/programs'
import { getUriWithOrg } from '@services/config/config'
import { useOrg } from '@components/Contexts/OrgContext'

const SCHEDULE = { default_start_rule: 'phase_start', default_due_rule: 'phase_end', default_allow_late: false }

/** A template objective that plays an interactive activity: its title, sign-off rule and a way into the editor. */
export function TemplateActivityCard({ objective, orgId, token, programUuid, refresh }: { objective: any; orgId: number; token?: string; programUuid: string; refresh: () => Promise<unknown> }) {
  const org = useOrg() as any
  const [title, setTitle] = React.useState(objective.title)
  const [saving, setSaving] = React.useState(false)
  const signOff = !objective.allow_learner_confirmation
  const save = async (patch: { title?: string; signOff?: boolean }) => {
    setSaving(true)
    try {
      await programsApi.updateObjective(orgId, programUuid, objective.objective_uuid, {
        title: (patch.title ?? objective.title).trim(), description: objective.description || '', custom_fields: [],
        allow_learner_confirmation: !(patch.signOff ?? signOff), ...SCHEDULE, suggested_due_week: objective.suggested_due_week ?? null,
      }, token)
      await refresh()
    } catch (error: any) { toast.error(error?.message || 'Could not update the activity step.') } finally { setSaving(false) }
  }
  const activityUuid = String(objective.activity?.activity_uuid || '').replace(/^learning_activity_/, '')
  const pages = Number(objective.activity?.page_count || 0)
  return <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-xs">
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white" aria-hidden="true"><Play size={20} fill="currentColor" /></span>
    <div className="min-w-[12rem] flex-1">
      <input aria-label="Activity step title" value={title} onChange={(event) => setTitle(event.target.value)} onBlur={() => { if (title.trim() && title !== objective.title) void save({ title }) }}
        className="w-full rounded-md bg-transparent px-1 py-0.5 text-sm font-black outline-none focus:bg-muted" />
      <p className="mt-0.5 px-1 text-xs text-muted-foreground">Activity · {pages ? `${pages} page${pages === 1 ? '' : 's'}` : 'No pages yet'}</p>
    </div>
    <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
      <input type="checkbox" checked={signOff} disabled={saving} onChange={(event) => save({ signOff: event.target.checked })} />
      Reviewer signs off
    </label>
    {saving ? <Loader2 size={15} className="animate-spin text-muted-foreground" /> : null}
    {activityUuid ? <Link href={getUriWithOrg(org?.slug || '', `/admin/plans/${programUuid}/activity/${activityUuid}`)} className="inline-flex items-center gap-1.5 rounded-lg bg-black px-3 py-2 text-xs font-bold text-white"><Pencil size={13} />Edit activity</Link> : null}
  </div>
}

/** Adds an activity step to a template phase. Its pages are written next, in the activity editor. */
export function NewTemplateActivity({ orgId, token, programUuid, phaseUuid, refresh }: { orgId: number; token?: string; programUuid: string; phaseUuid: string; refresh: () => Promise<unknown> }) {
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const add = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await programsApi.addObjective(orgId, programUuid, { kind: 'activity', title: title.trim(), description: '', phase_uuid: phaseUuid, allow_learner_confirmation: true, custom_fields: [], ...SCHEDULE }, token)
      await refresh()
      setTitle('')
      setOpen(false)
      toast.success('Activity added. Open it to write its pages.')
    } catch (error: any) { toast.error(error?.message || 'Could not add the activity.') } finally { setSaving(false) }
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-dashed border-border text-xs font-bold text-muted-foreground transition hover:border-foreground hover:bg-muted hover:text-foreground"><Play size={14} />Add activity</button>
  return <form onSubmit={(event) => { event.preventDefault(); void add() }} className="flex flex-1 flex-wrap items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/40 p-2">
    <input autoFocus aria-label="Activity title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What the learner will do" className="h-9 min-w-[12rem] flex-1 rounded-md border border-border bg-card px-3 text-sm" />
    <button type="submit" disabled={saving || !title.trim()} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-black px-3 text-xs font-bold text-white disabled:opacity-50">{saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}Add</button>
    <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-md px-3 text-xs font-bold text-muted-foreground hover:bg-card">Cancel</button>
  </form>
}
