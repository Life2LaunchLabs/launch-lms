'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { Check } from 'lucide-react'
import { Button } from '@components/ui/button'
import { planningApi } from '@services/planning/planning'
import { cn } from '@/lib/utils'
import { PLAN_PALETTES, planPalette, planVars } from '../learner/planColors'
import StepOrderSetting from '../learner/StepOrderSetting'
import PlanStepsEditor from './PlanStepsEditor'

const field = 'h-11 w-full rounded-xl border-2 border-border bg-background px-3 text-sm outline-none transition focus:border-[var(--plan-face)]'

/**
 * Editing a plan in one place: its goal, details, schedule and color on top, its chapters
 * and steps below. Steps save as they change; the details save with Save changes.
 */
// eslint-disable-next-line no-unused-vars
export default function PlanEditMode({ detail, orgslug, token, viewerUserId, refresh, color, setPlanColor, focusGoal = false, onDone, selectedObjectiveUuid, setSelectedObjectiveUuid }: { detail: any; orgslug: string; token?: string; viewerUserId?: number; refresh: () => Promise<unknown>; color: string; setPlanColor?: (planUuid: string, color: string) => void; focusGoal?: boolean; onDone: () => void; selectedObjectiveUuid: string; setSelectedObjectiveUuid: (uuid: string) => void }) {
  const can = (capability: string) => detail.capabilities?.includes(capability)
  const initial = React.useMemo(() => ({ name: detail.name, description: detail.description || '', due_date: detail.due_date?.slice(0, 10) || '', step_order: detail.step_order || 'any' }), [detail.name, detail.description, detail.due_date, detail.step_order])
  const [draft, setDraft] = React.useState(initial)
  const [saving, setSaving] = React.useState(false)
  const current = planPalette(color)
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)

  const save = async () => {
    if (!draft.name.trim()) return
    if (!dirty) { onDone(); return }
    setSaving(true)
    try {
      await planningApi.update(detail.slug, { ...(can('edit_plan_details') ? { name: draft.name.trim(), description: draft.description } : {}), ...(can('edit_schedule') ? { due_date: draft.due_date || null } : {}), ...(can('edit_structure') ? { step_order: draft.step_order } : {}) }, token)
      await refresh(); toast.success('Plan saved'); onDone()
    } catch (error: any) { toast.error(error?.message || 'Could not save this plan') } finally { setSaving(false) }
  }

  return <div data-plan="" style={planVars(color)} className="flex flex-col gap-8">
    <form aria-label="Plan details" onSubmit={(event) => { event.preventDefault(); void save() }} className="flex flex-col gap-4 rounded-3xl border-2 border-border border-t-[6px] border-t-[var(--plan-face)] bg-card p-5">
      {can('edit_plan_details') ? <>
        <label className="grid gap-1.5 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Goal
          <input autoFocus={focusGoal} onFocus={(event) => { if (focusGoal) event.target.select() }} required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={cn(field, 'text-lg font-extrabold normal-case tracking-normal text-foreground')} />
        </label>
        <label className="grid gap-1.5 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Description
          <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="What this plan is for" className={cn(field, 'h-auto min-h-20 py-2 font-normal normal-case tracking-normal text-foreground')} />
        </label>
      </> : <h1 className="text-2xl font-extrabold">{detail.name}</h1>}
      <div className="grid gap-4 sm:grid-cols-2">
        {can('edit_schedule') ? <label className="grid gap-1.5 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Target date (optional)
          <input type="date" value={draft.due_date} onChange={(event) => setDraft({ ...draft, due_date: event.target.value })} className={cn(field, 'font-normal normal-case tracking-normal text-foreground')} />
        </label> : null}
        {setPlanColor ? <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Color</legend>
          <div className="flex flex-wrap gap-2">{PLAN_PALETTES.map((palette) => <button key={palette.key} type="button" aria-label={palette.label} aria-pressed={palette.key === current.key} onClick={() => setPlanColor(detail.plan_uuid, palette.face)} className="flex h-9 w-9 items-center justify-center rounded-full shadow-[0_3px_0_var(--swatch-edge)]" style={{ backgroundColor: palette.face, color: palette.faceInk, '--swatch-edge': palette.edge } as React.CSSProperties}>{palette.key === current.key ? <Check size={16} strokeWidth={3} /> : null}</button>)}</div>
        </fieldset> : null}
      </div>
      <StepOrderSetting detail={detail} value={draft.step_order} disabled={saving} onChange={(step_order) => setDraft({ ...draft, step_order })} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" disabled={saving} onClick={() => { setDraft(initial); onDone() }}>Cancel</Button>
        <Button type="submit" variant="plan" disabled={saving || !draft.name.trim()}>{saving ? 'Saving…' : 'Save changes'}</Button>
      </div>
    </form>
    <section aria-label="Steps" className="flex flex-col gap-4">
      <div><h2 className="text-xl font-extrabold">Steps</h2><p className="text-sm text-muted-foreground">Drag to reorder. Step changes save as you go.</p></div>
      <PlanStepsEditor detail={detail} orgslug={orgslug} token={token} viewerUserId={viewerUserId} refresh={refresh} color={color} selectedObjectiveUuid={selectedObjectiveUuid} setSelectedObjectiveUuid={setSelectedObjectiveUuid} />
    </section>
  </div>
}
