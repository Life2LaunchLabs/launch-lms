'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { CalendarDays, Check, ChevronDown, Loader2, RotateCcw, X } from 'lucide-react'
import { useHub } from '@components/Hub/HubContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { planningApi } from '@services/planning/planning'
import { saveHubEditObjectState } from '@services/hub/advisor'
import { applyAgentFieldProposal, beginUserFieldInteraction, createObjectEditState, endUserFieldInteraction, recoverObjectEditState, reserveAgentField, restoreAgentProposal, summarizeObjectReview, updateUserField, type EditableFieldValue, type ObjectEditState } from '@services/hub/objectEditing'
import { cn } from '@/lib/utils'
import { PlanObjectiveHeader } from '../PlanEditorShared'
import { inlineEditableClass } from '../planDates'

export function updateRunObjectState(run: any, saved: any, status: 'editing' | 'cancelled' | 'saved', label: string) {
  const objects = [...run.objects.filter((item: any) => item.object_key !== saved.object_key), saved]
  if (status === 'editing' || run.events.some((event: any) => event.payload?.object_key === saved.object_key && event.kind === `${saved.object_type}.${status}`)) return { ...run, objects }
  const sequence = Math.max(0, ...run.events.map((event: any) => Number(event.sequence || 0))) + 1
  return { ...run, objects, events: [...run.events, {
    event_uuid: `local:${saved.object_key}:${status}`,
    sequence,
    kind: `${saved.object_type}.${status}`,
    summary: `${status === 'saved' ? 'Saved' : 'Cancelled'} ${label}`,
    object_type: saved.object_type,
    object_uuid: saved.object_uuid,
    object_label: label,
    transient: false,
    payload: { object_key: saved.object_key },
    created_at: new Date().toISOString(),
  }] }
}

