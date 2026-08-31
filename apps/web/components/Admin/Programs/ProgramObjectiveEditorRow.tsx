'use client'

import React from 'react'
import { Award, ChevronRight, FileText, GripVertical, Loader2, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { mutate } from 'swr'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { getAPIUrl } from '@services/config/config'
import { programsApi } from '@services/programs/programs'
import { cn } from '@/lib/utils'

type EvidenceField = { field_uuid: string; title: string; type: 'text' | 'media'; restricted: boolean; allow_student_upload?: boolean; allowed_types: string[] }

const normalizeFields = (fields: any[]): EvidenceField[] => fields.map((field) => ({
  ...field,
  restricted: field.restricted ?? !field.allow_student_upload,
}))

export default function ProgramObjectiveEditorRow({ objective, orgId, token, program, dragHandleProps, dragging }: any) {
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState(objective.title || '')
  const [description, setDescription] = React.useState(objective.description || '')
  const [fields, setFields] = React.useState<EvidenceField[]>(normalizeFields(objective.custom_fields || []))
  const [completionRestricted, setCompletionRestricted] = React.useState(!objective.allow_learner_confirmation)
  const [startRule, setStartRule] = React.useState(objective.default_start_rule || 'any_time')
  const [dueRule, setDueRule] = React.useState(objective.default_due_rule || 'optional')
  const [allowLate, setAllowLate] = React.useState(Boolean(objective.default_allow_late))
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    setTitle(objective.title || '')
    setDescription(objective.description || '')
    setFields(normalizeFields(objective.custom_fields || []))
    setCompletionRestricted(!objective.allow_learner_confirmation)
    setStartRule(objective.default_start_rule || 'any_time')
    setDueRule(objective.default_due_rule || 'optional')
    setAllowLate(Boolean(objective.default_allow_late))
  }, [objective])

  const updateField = (uuid: string, patch: Partial<EvidenceField>) => setFields((current) => current.map((field) => field.field_uuid === uuid ? { ...field, ...patch } : field))
  const addField = () => setFields((current) => [...current, { field_uuid: crypto.randomUUID(), title: '', type: 'text', restricted: false, allowed_types: [] }])
  const save = async () => {
    if (!title.trim()) return toast.error('Objective title is required.')
    if (fields.some((field) => !field.title.trim())) return toast.error('Give every evidence field a title.')
    setSaving(true)
    try {
      await programsApi.updateObjective(orgId, program.program_uuid, objective.objective_uuid, {
        title: title.trim(), description, custom_fields: fields.map((field) => ({ ...field, allow_student_upload: !field.restricted })),
        allow_learner_confirmation: !completionRestricted,
        default_start_rule: startRule, default_due_rule: dueRule,
        default_allow_late: dueRule === 'optional' ? false : allowLate,
      }, token)
      await mutate(`${getAPIUrl()}planning/templates/${program.program_uuid}?org_id=${orgId}`)
      setOpen(false)
      toast.success('Objective updated.')
    } catch (error: any) { toast.error(error?.message || 'Could not update the objective.') } finally { setSaving(false) }
  }

  const schedule = `${startRule === 'any_time' ? 'Any time' : startRule === 'phase_start' ? 'Phase start' : 'Set at assignment'} · ${dueRule === 'optional' ? 'Optional' : dueRule === 'phase_end' ? 'Phase end' : 'Due date set at assignment'}`
  return <>
    <div className={cn('group flex items-center gap-2 rounded-xl border border-border bg-card p-3 transition', dragging ? 'shadow-xl ring-2 ring-blue-300' : 'shadow-xs hover:border-foreground/30')}>
      <button {...dragHandleProps} className="cursor-grab rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 active:cursor-grabbing" aria-label={`Move ${objective.title}`}><GripVertical size={18} /></button>
      <button onClick={() => setOpen(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', objective.kind === 'badge' ? 'bg-lime-100 text-lime-700' : 'bg-blue-50 text-blue-600')}>{objective.kind === 'badge' ? <Award size={18} /> : <FileText size={18} />}</div>
        <div className="min-w-0 flex-1"><h4 className="truncate text-sm font-bold">{objective.title}</h4><p className="mt-0.5 truncate text-xs text-muted-foreground">{schedule}</p></div><ChevronRight size={16} className="text-muted-foreground" />
      </button>
    </div>
    <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="no-min" customHeight="h-[min(780px,90dvh)]" customWidth="md:w-[min(900px,92vw)]" dialogTitle={objective.title} dialogDescription="Edit the objective details, evidence, and assignment defaults." dialogContent={<div className="flex h-full min-h-0 flex-col p-2">
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-2">
        <section className="space-y-4"><EditorField label="Title"><input value={title} onChange={(event) => setTitle(event.target.value)} className="h-10 w-full rounded-lg border border-border px-3 text-sm" /></EditorField><EditorField label="Description / instructions"><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} className="w-full rounded-lg border border-border p-3 text-sm" /></EditorField></section>
        {objective.kind !== 'badge' && <section className="border-t border-border pt-5"><div className="flex items-center justify-between"><div><h3 className="text-sm font-black">Evidence and confirmation restrictions</h3><p className="mt-1 text-xs text-muted-foreground">Restrict only the fields and completion decisions that require elevated role permission.</p></div><button onClick={addField} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold"><Plus size={13} />Add field</button></div><div className="mt-3 space-y-3">{fields.map((field, index) => <div key={field.field_uuid} className="rounded-xl border border-border p-3"><div className="grid items-end gap-3 sm:grid-cols-[32px_minmax(0,1fr)_130px_32px]"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-xs font-black">{index + 1}</span><EditorField label="Field title"><input value={field.title} onChange={(event) => updateField(field.field_uuid, { title: event.target.value })} className="h-9 w-full rounded-lg border border-border px-3 text-sm" /></EditorField><EditorField label="Type"><select value={field.type} onChange={(event) => updateField(field.field_uuid, { type: event.target.value as 'text' | 'media', allowed_types: [] })} className="h-9 w-full rounded-lg border border-border bg-card px-2 text-sm"><option value="text">Text</option><option value="media">Media</option></select></EditorField><button onClick={() => setFields((current) => current.filter((item) => item.field_uuid !== field.field_uuid))} className="mb-0.5 rounded-md p-2 text-red-500 hover:bg-red-50"><Trash2 size={14} /></button></div>{field.type === 'media' && <div className="ml-11 mt-3 flex gap-4">{['image', 'video', 'pdf'].map((type) => <CheckField key={type} checked={field.allowed_types.includes(type)} onChange={(checked) => updateField(field.field_uuid, { allowed_types: checked ? [...field.allowed_types, type] : field.allowed_types.filter((item) => item !== type) })}>{type === 'pdf' ? 'PDF' : type}</CheckField>)}</div>}<div className="ml-11 mt-3"><CheckField checked={field.restricted} onChange={(checked) => updateField(field.field_uuid, { restricted: checked })}>Restricted field — requires “Contribute restricted fields”</CheckField></div></div>)}{!fields.length && <div className="rounded-xl border border-dashed border-border py-8 text-center text-xs text-muted-foreground">No evidence fields.</div>}</div><div className="mt-4"><CheckField checked={completionRestricted} onChange={setCompletionRestricted}>Restricted completion — requires “Complete restricted objectives”</CheckField></div></section>}
        <section className="border-t border-border pt-5"><h3 className="text-sm font-black">Assignment defaults</h3><p className="mt-1 text-xs text-muted-foreground">Specific dates are filled in during assignment.</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><EditorField label="Open"><select value={startRule} onChange={(event) => setStartRule(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"><option value="any_time">Any time</option><option value="phase_start">Phase start</option><option value="specific_date">Specific date</option></select></EditorField><EditorField label="Due"><select value={dueRule} onChange={(event) => { setDueRule(event.target.value); if (event.target.value === 'optional') setAllowLate(false) }} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"><option value="optional">Optional</option><option value="phase_end">Phase end</option><option value="specific_date">Specific date</option></select></EditorField>{dueRule !== 'optional' && <div className="sm:col-span-2"><CheckField checked={allowLate} onChange={setAllowLate}>Allow late submissions</CheckField></div>}</div></section>
      </div><div className="flex shrink-0 justify-end border-t border-border pt-4"><button onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-black px-5 py-2.5 text-xs font-black text-white disabled:opacity-50">{saving && <Loader2 size={14} className="animate-spin" />}Save objective</button></div>
    </div>} />
  </>
}

function EditorField({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-bold"><span className="mb-2 block">{label}</span>{children}</label> }
// eslint-disable-next-line no-unused-vars
function CheckField({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: React.ReactNode }) { return <label className="inline-flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-black" />{children}</label> }
