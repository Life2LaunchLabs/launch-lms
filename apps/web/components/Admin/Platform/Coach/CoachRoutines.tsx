'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { Switch } from '@components/ui/switch'
import { Textarea } from '@components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { COACH_TIERS, coachAdminApi, type CoachPolicy, type CoachRoutine, type CoachRoutineWrite, type CoachTier } from '@services/coach/admin'
import { Panel, errorMessage, useCoachPolicy } from './CoachShell'

export const TIER_LABELS: Record<CoachTier, string> = { fast: 'Fast', standard: 'Standard', deep: 'Deep' }

export default function CoachRoutines({ policy }: { policy: CoachPolicy }) {
  const { mutate, token } = useCoachPolicy()
  const [editing, setEditing] = React.useState<string | null>(null)

  async function move(routine: CoachRoutine, by: number) {
    const group = policy.routines.filter((item) => item.trigger === routine.trigger)
    const index = group.indexOf(routine)
    const swap = group[index + by]
    const uuids = policy.routines.map((item) => item.routine_uuid)
    const a = uuids.indexOf(routine.routine_uuid)
    const b = uuids.indexOf(swap.routine_uuid)
    ;[uuids[a], uuids[b]] = [uuids[b], uuids[a]]
    try {
      await coachAdminApi.orderRoutines(uuids, token)
      await mutate()
    } catch (error) {
      toast.error(errorMessage(error, 'Could not reorder the routines.'))
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-gray-600">When one of these moments happens, Coach gets the instructions of every routine attached to it, after the Method and Knowledge. What each moment produces, such as a reply or a note, is fixed by Launch LMS; routines shape how Coach goes about it.</p>
      {policy.triggers.map((trigger) => {
        const routines = policy.routines.filter((routine) => routine.trigger === trigger.key)
        const adding = editing === `new:${trigger.key}`
        return (
          <Panel
            key={trigger.key}
            title={`When ${trigger.label.charAt(0).toLowerCase()}${trigger.label.slice(1)}`}
            description={trigger.detail}
            actions={<Button type="button" variant="outline" size="sm" onClick={() => setEditing(`new:${trigger.key}`)} disabled={adding}><Plus size={14} />Add routine</Button>}
          >
            <ol className="space-y-3">
              {adding ? <li><RoutineEditor initial={{ name: '', trigger: trigger.key, instructions: '', tier: trigger.tier, enabled: true }} onDone={() => setEditing(null)} /></li> : null}
              {routines.map((routine, index) => editing === routine.routine_uuid ? (
                <li key={routine.routine_uuid}><RoutineEditor uuid={routine.routine_uuid} initial={routine} onDone={() => setEditing(null)} /></li>
              ) : (
                <li key={routine.routine_uuid} className="rounded-xl border border-black/10 p-4">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-gray-950">
                        {routine.name}
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-700">{TIER_LABELS[routine.tier]}</span>
                        {!routine.enabled ? <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-500">Off</span> : null}
                      </p>
                      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-gray-700">{routine.instructions || <span className="text-gray-400">No instructions yet.</span>}</p>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => void move(routine, -1)} disabled={index === 0} aria-label={`Move ${routine.name} up`}><ArrowUp size={15} /></Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => void move(routine, 1)} disabled={index === routines.length - 1} aria-label={`Move ${routine.name} down`}><ArrowDown size={15} /></Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(routine.routine_uuid)} aria-label={`Edit ${routine.name}`}><Pencil size={15} /></Button>
                  </div>
                </li>
              ))}
            </ol>
            {!routines.length && !adding ? <p className="text-sm text-gray-500">No routines. Coach handles this moment with the Method and Knowledge alone, on the {TIER_LABELS[trigger.tier]} tier.</p> : null}
          </Panel>
        )
      })}
    </div>
  )
}

function RoutineEditor({ uuid, initial, onDone }: { uuid?: string; initial: CoachRoutineWrite; onDone: () => void }) {
  const { mutate, token } = useCoachPolicy()
  const [draft, setDraft] = React.useState<CoachRoutineWrite>({ name: initial.name, trigger: initial.trigger, instructions: initial.instructions, tier: initial.tier, enabled: initial.enabled })
  const [busy, setBusy] = React.useState<'save' | 'delete' | null>(null)
  const set = (patch: Partial<CoachRoutineWrite>) => setDraft((current) => ({ ...current, ...patch }))
  const id = uuid || `new-${initial.trigger}`

  async function save() {
    setBusy('save')
    try {
      if (uuid) await coachAdminApi.updateRoutine(uuid, draft, token)
      else await coachAdminApi.createRoutine(draft, token)
      await mutate()
      toast.success(`${draft.name.trim()} saved.`)
      onDone()
    } catch (error) {
      toast.error(errorMessage(error, 'Could not save the routine.'))
      setBusy(null)
    }
  }

  async function remove() {
    if (!uuid || !window.confirm(`Delete the ${initial.name} routine?`)) return
    setBusy('delete')
    try {
      await coachAdminApi.deleteRoutine(uuid, token)
      await mutate()
      toast.success('Routine deleted.')
      onDone()
    } catch (error) {
      toast.error(errorMessage(error, 'Could not delete the routine.'))
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-violet-200 bg-violet-50/40 p-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
        <label className="block"><span className="text-sm font-bold text-gray-900">Name</span>
          <Input value={draft.name} maxLength={200} onChange={(event) => set({ name: event.target.value })} placeholder="Celebrate the first step" className="mt-2 bg-white" /></label>
        <label className="block"><span className="text-sm font-bold text-gray-900">Model tier</span>
          <Select value={draft.tier} onValueChange={(tier) => set({ tier: tier as CoachTier })}>
            <SelectTrigger className="mt-2 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>{COACH_TIERS.map((tier) => <SelectItem key={tier} value={tier}>{TIER_LABELS[tier]}</SelectItem>)}</SelectContent>
          </Select></label>
      </div>
      <label className="block" htmlFor={`${id}-instructions`}><span className="text-sm font-bold text-gray-900">Instructions</span>
        <Textarea id={`${id}-instructions`} value={draft.instructions} maxLength={20000} rows={6} onChange={(event) => set({ instructions: event.target.value })} placeholder="What Coach should do or keep in mind at this moment." className="mt-2 resize-y bg-white leading-6" /></label>
      <p className="text-xs leading-5 text-gray-500">When several routines share a moment, Coach runs on the highest tier among them.</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-bold text-gray-900"><Switch checked={draft.enabled} onCheckedChange={(enabled) => set({ enabled })} />On</label>
          {uuid ? <Button type="button" variant="ghost" size="sm" onClick={() => void remove()} disabled={busy !== null}>{busy === 'delete' ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}Delete</Button> : null}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onDone} disabled={busy !== null}>Cancel</Button>
          <Button type="button" onClick={() => void save()} disabled={busy !== null || !draft.name.trim()}>{busy === 'save' ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}Save routine</Button>
        </div>
      </div>
    </div>
  )
}