export function ProposedPhaseEditor({ operationId, position, phase, recovered, detail, token, refresh, onSettled }: any) {
  const workspace = useHub()
  const setEditReviewItems = workspace?.setEditReviewItems
  const org = useOrg() as any
  const emptyFields = React.useMemo(() => ({ name: '', description: '', due_date: '' }), [])
  const [fields, setFields] = React.useState<ObjectEditState>(() => {
    if (recovered) return recoverObjectEditState(emptyFields, recovered.current_fields, recovered.proposal_fields)
    let state = createObjectEditState(emptyFields)
    for (const field of Object.keys(emptyFields)) state = reserveAgentField(state, field, `${operationId}:${phase.local_id}:${field}`).state
    return state
  })
  const [saving, setSaving] = React.useState(false)
  const revision = React.useRef(recovered?.revision || 0)
  const persistQueue = React.useRef<Promise<void>>(Promise.resolve())
  const objectKey = phase.local_id
  const targetId = `hub-edit-phase-${objectKey}`

  React.useEffect(() => {
    if (recovered) {
      setEditReviewItems?.((current) => current.some((item) => item.key === objectKey) ? current : [...current, { key: objectKey, label: String(recovered.current_fields.name || 'Phase'), objectType: 'phase', targetId }])
      return
    }
    const timers = Object.entries({ name: phase.name, description: phase.description, due_date: phase.due_date }).map(([field, value], index) => window.setTimeout(() => {
      setFields((current) => applyAgentFieldProposal(current, field, `${operationId}:${objectKey}:${field}`, value))
    }, 420 + index * 110))
    timers.push(window.setTimeout(() => setEditReviewItems?.((current) => current.some((item) => item.key === objectKey) ? current : [...current, { key: objectKey, label: phase.name, objectType: 'phase', targetId }]), 750))
    return () => timers.forEach(window.clearTimeout)
  }, [objectKey, operationId, phase.description, phase.due_date, phase.name, recovered, targetId, setEditReviewItems])

  const snapshot = (state: ObjectEditState) => ({
    current_fields: Object.fromEntries(Object.entries(state).map(([key, item]) => [key, item.current])),
    proposal_fields: Object.fromEntries(Object.entries(state).filter(([, item]) => item.proposal !== undefined).map(([key, item]) => [key, item.proposal!])),
  })
  const persist = (state: ObjectEditState, status: 'editing' | 'cancelled' | 'saved' = 'editing', objectUuid?: string) => {
    const run = workspace?.editRun
    if (!run || run.status !== 'active' || run.scope.kind !== 'plan' || !org?.id) return Promise.resolve()
    persistQueue.current = persistQueue.current.catch(() => undefined).then(async () => {
      const saved = await saveHubEditObjectState(org.id, run.run_uuid, objectKey, { object_type: 'phase', object_uuid: objectUuid, ...snapshot(state), status, expected_revision: revision.current }, token)
      revision.current = saved.revision
      workspace.setEditRun((current) => current?.run_uuid === run.run_uuid ? updateRunObjectState(current, saved, status, String(state.name?.current || phase.name)) : current)
    }).catch((error: any) => { toast.error(error?.status === 409 ? 'This phase changed in another tab. Reload to recover the latest version.' : 'Hub could not preserve this unsaved phase yet.') })
    return persistQueue.current
  }
  React.useEffect(() => {
    const timer = window.setTimeout(() => { void persist(fields) }, 500)
    return () => window.clearTimeout(timer)
    // Persist the complete object after its fields settle or the learner pauses typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields])

  const value = (field: string) => String(fields[field]?.current || '')
  const change = (field: string, next: EditableFieldValue) => setFields((current) => updateUserField(current, field, next))
  const focus = (field: string) => setFields((current) => beginUserFieldInteraction(current, field))
  const blur = (field: string) => setFields((current) => endUserFieldInteraction(current, field))
  const fieldClass = (field: string, base: string) => cn(base, fields[field]?.presentation === 'proposed' && 'border-violet-300 bg-violet-50/40 ring-2 ring-violet-200/50 dark:bg-violet-950/15', fields[field]?.presentation === 'customized' && 'border-sky-300 bg-sky-50/40 ring-2 ring-sky-200/50 dark:bg-sky-950/15')
  const fieldStatus = (field: string) => fields[field]?.presentation === 'customized' ? <span className="mt-1 flex items-center justify-end gap-1.5 text-[10px] font-semibold text-sky-700"><span>Customized</span><button type="button" onClick={() => setFields((current) => restoreAgentProposal(current, field))} className="rounded p-1 hover:bg-sky-100" aria-label={`Restore Hub proposal for ${field}`}><RotateCcw size={11} /></button></span> : fields[field]?.presentation === 'proposed' ? <span className="mt-1 block text-right text-[10px] font-semibold text-violet-700">Suggested by Hub</span> : null
  const skeleton = (height: string) => <div className={cn('w-full animate-pulse rounded-lg bg-muted motion-reduce:animate-none', height)} role="status"><span className="sr-only">Hub is preparing this field</span></div>
  const name = value('name'), description = value('description'), dueDate = value('due_date')
  const reviewText = () => {
    const labels = { accepted: 'accepted Hub suggestion', customized: 'customized by me', rejected: 'rejected Hub suggestion', entered: 'entered by me' }
    return Object.entries(summarizeObjectReview(fields)).map(([field, outcome]) => `${field}: ${labels[outcome]}`).join('; ')
  }
  const clearReview = () => setEditReviewItems?.((current) => current.filter((item) => item.key !== objectKey))
  const cancel = async () => {
    setSaving(true); await persistQueue.current; await persist(fields, 'cancelled'); clearReview()
    onSettled(objectKey, `I cancelled phase “${name || phase.name}”. Review: ${reviewText()}.`); setSaving(false)
  }
  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await persistQueue.current
      const updated = await planningApi.addPhase(detail.slug, { request_key: objectKey, position, name: name.trim(), description, due_date: dueDate || null }, token)
      await persist(fields, 'saved', updated.created_phase_uuid)
      await refresh(); clearReview()
      onSettled(objectKey, `I saved phase “${name.trim()}”. Final description: “${description.slice(0, 800)}”; target date: ${dueDate || 'none'}. Review: ${reviewText()}.`)
      toast.success('Phase added.')
    } catch (error: any) { toast.error(error?.message || 'Could not add phase.') } finally { setSaving(false) }
  }

  return <section id={targetId} tabIndex={-1} className="outline-none">
    <div className="mb-3 flex items-start gap-2 rounded-xl bg-muted/60 px-3 py-2">
      <div className="min-w-0 flex-1">{fields.name.interaction === 'agent' ? skeleton('h-8') : <input autoFocus aria-label="Phase name" value={name} onFocus={() => focus('name')} onBlur={() => blur('name')} onChange={(event) => change('name', event.target.value)} className={fieldClass('name', cn(inlineEditableClass, 'h-8 w-full text-sm font-black uppercase tracking-[0.12em]'))} />}{fieldStatus('name')}</div>
      <div className="w-36 shrink-0">{fields.due_date.interaction === 'agent' ? skeleton('h-8') : <input type="date" aria-label="Phase completion date" value={dueDate} onFocus={() => focus('due_date')} onBlur={() => blur('due_date')} onChange={(event) => change('due_date', event.target.value)} className={fieldClass('due_date', 'h-8 w-full rounded-lg border border-border bg-card px-2 text-[10px]')} />}{fieldStatus('due_date')}</div>
      <button type="button" disabled={saving} onClick={() => void cancel()} aria-label={`Cancel phase ${name || phase.name}`} className="rounded p-1.5 text-muted-foreground hover:bg-muted"><X size={13} /></button>
      <button type="button" disabled={saving || !name.trim()} onClick={() => void save()} aria-label={`Save phase ${name || phase.name}`} className="rounded-lg bg-foreground p-2 text-background disabled:opacity-40">{saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}</button>
    </div>
    <div className="mb-6 ml-3 border-l border-border pl-4">
      <label className="block"><span className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground">Phase details</span>{fields.description.interaction === 'agent' ? <div className="mt-2">{skeleton('h-20')}</div> : <textarea value={description} onFocus={() => focus('description')} onBlur={() => blur('description')} onChange={(event) => change('description', event.target.value)} placeholder="Add context for this phase" className={fieldClass('description', cn(inlineEditableClass, 'mt-2 min-h-20 w-full resize-y px-1 py-2 text-sm leading-5'))} />}{fieldStatus('description')}</label>
    </div>
  </section>
}

