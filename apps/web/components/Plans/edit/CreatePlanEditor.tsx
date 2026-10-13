'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { Loader2, RotateCcw } from 'lucide-react'
import { useHub } from '@components/Hub/HubContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { Button } from '@components/ui/button'
import { planningApi } from '@services/planning/planning'
import { saveHubEditObjectState } from '@services/hub/advisor'
import { applyAgentFieldProposal, beginUserFieldInteraction, createObjectEditState, endUserFieldInteraction, recoverObjectEditState, reserveAgentField, restoreAgentProposal, summarizeObjectReview, updateUserField, type EditableFieldValue, type ObjectEditState } from '@services/hub/objectEditing'
import { cn } from '@/lib/utils'

/** The new-plan form Coach fills in when it is creating a plan with the learner. */
export default function CreatePlanEditor({ token, refresh, onCreated, onCancel }: any) {
  const workspace = useHub()
  const setEditReviewItems = workspace?.setEditReviewItems
  const setEditOperations = workspace?.setEditOperations
  const editOperations = workspace?.editOperations
  const org = useOrg() as any
  const emptyFields = React.useMemo(() => ({ name: '', description: '', due_date: '' }), [])
  const recovered = workspace?.editRun?.objects.find((item) => item.object_key === 'new-plan' && item.status === 'editing')
  const [fields, setFields] = React.useState(() => recovered
    ? recoverObjectEditState(emptyFields, recovered.current_fields, recovered.proposal_fields)
    : createObjectEditState(emptyFields))
  const [saving, setSaving] = React.useState(false)
  const handled = React.useRef(new Set<string>())
  const recoveredRevision = React.useRef(recovered?.revision || 0)
  const persistQueue = React.useRef<Promise<void>>(Promise.resolve())
  const recoveryConflictShown = React.useRef(false)
  React.useEffect(() => {
    if (!recovered || recovered.revision <= recoveredRevision.current) return
    recoveredRevision.current = recovered.revision
    setFields(recoverObjectEditState(emptyFields, recovered.current_fields, recovered.proposal_fields))
    if (Object.keys(recovered.proposal_fields).length) {
      setEditReviewItems?.((current) => current.some((item) => item.key === 'new-plan') ? current : [...current, { key: 'new-plan', label: 'New plan details', objectType: 'plan', targetId: 'hub-edit-new-plan' }])
    }
  }, [emptyFields, recovered, setEditReviewItems])
  React.useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    const pendingOperations = editOperations || []
    let finalDelay = 0
    for (const operation of pendingOperations) {
      if (operation.type !== 'set_new_plan_details' || handled.current.has(operation.operation_id)) continue
      handled.current.add(operation.operation_id)
      Object.entries(operation.fields).forEach(([field, value], index) => {
        const reservationId = `${operation.operation_id}:${field}`
        const delay = 420 + index * 120
        finalDelay = Math.max(finalDelay, delay)
        setFields((current) => reserveAgentField(current, field, reservationId).state)
        timers.push(setTimeout(() => {
          setFields((current) => applyAgentFieldProposal(current, field, reservationId, value))
        }, delay))
      })
    }
    if (finalDelay) {
      timers.push(setTimeout(() => {
        setEditReviewItems?.((current) => current.some((item) => item.key === 'new-plan') ? current : [...current, { key: 'new-plan', label: 'New plan details', objectType: 'plan', targetId: 'hub-edit-new-plan' }])
        setEditOperations?.([])
      }, finalDelay + 80))
    }
    return () => timers.forEach(clearTimeout)
  }, [editOperations, setEditOperations, setEditReviewItems])
  const stateSnapshot = (state: ObjectEditState) => ({
    current_fields: Object.fromEntries(Object.entries(state).map(([key, item]) => [key, item.current])),
    proposal_fields: Object.fromEntries(Object.entries(state).filter(([, item]) => item.proposal !== undefined).map(([key, item]) => [key, item.proposal!])),
  })
  const persist = (state: ObjectEditState, editStatus: 'editing' | 'cancelled' = 'editing') => {
    const run = workspace?.editRun
    if (!run || run.status !== 'active' || run.scope.kind !== 'new_plan' || !org?.id) return Promise.resolve()
    const snapshot = stateSnapshot(state)
    persistQueue.current = persistQueue.current
      .then(async () => {
        const saved = await saveHubEditObjectState(org.id, run.run_uuid, 'new-plan', {
          object_type: 'plan', ...snapshot, status: editStatus, expected_revision: recoveredRevision.current,
        }, token)
        recoveredRevision.current = saved.revision
        workspace?.setEditRun((current) => current?.run_uuid === run.run_uuid ? {
          ...current,
          objects: [...current.objects.filter((item) => item.object_key !== saved.object_key), saved],
        } : current)
      })
      .catch((error: any) => {
        if (!recoveryConflictShown.current) {
          recoveryConflictShown.current = true
          toast.error(error?.status === 409 ? 'This plan editor changed in another tab. Reload to recover the latest version.' : 'Coach could not preserve these unsaved edits yet.')
        }
      })
    return persistQueue.current
  }
  React.useEffect(() => {
    const hasMeaningfulState = Object.values(fields).some((field) => field.current !== field.saved || field.proposal !== undefined)
    if (!recovered && !hasMeaningfulState) return
    const timer = window.setTimeout(() => { void persist(fields) }, 500)
    return () => window.clearTimeout(timer)
    // Persistence intentionally follows the complete editor state after a quiet interval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, workspace?.editRun?.run_uuid])
  const value = (field: string) => String(fields[field]?.current || '')
  const change = (field: string, next: EditableFieldValue) => setFields((current) => updateUserField(current, field, next))
  const focus = (field: string) => setFields((current) => beginUserFieldInteraction(current, field))
  const blur = (field: string) => setFields((current) => endUserFieldInteraction(current, field))
  const fieldClass = (field: string, base: string) => cn(base, fields[field]?.presentation === 'proposed' && 'border-violet-300 bg-violet-50/40 ring-2 ring-violet-200/50 dark:bg-violet-950/15', fields[field]?.presentation === 'customized' && 'border-sky-300 bg-sky-50/40 ring-2 ring-sky-200/50 dark:bg-sky-950/15')
  const status = (field: string) => fields[field]?.presentation === 'customized' ? <span className="mt-1.5 flex items-center justify-end gap-1.5 text-[10px] font-semibold text-sky-700"><span>Customized</span><button type="button" onClick={() => setFields((current) => restoreAgentProposal(current, field))} className="rounded p-1 hover:bg-sky-100" aria-label={`Restore Coach proposal for ${field}`}><RotateCcw size={11} /></button></span> : fields[field]?.presentation === 'proposed' ? <span className="mt-1.5 block text-right text-[10px] font-semibold text-violet-700">Suggested by Coach</span> : null
  const skeleton = (height: string) => <div className={cn('w-full animate-pulse rounded-lg bg-muted motion-reduce:animate-none', height)} role="status"><span className="sr-only">Coach is preparing this field</span></div>
  const name = value('name'), description = value('description'), dueDate = value('due_date')
  const continuationReceipt = () => {
    const labels = { accepted: 'accepted Coach suggestion', customized: 'customized by me', rejected: 'rejected Coach suggestion', entered: 'entered by me' }
    const review = Object.entries(summarizeObjectReview(fields)).map(([field, outcome]) => `${field}: ${labels[outcome]}`).join('; ')
    return `I saved the plan details.\n\nFinal plan: name “${name.trim()}”; target date ${dueDate || 'none'}; description “${description.slice(0, 800)}”.\nReview: ${review}.\n\nContinue working toward our editing goal using this saved plan.`
  }
  const clearReview = () => setEditReviewItems?.((current) => current.filter((item) => item.key !== 'new-plan'))
  const cancel = async () => { await persistQueue.current; await persist(fields, 'cancelled'); clearReview(); onCancel('I cancelled the new plan instead of saving it. Ask what I would like to do next or propose finishing this editing goal.') }
  const save = async () => { if (!name.trim()) return; setSaving(true); try { await persist(fields); const plan = await planningApi.create({ name: name.trim(), description, due_date: dueDate || null }, token); await refresh(); clearReview(); await onCreated(plan, continuationReceipt()); toast.success('Plan created.') } catch (error: any) { toast.error(error?.message || 'Could not create plan.') } finally { setSaving(false) } }
  return <section id="hub-edit-new-plan" tabIndex={-1} className="mx-auto mt-8 max-w-3xl rounded-2xl border border-border bg-card p-5 shadow-xs outline-none sm:p-7" aria-labelledby="new-plan-title">
    <div className="mb-6"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">New plan</p><h2 id="new-plan-title" className="mt-1 text-2xl font-black">What are you working toward?</h2><p className="mt-1 text-sm text-muted-foreground">Save the plan first. Then you or Coach can add phases and objectives in the workspace.</p>{workspace?.editRun ? <p className="mt-2 text-[11px] text-muted-foreground">Unsaved editing here is privately recoverable for up to 30 days.</p> : null}</div>
    <div className="space-y-5">
      <label className="block text-xs font-black">Goal{fields.name.interaction === 'agent' ? <div className="mt-2">{skeleton('h-11')}</div> : <input autoFocus={!workspace?.editRun} value={name} onFocus={() => focus('name')} onBlur={() => blur('name')} onChange={(event) => change('name', event.target.value)} className={fieldClass('name', 'mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm')} placeholder="Earn my nursing degree" data-agent-field="name" />}{status('name')}</label>
      <label className="block text-xs font-black">Target completion date <span className="font-normal text-muted-foreground">(optional)</span>{fields.due_date.interaction === 'agent' ? <div className="mt-2">{skeleton('h-11')}</div> : <input type="date" value={dueDate} onFocus={() => focus('due_date')} onBlur={() => blur('due_date')} onChange={(event) => change('due_date', event.target.value)} className={fieldClass('due_date', 'mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm')} data-agent-field="due_date" />}{status('due_date')}</label>
      <label className="block text-xs font-black">What do you know so far?{fields.description.interaction === 'agent' ? <div className="mt-2">{skeleton('h-28')}</div> : <textarea value={description} onFocus={() => focus('description')} onBlur={() => blur('description')} onChange={(event) => change('description', event.target.value)} className={fieldClass('description', 'mt-2 min-h-28 w-full rounded-lg border border-border bg-background p-3 text-sm')} placeholder="It is okay to leave this open-ended." data-agent-field="description" />}{status('description')}</label>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => void cancel()} disabled={saving}>Cancel</Button><Button type="button" disabled={saving || !name.trim()} onClick={() => void save()}>{saving ? <Loader2 className="animate-spin" size={15} /> : null}Save plan</Button></div>
    </div>
  </section>
}
