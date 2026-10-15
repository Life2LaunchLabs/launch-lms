'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { useSWRConfig } from 'swr'
import { Loader2, RotateCcw } from 'lucide-react'
import { useHub } from '@components/Hub/HubContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { Button } from '@components/ui/button'
import { goalsApi, isGoalsKey } from '@services/goals/goals'
import type { Goal } from '@services/goals/types'
import { saveHubEditObjectState } from '@services/hub/advisor'
import { NEW_GOAL_OBJECT_KEY, applyAgentFieldProposal, beginUserFieldInteraction, createObjectEditState, endUserFieldInteraction, recoverObjectEditState, reserveAgentField, restoreAgentProposal, summarizeObjectReview, updateUserField, type EditableFieldValue, type ObjectEditState } from '@services/hub/objectEditing'
import { cn } from '@/lib/utils'

const REVIEW_ITEM = { key: NEW_GOAL_OBJECT_KEY, label: 'New goal details', objectType: 'goal', targetId: 'hub-edit-new-goal' }
const OUTCOMES = { accepted: 'accepted Coach suggestion', customized: 'customized by me', rejected: 'rejected Coach suggestion', entered: 'entered by me' }

/**
 * The new-goal form Coach fills in when it creates a goal with the learner. Only a title is
 * needed; Coach's suggestions arrive field by field and stay unsaved until the learner saves.
 */