export function ProposedObjectiveEditor({ operationId, objective, recovered, detail, phases, color, token, refresh, onPhaseChange, onSettled }: any) {
  const workspace = useHub()
  const setEditReviewItems = workspace?.setEditReviewItems
  const org = useOrg() as any
  const suggestedPhaseUuid = phases.find((item: any) => item.name === objective.phase_name)?.phase_uuid || phases[0]?.phase_uuid || ''
  const emptyFields = React.useMemo(() => ({ title: '', description: '', due_date: '', phase_uuid: '' }), [])
  const initialFields = React.useMemo(() => {
    if (recovered) return recoverObjectEditState(emptyFields, recovered.current_fields, recovered.proposal_fields)
    let state = createObjectEditState(emptyFields)
    for (const field of Object.keys(emptyFields)) state = reserveAgentField(state, field, `${operationId}:${objective.local_id}:${field}`).state
    return state
  }, [emptyFields, objective.local_id, operationId, recovered])
  const [fields, setFields] = React.useState<ObjectEditState>(initialFields)
  const [saving, setSaving] = React.useState(false)
  const revision = React.useRef(recovered?.revision || 0)
  const persistQueue = React.useRef<Promise<void>>(Promise.resolve())
  const conflictShown = React.useRef(false)
  const objectKey = objective.local_id
  const targetId = `hub-edit-objective-${objectKey}`

  React.useEffect(() => {
    if (recovered) {
      setEditReviewItems?.((current) => current.some((item) => item.key === objectKey) ? current : [...current, { key: objectKey, label: String(recovered.current_fields.title || 'Objective'), objectType: 'objective', targetId }])
      return
    }
    const timers = Object.entries({ title: objective.title, description: objective.description, due_date: objective.due_date, phase_uuid: suggestedPhaseUuid }).map(([field, value], index) => window.setTimeout(() => {
      setFields((current) => applyAgentFieldProposal(current, field, `${operationId}:${objectKey}:${field}`, value))
    }, 420 + index * 110))
    timers.push(window.setTimeout(() => {
      setEditReviewItems?.((current) => current.some((item) => item.key === objectKey) ? current : [...current, { key: objectKey, label: objective.title, objectType: 'objective', targetId }])
    }, 750))
    return () => timers.forEach(window.clearTimeout)
  }, [objectKey, objective.description, objective.due_date, objective.title, operationId, recovered, suggestedPhaseUuid, targetId, setEditReviewItems])

  const snapshot = (state: ObjectEditState) => ({
    current_fields: Object.fromEntries(Object.entries(state).map(([key, item]) => [key, item.current])),
    proposal_fields: Object.fromEntries(Object.entries(state).filter(([, item]) => item.proposal !== undefined).map(([key, item]) => [key, item.proposal!])),
  })
  const persist = (state: ObjectEditState, status: 'editing' | 'cancelled' | 'saved' = 'editing', objectUuid?: string) => {
    const run = workspace?.editRun
    if (!run || run.status !== 'active' || run.scope.kind !== 'plan' || !org?.id) return Promise.resolve()
    persistQueue.current = persistQueue.current.then(async () => {
      const saved = await saveHubEditObjectState(org.id, run.run_uuid, objectKey, {
        object_type: 'objective', object_uuid: objectUuid, ...snapshot(state), status, expected_revision: revision.current,
      }, token)
      revision.current = saved.revision
      workspace.setEditRun((current) => current?.run_uuid === run.run_uuid ? updateRunObjectState(current, saved, status, String(state.title?.current || objective.title)) : current)
    }).catch((error: any) => {
      if (!conflictShown.current) {
        conflictShown.current = true
        toast.error(error?.status === 409 ? 'This objective changed in another tab. Reload to recover the latest version.' : 'Hub could not preserve this unsaved objective yet.')
      }
    })
    return persistQueue.current
  }
  React.useEffect(() => {
    const timer = window.setTimeout(() => { void persist(fields) }, 500)
    return () => window.clearTimeout(timer)
    // Persist the complete object after its fields settle or the learner pauses typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields])

  const value = (field: string) => String(fields[field]?.current || '')
  const change = (field: string, next: EditableFieldValue) => setFields((current) => updateUserField(current, field, next))
  const focus = (field: string) => setFields((current) => beginUserFieldInteraction(current, field))
  const blur = (field: string) => setFields((current) => endUserFieldInteraction(current, field))
  const fieldClass = (field: string, base: string) => cn(base, fields[field]?.presentation === 'proposed' && 'border-violet-300 bg-violet-50/40 ring-2 ring-violet-200/50 dark:bg-violet-950/15', fields[field]?.presentation === 'customized' && 'border-sky-300 bg-sky-50/40 ring-2 ring-sky-200/50 dark:bg-sky-950/15')
  const fieldStatus = (field: string) => fields[field]?.presentation === 'customized' ? <span className="mt-1 flex items-center justify-end gap-1.5 text-[10px] font-semibold text-sky-700"><span>Customized</span><button type="button" onClick={() => setFields((current) => restoreAgentProposal(current, field))} className="rounded p-1 hover:bg-sky-100" aria-label={`Restore Hub proposal for ${field}`}><RotateCcw size={11} /></button></span> : fields[field]?.presentation === 'proposed' ? <span className="mt-1 block text-right text-[10px] font-semibold text-violet-700">Suggested by Hub</span> : null
  const skeleton = (height: string) => <div className={cn('w-full animate-pulse rounded-lg bg-muted motion-reduce:animate-none', height)} role="status"><span className="sr-only">Hub is preparing this field</span></div>
  const title = value('title'), description = value('description'), dueDate = value('due_date'), phaseUuid = value('phase_uuid')
  const clearReview = () => setEditReviewItems?.((current) => current.filter((item) => item.key !== objectKey))
  const reviewText = () => {
    const labels = { accepted: 'accepted Hub suggestion', customized: 'customized by me', rejected: 'rejected Hub suggestion', entered: 'entered by me' }
    return Object.entries(summarizeObjectReview(fields)).map(([field, outcome]) => `${field}: ${labels[outcome]}`).join('; ')
  }
  const cancel = async () => {
    setSaving(true)
    await persistQueue.current
    await persist(fields, 'cancelled')
    clearReview()
    onSettled(objectKey, `I cancelled objective “${title || objective.title}”. Review: ${reviewText()}.`)
    setSaving(false)
  }
  const save = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await persistQueue.current
      const updated = await planningApi.addObjective(detail.slug, { request_key: objectKey, title: title.trim(), description, due_date: dueDate || null, phase_uuid: phaseUuid || null }, token)
      await persist(fields, 'saved', updated.created_objective_uuid)
      await refresh()
      clearReview()
      onSettled(objectKey, `I saved objective “${title.trim()}”. Final description: “${description.slice(0, 800)}”; target date: ${dueDate || 'none'}. Review: ${reviewText()}.`)
      toast.success('Objective added.')
    } catch (error: any) {
      toast.error(error?.message || 'Could not add objective.')
    } finally {
      setSaving(false)
    }
  }
  const restorePhaseProposal = () => {
    const proposedPhaseUuid = String(fields.phase_uuid.proposal || '')
    setFields((current) => restoreAgentProposal(current, 'phase_uuid'))
    onPhaseChange(proposedPhaseUuid)
  }

  const titleEditor = fields.title.interaction === 'agent' ? skeleton('h-7') : <div className="min-w-0 flex-1"><input autoFocus aria-label="Objective title" value={title} onFocus={() => focus('title')} onBlur={() => blur('title')} onChange={(event) => change('title', event.target.value)} className={fieldClass('title', cn(inlineEditableClass, 'h-7 w-full text-sm font-black'))} />{fieldStatus('title')}</div>
  const details = <>
    <span className={cn('relative inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2.5 text-[10px] font-black', fields.phase_uuid.presentation === 'proposed' && 'ring-1 ring-violet-200')}>{fields.phase_uuid.interaction === 'agent' ? <span className="block w-20">{skeleton('h-4')}</span> : <><span className="max-w-32 truncate">{phases.find((item: any) => item.phase_uuid === phaseUuid)?.name || 'Choose phase'}</span><ChevronDown size={10} /><select aria-label="Objective phase" value={phaseUuid} onFocus={() => focus('phase_uuid')} onBlur={() => blur('phase_uuid')} onChange={(event) => { change('phase_uuid', event.target.value); onPhaseChange(event.target.value) }} className="absolute inset-0 cursor-pointer opacity-0">{phases.map((item: any) => <option key={item.phase_uuid} value={item.phase_uuid}>{item.name}</option>)}</select></>}</span>
    <span className={cn('inline-flex h-7 items-center gap-1 rounded-full bg-muted pl-2 pr-1 text-[10px] font-black', fields.due_date.presentation === 'proposed' && 'ring-1 ring-violet-200')}>{fields.due_date.interaction === 'agent' ? <span className="block w-28">{skeleton('h-4')}</span> : <><CalendarDays size={10} /><input type="date" aria-label="Objective target date" value={dueDate} onFocus={() => focus('due_date')} onBlur={() => blur('due_date')} onChange={(event) => change('due_date', event.target.value)} className="h-6 min-w-28 bg-transparent text-[10px] outline-none" />{dueDate ? <button type="button" onClick={() => change('due_date', '')} aria-label="Remove target date" className="rounded-full p-1 hover:bg-background"><X size={11} /></button> : null}</>}</span>
    {fields.phase_uuid.presentation === 'customized' ? <button type="button" onClick={restorePhaseProposal} className="inline-flex items-center gap-1 text-[10px] text-sky-700"><RotateCcw size={10} />Custom phase</button> : null}
    {fields.due_date.presentation === 'customized' ? <button type="button" onClick={() => setFields((current) => restoreAgentProposal(current, 'due_date'))} className="inline-flex items-center gap-1 text-[10px] text-sky-700"><RotateCcw size={10} />Custom date</button> : null}
  </>
  const actions = <span className="flex items-center gap-1"><button type="button" disabled={saving} onClick={() => void cancel()} aria-label={`Cancel objective ${title || objective.title}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><X size={14} /></button><button type="button" disabled={saving || !title.trim()} onClick={() => void save()} aria-label={`Save objective ${title || objective.title}`} className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background disabled:opacity-40">{saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />}</button></span>

  return <article id={targetId} tabIndex={-1} className="relative z-10 my-2 rounded-2xl bg-card shadow-lg ring-1 ring-black/5 outline-none">
    <PlanObjectiveHeader title={title} titleEditor={titleEditor} details={details} open editing color={color} actions={actions} onToggle={() => undefined} />
    <div className="px-4 pb-5">
      <div className="border-t border-border pt-4"><label className="block"><span className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground">Description</span>{fields.description.interaction === 'agent' ? <div className="mt-2">{skeleton('h-20')}</div> : <textarea value={description} onFocus={() => focus('description')} onBlur={() => blur('description')} onChange={(event) => change('description', event.target.value)} placeholder="Add helpful context" className={fieldClass('description', cn(inlineEditableClass, 'mt-2 min-h-20 w-full resize-y px-1 py-2 text-sm leading-5'))} />}{fieldStatus('description')}</label></div>
    </div>
  </article>
}
