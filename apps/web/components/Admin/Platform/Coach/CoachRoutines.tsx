'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { Loader2, Save } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Textarea } from '@components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select'
import { COACH_TIERS, coachAdminApi, type CoachPolicy, type CoachRoutine, type CoachTier, type CoachTrigger } from '@services/coach/admin'
import { Panel, errorMessage, useCoachPolicy } from './CoachShell'

export const TIER_LABELS: Record<CoachTier, string> = { fast: 'Fast', standard: 'Standard', deep: 'Deep' }

export default function CoachRoutines({ policy }: { policy: CoachPolicy }) {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-gray-600">Each moment has one routine: instructions Coach gets when it happens, after Knowledge, and the model tier it runs on. What each moment produces, such as a reply or a note, is fixed by Launch LMS; the routine shapes how Coach goes about it.</p>
      {policy.triggers.map((trigger) => (
        <RoutineEditor key={`${trigger.key}:${policy.routines[trigger.key]?.instructions}:${policy.routines[trigger.key]?.tier}`} trigger={trigger} saved={policy.routines[trigger.key] || { instructions: '', tier: trigger.tier }} />
      ))}
    </div>
  )
}

function RoutineEditor({ trigger, saved }: { trigger: CoachTrigger; saved: CoachRoutine }) {
  const { mutate, token } = useCoachPolicy()
  const [draft, setDraft] = React.useState<CoachRoutine>(saved)
  const [busy, setBusy] = React.useState(false)
  const dirty = draft.instructions.trim() !== saved.instructions || draft.tier !== saved.tier
  const id = `routine-${trigger.key}`

  async function save() {
    setBusy(true)
    try {
      await mutate(await coachAdminApi.update({ routines: { [trigger.key]: draft } }, token), { revalidate: false })
      toast.success('Routine saved. Release the draft to give it to learners.')
    } catch (error) {
      toast.error(errorMessage(error, 'Could not save the routine.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel
      title={`When ${trigger.label.charAt(0).toLowerCase()}${trigger.label.slice(1)}`}
      description={trigger.detail}
      actions={<Button type="button" size="sm" onClick={() => void save()} disabled={busy || !dirty}>{busy ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}Save</Button>}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
        <label className="block" htmlFor={`${id}-instructions`}><span className="text-sm font-bold text-gray-900">Instructions</span>
          <Textarea id={`${id}-instructions`} value={draft.instructions} maxLength={20000} rows={4} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} placeholder="What Coach should do or keep in mind at this moment. Leave empty to use Knowledge alone." className="mt-2 resize-y leading-6" /></label>
        <label className="block"><span className="text-sm font-bold text-gray-900">Model tier</span>
          <Select value={draft.tier} onValueChange={(tier) => setDraft({ ...draft, tier: tier as CoachTier })}>
            <SelectTrigger className="mt-2" aria-label={`Model tier for ${trigger.label}`}><SelectValue /></SelectTrigger>
            <SelectContent>{COACH_TIERS.map((tier) => <SelectItem key={tier} value={tier}>{TIER_LABELS[tier]}</SelectItem>)}</SelectContent>
          </Select></label>
      </div>
    </Panel>
  )
}