// eslint-disable-next-line no-unused-vars
export default function CreateGoalEditor({ token, onCancel, onCreated }: { token?: string; onCancel: (text?: string) => void; onCreated: (goal: Goal, content?: string) => void }) {
  const hub = useHub()
  const setEditReviewItems = hub?.setEditReviewItems
  const setEditOperations = hub?.setEditOperations
  const editOperations = hub?.editOperations
  const org = useOrg() as { id?: number } | null
  const { mutate } = useSWRConfig()
  const emptyFields = React.useMemo(() => ({ title: '', description: '', target_date: '' }), [])
  const recovered = hub?.editRun?.objects.find((item) => (item.object_key === NEW_GOAL_OBJECT_KEY || item.object_key === 'new-plan') && item.status === 'editing')
  const [fields, setFields] = React.useState<ObjectEditState>(() => recovered ? recoverObjectEditState(emptyFields, recovered.current_fields, recovered.proposal_fields) : createObjectEditState(emptyFields))
  const [saving, setSaving] = React.useState(false)
  const handled = React.useRef(new Set<string>())
  const revision = React.useRef(recovered?.revision || 0)
  const queue = React.useRef<Promise<void>>(Promise.resolve())
  const conflictShown = React.useRef(false)
  const addReviewItem = React.useCallback(() => setEditReviewItems?.((current) => current.some((item) => item.key === REVIEW_ITEM.key) ? current : [...current, REVIEW_ITEM]), [setEditReviewItems])

  React.useEffect(() => {
    if (!recovered || recovered.revision <= revision.current) return
    revision.current = recovered.revision
    setFields(recoverObjectEditState(emptyFields, recovered.current_fields, recovered.proposal_fields))
    if (Object.keys(recovered.proposal_fields).length) addReviewItem()
  }, [addReviewItem, emptyFields, recovered])

  // Coach's details arrive as operations; each field shows as being prepared, then lands.
  React.useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    let finalDelay = 0
    for (const operation of editOperations || []) {
      if (operation.type !== 'set_new_goal_details' || handled.current.has(operation.operation_id)) continue
      handled.current.add(operation.operation_id)
      Object.entries(operation.fields).forEach(([field, value], index) => {
        const reservationId = `${operation.operation_id}:${field}`
        const delay = 420 + index * 120
        finalDelay = Math.max(finalDelay, delay)
        setFields((current) => reserveAgentField(current, field, reservationId).state)
        timers.push(setTimeout(() => setFields((current) => applyAgentFieldProposal(current, field, reservationId, value)), delay))
      })
    }
    if (finalDelay) timers.push(setTimeout(() => { addReviewItem(); setEditOperations?.([]) }, finalDelay + 80))
    return () => timers.forEach(clearTimeout)
  }, [addReviewItem, editOperations, setEditOperations])

  const persist = (state: ObjectEditState, status: 'editing' | 'cancelled' = 'editing') => {
    const run = hub?.editRun
    if (!run || run.status !== 'active' || run.scope.kind !== 'new_goal' || !org?.id) return Promise.resolve()
    const current_fields = Object.fromEntries(Object.entries(state).map(([key, item]) => [key, item.current]))
    const proposal_fields = Object.fromEntries(Object.entries(state).filter(([, item]) => item.proposal !== undefined).map(([key, item]) => [key, item.proposal!]))
    queue.current = queue.current.then(async () => {
      const saved = await saveHubEditObjectState(org.id!, run.run_uuid, NEW_GOAL_OBJECT_KEY, { object_type: 'goal', current_fields, proposal_fields, status, expected_revision: revision.current }, token || '')
      revision.current = saved.revision
      hub?.setEditRun((value) => value?.run_uuid === run.run_uuid ? { ...value, objects: [...value.objects.filter((item) => item.object_key !== saved.object_key), saved] } : value)
    }).catch((error: { status?: number }) => {
      if (conflictShown.current) return
      conflictShown.current = true
      toast.error(error?.status === 409 ? 'This goal changed in another tab. Reload to recover the latest version.' : 'Coach couldn’t keep these unsaved edits yet.')
    })
    return queue.current
  }
  React.useEffect(() => {
    const meaningful = Object.values(fields).some((field) => field.current !== field.saved || field.proposal !== undefined)
    if (!recovered && !meaningful) return
    const timer = window.setTimeout(() => { void persist(fields) }, 500)
    return () => window.clearTimeout(timer)
    // Persistence follows the complete editor state after a quiet interval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, hub?.editRun?.run_uuid])

  const value = (field: string) => String(fields[field]?.current || '')
  const change = (field: string, next: EditableFieldValue) => setFields((current) => updateUserField(current, field, next))
  const focus = (field: string) => setFields((current) => beginUserFieldInteraction(current, field))
  const blur = (field: string) => setFields((current) => endUserFieldInteraction(current, field))
  const fieldClass = (field: string, base: string) => cn(base, fields[field]?.presentation === 'proposed' && 'border-violet-300 bg-violet-50/40 ring-2 ring-violet-200/50 dark:bg-violet-950/15', fields[field]?.presentation === 'customized' && 'border-sky-300 bg-sky-50/40 ring-2 ring-sky-200/50 dark:bg-sky-950/15')
  const status = (field: string) => fields[field]?.presentation === 'customized'
    ? <span className="mt-1.5 flex items-center justify-end gap-1.5 text-[10px] font-semibold text-sky-700"><span>Customized</span><button type="button" onClick={() => setFields((current) => restoreAgentProposal(current, field))} className="rounded p-1 hover:bg-sky-100" aria-label={`Restore Coach proposal for ${field}`}><RotateCcw size={11} /></button></span>
    : fields[field]?.presentation === 'proposed' ? <span className="mt-1.5 block text-right text-[10px] font-semibold text-violet-700">Suggested by Coach</span> : null
  const skeleton = (height: string) => <div className={cn('w-full animate-pulse rounded-lg bg-muted motion-reduce:animate-none', height)} role="status"><span className="sr-only">Coach is preparing this field</span></div>
  const title = value('title'), description = value('description'), targetDate = value('target_date')
  const receipt = () => {
    const outcomes = Object.entries(summarizeObjectReview(fields)).map(([field, outcome]) => `${field}: ${OUTCOMES[outcome]}`).join('; ')
    return `I saved the goal.\n\nFinal goal: title “${title.trim()}”; target date ${targetDate || 'none'}; description “${description.slice(0, 800)}”.\nReview: ${outcomes}.\n\nContinue working toward our editing goal using this saved goal.`
  }
  const clearReview = () => setEditReviewItems?.((current) => current.filter((item) => item.key !== REVIEW_ITEM.key))
  const cancel = async () => {
    await queue.current
    await persist(fields, 'cancelled')
    clearReview()
    onCancel('I cancelled the new goal instead of saving it. Ask what I would like to do next or propose finishing this editing goal.')
  }
  const save = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await persist(fields)
      const goal = await goalsApi.create({ title: title.trim(), description, target_date: targetDate || null }, token)
      await mutate((key) => isGoalsKey(key))
      clearReview()
      await onCreated(goal, receipt())
      toast.success('Goal created')
    } catch (error: any) { toast.error(error?.message || 'Could not create this goal.') } finally { setSaving(false) }
  }

  return <section id={REVIEW_ITEM.targetId} tabIndex={-1} className="mx-auto mt-8 max-w-3xl rounded-2xl border border-border bg-card p-5 shadow-xs outline-none sm:p-7" aria-labelledby="new-goal-title">
    <div className="mb-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">New goal</p>
      <h2 id="new-goal-title" className="mt-1 text-2xl font-black">What are you working toward?</h2>
      <p className="mt-1 text-sm text-muted-foreground">A title is all it needs. Then you or Coach can add stages and steps.</p>
      {hub?.editRun ? <p className="mt-2 text-[11px] text-muted-foreground">Unsaved editing here is privately recoverable for up to 30 days.</p> : null}
    </div>
    <div className="space-y-5">
      <label className="block text-xs font-black">Goal{fields.title.interaction === 'agent' ? <div className="mt-2">{skeleton('h-11')}</div> : <input autoFocus={!hub?.editRun} value={title} onFocus={() => focus('title')} onBlur={() => blur('title')} onChange={(event) => change('title', event.target.value)} className={fieldClass('title', 'mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm')} placeholder="Earn my nursing degree" data-agent-field="title" />}{status('title')}</label>
      <label className="block text-xs font-black">Target date <span className="font-normal text-muted-foreground">(optional)</span>{fields.target_date.interaction === 'agent' ? <div className="mt-2">{skeleton('h-11')}</div> : <input type="date" value={targetDate} onFocus={() => focus('target_date')} onBlur={() => blur('target_date')} onChange={(event) => change('target_date', event.target.value)} className={fieldClass('target_date', 'mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm')} data-agent-field="target_date" />}{status('target_date')}</label>
      <label className="block text-xs font-black">What do you know so far?{fields.description.interaction === 'agent' ? <div className="mt-2">{skeleton('h-28')}</div> : <textarea value={description} onFocus={() => focus('description')} onBlur={() => blur('description')} onChange={(event) => change('description', event.target.value)} className={fieldClass('description', 'mt-2 min-h-28 w-full rounded-lg border border-border bg-background p-3 text-sm')} placeholder="It is okay to leave this open-ended." data-agent-field="description" />}{status('description')}</label>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => void cancel()} disabled={saving}>Cancel</Button><Button type="button" disabled={saving || !title.trim()} onClick={() => void save()}>{saving ? <Loader2 className="animate-spin" size={15} /> : null}Save goal</Button></div>
    </div>
  </section>
}
