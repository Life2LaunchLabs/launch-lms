'use client'

import React from 'react'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { Check, Layers3, Loader2, Mail, Plus, Search, Send, User, Users } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { usePlan } from '@components/Hooks/usePlan'
import { getAPIUrl } from '@services/config/config'
import { planMeetsRequirement } from '@services/plans/plans'
import { swrFetcher } from '@services/utils/ts/requests'
import { programsApi } from '@services/programs/programs'
import { cn } from '@/lib/utils'

type AssignmentTarget = { type: 'user' | 'group'; id: number }
type PhaseDate = { phase_uuid: string; start_date: string; end_date: string }
type ObjectiveRule = { objective_uuid: string; phase_uuid: string; start_rule: string; start_date: string; due_rule: string; due_date: string; allow_late: boolean }

type Props = {
  trigger: React.ReactNode
  initialProgramUuids?: string[]
  initialUserIds?: number[]
  initialGroupIds?: number[]
  onAssigned?: () => void | Promise<void>
}

const dateValue = (date: Date) => date.toISOString().slice(0, 10)
const today = () => dateValue(new Date())
const addDays = (value: string, days: number) => { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + days); return dateValue(date) }
const targetKey = (target: AssignmentTarget) => `${target.type}:${target.id}`

export default function ProgramAssignmentModal({ trigger, initialProgramUuids = [], initialUserIds = [], initialGroupIds = [], onAssigned }: Props) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const orgId = Number(org?.id)
  const canUseGroups = planMeetsRequirement(usePlan(), 'full')
  const currentUserId = Number(session?.data?.user?.id || 0)
  const initialProgramUuid = initialProgramUuids[0] || ''
  const [open, setOpen] = React.useState(false)
  const [step, setStep] = React.useState(0)
  const [programUuid, setProgramUuid] = React.useState(initialProgramUuid)
  const [targets, setTargets] = React.useState<AssignmentTarget[]>([
    ...initialUserIds.map((id) => ({ type: 'user' as const, id })),
    ...(canUseGroups ? initialGroupIds.map((id) => ({ type: 'group' as const, id })) : []),
  ])
  const [phaseDates, setPhaseDates] = React.useState<PhaseDate[]>([])
  const [objectiveRules, setObjectiveRules] = React.useState<ObjectiveRule[]>([])
  const [scheduleProgramUuid, setScheduleProgramUuid] = React.useState('')
  const [staffIds, setStaffIds] = React.useState<number[]>([])
  const [ownerId, setOwnerId] = React.useState('')
  const [externalEmails, setExternalEmails] = React.useState<string[]>([])
  const [externalEmail, setExternalEmail] = React.useState('')
  const [initiateDate, setInitiateDate] = React.useState(today())
  const [welcome, setWelcome] = React.useState('')
  const [programSearch, setProgramSearch] = React.useState('')
  const [recipientSearch, setRecipientSearch] = React.useState('')
  const [recipientType, setRecipientType] = React.useState<'people' | 'groups' | 'external'>('people')
  const [saving, setSaving] = React.useState(false)

  const enabled = open && orgId && token
  const { data: programs, isLoading: programsLoading } = useSWR(enabled ? `${getAPIUrl()}planning/templates?org_id=${orgId}` : null, (url) => swrFetcher(url, token), { revalidateOnFocus: false })
  const { data: selectedProgram, isLoading: selectedProgramLoading } = useSWR(enabled && programUuid ? `${getAPIUrl()}planning/templates/${encodeURIComponent(programUuid)}?org_id=${orgId}` : null, (url) => swrFetcher(url, token), { revalidateOnFocus: false })
  const { data: people, isLoading: peopleLoading } = useSWR(enabled ? `${getAPIUrl()}orgs/${orgId}/users?page=1&limit=100` : null, (url) => swrFetcher(url, token), { revalidateOnFocus: false })
  const { data: groups, isLoading: groupsLoading } = useSWR(enabled && canUseGroups ? `${getAPIUrl()}usergroups/org/${orgId}?org_id=${orgId}` : null, (url) => swrFetcher(url, token), { revalidateOnFocus: false })
  const memberships = people?.items || []
  const staff = memberships.filter(isProgramStaff)

  React.useEffect(() => {
    if (!open || staffIds.length || !currentUserId || !staff.some((membership: any) => Number((membership.user || membership).id) === currentUserId)) return
    setStaffIds([currentUserId]); setOwnerId(String(currentUserId))
  }, [open, currentUserId, staff, staffIds.length])

  React.useEffect(() => {
    if (!selectedProgram || scheduleProgramUuid === selectedProgram.program_uuid) return
    let cursor = today()
    setPhaseDates((selectedProgram.phases || []).map((phase: any) => {
      const start = cursor
      const end = addDays(start, Math.max(1, Number(phase.suggested_duration_weeks || 1) * 7) - 1)
      cursor = addDays(end, 1)
      return { phase_uuid: phase.phase_uuid, start_date: start, end_date: end }
    }))
    setObjectiveRules((selectedProgram.phases || []).flatMap((phase: any) => (phase.objectives || []).map((objective: any) => ({
      objective_uuid: objective.objective_uuid,
      phase_uuid: phase.phase_uuid,
      start_rule: objective.default_start_rule || 'any_time',
      start_date: '',
      due_rule: objective.default_due_rule || 'optional',
      due_date: '',
      allow_late: Boolean(objective.default_allow_late),
    }))))
    setWelcome(selectedProgram.instructions || '')
    setScheduleProgramUuid(selectedProgram.program_uuid)
  }, [selectedProgram, scheduleProgramUuid])

  const reset = React.useCallback(() => {
    setStep(0)
    setProgramUuid(initialProgramUuid)
    setTargets([
      ...initialUserIds.map((id) => ({ type: 'user' as const, id })),
      ...(canUseGroups ? initialGroupIds.map((id) => ({ type: 'group' as const, id })) : []),
    ])
    setPhaseDates([])
    setObjectiveRules([])
    setScheduleProgramUuid('')
    setStaffIds([])
    setOwnerId('')
    setExternalEmails([])
    setExternalEmail('')
    setInitiateDate(today())
    setWelcome('')
    setProgramSearch('')
    setRecipientSearch('')
  }, [canUseGroups, initialGroupIds, initialProgramUuid, initialUserIds])

  React.useEffect(() => {
    if (!canUseGroups && recipientType === 'groups') setRecipientType('people')
  }, [canUseGroups, recipientType])

  const changeOpen = (next: boolean) => { setOpen(next); if (!next && !saving) reset() }
  const selectProgram = (uuid: string) => {
    if (uuid === programUuid) return
    setProgramUuid(uuid)
    setScheduleProgramUuid('')
    setPhaseDates([])
    setObjectiveRules([])
  }
  const toggleTarget = (target: AssignmentTarget) => setTargets((current) => current.some((item) => targetKey(item) === targetKey(target)) ? current.filter((item) => targetKey(item) !== targetKey(target)) : [...current, target])
  const toggleStaff = (id: number) => setStaffIds((current) => {
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    if (!ownerId && next.length) setOwnerId(String(next[0]))
    if (ownerId && !next.includes(Number(ownerId))) setOwnerId(next.length ? String(next[0]) : '')
    return next
  })
  const updatePhase = (uuid: string, patch: Partial<PhaseDate>) => setPhaseDates((current) => current.map((item) => item.phase_uuid === uuid ? { ...item, ...patch } : item))
  const updateObjective = (uuid: string, patch: Partial<ObjectiveRule>) => setObjectiveRules((current) => current.map((item) => item.objective_uuid === uuid ? { ...item, ...patch } : item))

  const scheduleIsValid = () => {
    if (selectedProgramLoading || !selectedProgram || scheduleProgramUuid !== programUuid) return false
    if (phaseDates.some((phase) => !phase.start_date || !phase.end_date || phase.end_date < phase.start_date)) return false
    if (objectiveRules.some((rule) => (rule.start_rule === 'specific_date' && !rule.start_date) || (rule.due_rule === 'specific_date' && !rule.due_date))) return false
    return true
  }
  const continueFromSchedule = () => {
    if (!scheduleIsValid()) return toast.error('Complete every phase and objective scheduling requirement.')
    setStep(2)
  }

  const submit = async () => {
    if (!programUuid || (!targets.length && !externalEmails.length) || !staffIds.length || !ownerId || !initiateDate || !scheduleIsValid() || saving) return
    setSaving(true)
    const starts = phaseDates.map((phase) => phase.start_date).sort()
    const ends = phaseDates.map((phase) => phase.end_date).sort()
    const payloadBase = {
      staff_user_ids: staffIds,
      owner_user_id: Number(ownerId),
      initiate_date: initiateDate === today() ? new Date().toISOString() : new Date(`${initiateDate}T09:00:00`).toISOString(),
      start_date: starts.length ? new Date(`${starts[0]}T00:00:00`).toISOString() : null,
      due_date: ends.length ? new Date(`${ends[ends.length - 1]}T23:59:59`).toISOString() : null,
      schedule: { phases: phaseDates, objectives: objectiveRules },
      welcome_message: welcome,
    }
    const targetRequests = targets.map((target) => programsApi.assign(orgId, programUuid, {
      ...payloadBase,
      ...(target.type === 'group' ? { usergroup_id: target.id } : { user_id: target.id }),
    }, token))
    const externalRequests = externalEmails.map((email) => programsApi.assign(orgId, programUuid, { ...payloadBase, subject_email: email }, token))
    const results = await Promise.allSettled([...targetRequests, ...externalRequests])
    const failed = results.filter((result) => result.status === 'rejected')
    const succeeded = results.length - failed.length
    try {
      if (succeeded) {
        await mutate((key) => typeof key === 'string' && (key.includes(`${getAPIUrl()}planning`) || key.includes(`${getAPIUrl()}programs`)))
        await onAssigned?.()
      }
      if (!failed.length) {
        toast.success(`${succeeded} ${succeeded === 1 ? 'assignment' : 'assignments'} created.`)
        setOpen(false)
        reset()
      } else {
        const first = failed[0] as PromiseRejectedResult
        toast.error(`${succeeded ? `${succeeded} created; ` : ''}${failed.length} failed. ${first.reason?.message || 'Please try again.'}`)
      }
    } finally { setSaving(false) }
  }

  const programQuery = programSearch.trim().toLowerCase()
  const visiblePrograms = (programs || []).filter((program: any) => `${program.name} ${program.description || ''}`.toLowerCase().includes(programQuery))
  const recipientQuery = recipientSearch.trim().toLowerCase()
  const visiblePeople = memberships.filter((membership: any) => personName(membership.user || membership).toLowerCase().includes(recipientQuery))
  const visibleGroups = (groups || []).filter((group: any) => `${group.name} ${group.description || ''}`.toLowerCase().includes(recipientQuery))
  const assignmentCount = targets.length + externalEmails.length
  const addExternalEmail = () => {
    const email = externalEmail.trim().toLowerCase()
    if (!email.includes('@')) return toast.error('Enter a valid email address.')
    if (externalEmails.includes(email)) return toast.error('That email is already included.')
    setExternalEmails((current) => [...current, email]); setExternalEmail('')
  }

  return <Modal isDialogOpen={open} onOpenChange={changeOpen} minHeight="no-min" minWidth="no-min" customHeight="h-[min(820px,92dvh)]" customWidth="md:w-[min(1100px,95vw)]" dialogTitle="Assign a plan template" dialogDescription={step === 0 ? `Choose one template and one or more ${canUseGroups ? 'people, groups, or external recipients' : 'people or external recipients'}.` : step === 1 ? `Configure the schedule${selectedProgram?.name ? ` for ${selectedProgram.name}` : ''}.` : 'Choose responsible staff and prepare the invitation.'} dialogTrigger={trigger} dialogContent={<div className="flex h-full min-h-0 flex-col">
    <div className="mb-4 flex shrink-0 items-center gap-2 text-xs font-black"><StepNumber active={step === 0} complete={step > 0}>1</StepNumber><span className={step === 0 ? 'text-foreground' : 'text-muted-foreground'}>Template & recipients</span><StepDivider /><StepNumber active={step === 1} complete={step > 1}>2</StepNumber><span className={step === 1 ? 'text-foreground' : 'text-muted-foreground'}>Schedule</span><StepDivider /><StepNumber active={step === 2}>3</StepNumber><span className={step === 2 ? 'text-foreground' : 'text-muted-foreground'}>Staff & invitation</span></div>
    {step === 0 && <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-2">
      <PickerSection title="Plan template" count={programUuid ? 1 : 0} search={programSearch} setSearch={setProgramSearch} placeholder="Search templates">{programsLoading ? <Loading /> : visiblePrograms.length ? visiblePrograms.map((program: any) => <PickerRow key={program.program_uuid} selected={programUuid === program.program_uuid} onClick={() => selectProgram(program.program_uuid)} icon={<Layers3 size={16} />} title={program.name} description={program.description || 'Plan template'} />) : <Empty>No plan templates found.</Empty>}</PickerSection>
      <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border"><div className="shrink-0 border-b border-border p-3"><div className="flex items-center justify-between"><h3 className="text-sm font-black">Recipients</h3><Count value={assignmentCount} /></div><div className={cn('mt-3 grid rounded-lg bg-muted p-1', canUseGroups ? 'grid-cols-3' : 'grid-cols-2')}><button onClick={() => setRecipientType('people')} className={cn('rounded-md px-2 py-1.5 text-xs font-bold', recipientType === 'people' && 'bg-card shadow-xs')}>People</button>{canUseGroups ? <button onClick={() => setRecipientType('groups')} className={cn('rounded-md px-2 py-1.5 text-xs font-bold', recipientType === 'groups' && 'bg-card shadow-xs')}>Groups</button> : null}<button onClick={() => setRecipientType('external')} className={cn('rounded-md px-2 py-1.5 text-xs font-bold', recipientType === 'external' && 'bg-card shadow-xs')}>External</button></div>{recipientType !== 'external' ? <SearchInput value={recipientSearch} onChange={setRecipientSearch} placeholder={`Search ${recipientType}`} /> : null}</div><div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">{recipientType === 'external' ? <div className="space-y-3"><div className="flex gap-2"><input type="email" value={externalEmail} onChange={(event) => setExternalEmail(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addExternalEmail() } }} placeholder="person@example.com" className="h-10 min-w-0 flex-1 rounded-lg border border-border px-3 text-sm" /><button onClick={addExternalEmail} className="rounded-lg bg-foreground px-3 text-background"><Plus size={14} /></button></div><p className="text-xs leading-5 text-muted-foreground">External recipients do not join the organization or consume a member seat.</p>{externalEmails.map((email) => <div key={email} className="flex items-center gap-2 rounded-lg border border-border p-3"><Mail size={15} className="text-blue-600" /><span className="min-w-0 flex-1 truncate text-xs font-bold">{email}</span><button onClick={() => setExternalEmails((current) => current.filter((item) => item !== email))} className="text-xs font-black text-red-600">Remove</button></div>)}</div> : recipientType === 'people' ? peopleLoading ? <Loading /> : visiblePeople.length ? visiblePeople.map((membership: any) => { const person = membership.user || membership; return <PickerRow key={person.id} selected={targets.some((item) => item.type === 'user' && item.id === Number(person.id))} onClick={() => toggleTarget({ type: 'user', id: Number(person.id) })} icon={<User size={16} />} title={personName(person)} description={membership.role?.name || person.email || 'Organization member'} /> }) : <Empty>No people found.</Empty> : groupsLoading ? <Loading /> : visibleGroups.length ? visibleGroups.map((group: any) => <PickerRow key={group.id} selected={targets.some((item) => item.type === 'group' && item.id === Number(group.id))} onClick={() => toggleTarget({ type: 'group', id: Number(group.id) })} icon={<Users size={16} />} title={group.name} description={group.description || 'Group'} />) : <Empty>No groups found.</Empty>}</div></div>
    </div>}
    {step === 1 && <div className="min-h-0 flex-1 overflow-y-auto pr-1">{selectedProgramLoading || !selectedProgram || scheduleProgramUuid !== programUuid ? <Loading /> : <ScheduleStep program={selectedProgram} phaseDates={phaseDates} updatePhase={updatePhase} objectiveRules={objectiveRules} updateObjective={updateObjective} />}</div>}
    {step === 2 && <div className="min-h-0 flex-1 overflow-y-auto pr-1"><div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]"><section><div className="mb-3"><h3 className="text-sm font-black">Responsible staff</h3><p className="mt-1 text-xs text-muted-foreground">Staff can review work and manage learner progress. You’re selected automatically when eligible.</p></div><div className="grid gap-2 sm:grid-cols-2">{staff.map((membership: any) => { const person = membership.user || membership; return <PickerRow key={person.id} selected={staffIds.includes(Number(person.id))} onClick={() => toggleStaff(Number(person.id))} icon={<User size={16} />} title={personName(person)} description={membership.role?.name || 'Staff'} /> })}{!staff.length && <Empty>No staff with plan management permission are available.</Empty>}</div></section><aside className="space-y-4 rounded-xl border border-border bg-muted/20 p-4"><div><p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Summary</p><p className="mt-1 text-lg font-black">{assignmentCount} {assignmentCount === 1 ? 'assignment' : 'assignments'}</p><p className="text-xs text-muted-foreground">{selectedProgram?.name} · {assignmentCount} {assignmentCount === 1 ? 'recipient' : 'recipients'}</p></div><label className="block text-xs font-bold"><span className="mb-1.5 block">Accountable owner</span><select value={ownerId} onChange={(event) => setOwnerId(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-card px-3"><option value="">Choose owner</option>{staff.filter((membership: any) => staffIds.includes(Number((membership.user || membership).id))).map((membership: any) => { const person = membership.user || membership; return <option key={person.id} value={person.id}>{personName(person)}</option> })}</select></label><label className="block text-xs font-bold"><span className="mb-1.5 block">Invitation date</span><input type="date" value={initiateDate} onChange={(event) => setInitiateDate(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-card px-3" /></label><label className="block text-xs font-bold"><span className="mb-1.5 block">Welcome message <span className="font-normal text-muted-foreground">(optional)</span></span><textarea value={welcome} onChange={(event) => setWelcome(event.target.value)} rows={6} className="w-full resize-none rounded-lg border border-border bg-card p-3 text-sm" placeholder="Add context for learners" /></label></aside></div></div>}
    <div className="mt-4 flex shrink-0 items-center justify-between border-t border-border pt-4"><button onClick={() => step === 0 ? changeOpen(false) : setStep((current) => current - 1)} disabled={saving} className="rounded-lg border border-border px-4 py-2 text-xs font-black">{step === 0 ? 'Cancel' : 'Back'}</button>{step === 0 ? <button onClick={() => setStep(1)} disabled={!programUuid || !assignmentCount} className="rounded-lg bg-black px-5 py-2.5 text-xs font-black text-white disabled:opacity-40">Configure schedule</button> : step === 1 ? <button onClick={continueFromSchedule} disabled={selectedProgramLoading || scheduleProgramUuid !== programUuid} className="rounded-lg bg-black px-5 py-2.5 text-xs font-black text-white disabled:opacity-40">Continue</button> : <button onClick={() => void submit()} disabled={!staffIds.length || !ownerId || !initiateDate || saving} className="inline-flex items-center gap-2 rounded-lg bg-black px-5 py-2.5 text-xs font-black text-white disabled:opacity-40">{saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}Create {assignmentCount === 1 ? 'assignment' : `${assignmentCount} assignments`}</button>}</div>
  </div>} />
}

function ScheduleStep({ program, phaseDates, updatePhase, objectiveRules, updateObjective }: any) {
  return <div className="space-y-5">{(program.phases || []).map((phase: any) => {
    const dates = phaseDates.find((item: PhaseDate) => item.phase_uuid === phase.phase_uuid)
    return <section key={phase.phase_uuid} className="overflow-hidden rounded-xl border border-border"><header className="flex flex-wrap items-end gap-3 border-b border-border bg-muted/40 px-4 py-3"><div className="min-w-44 flex-1"><p className="text-sm font-black">{phase.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{phase.description || (phase.suggested_duration_weeks ? `${phase.suggested_duration_weeks} weeks suggested` : 'Configure the phase window')}</p></div><DateField label="Start" value={dates?.start_date || ''} onChange={(value) => updatePhase(phase.phase_uuid, { start_date: value })} /><DateField label="End" value={dates?.end_date || ''} onChange={(value) => updatePhase(phase.phase_uuid, { end_date: value })} /></header><div className="overflow-x-auto"><div className="grid min-w-[850px] grid-cols-[minmax(220px,1fr)_90px_170px_145px_170px_145px_110px] gap-2 border-b border-border bg-card px-3 py-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground"><span>Objective</span><span>Type</span><span>Open</span><span>Date</span><span>Due</span><span>Submit by</span><span>Late</span></div>{(phase.objectives || []).map((objective: any) => {
      const rule = objectiveRules.find((item: ObjectiveRule) => item.objective_uuid === objective.objective_uuid)
      if (!rule) return null
      return <div key={objective.objective_uuid} className="grid min-w-[850px] grid-cols-[minmax(220px,1fr)_90px_170px_145px_170px_145px_110px] items-center gap-2 border-b border-border px-3 py-2 last:border-b-0"><p className="truncate text-xs font-bold" title={objective.title}>{objective.title}</p><span className="text-[10px] font-bold uppercase text-muted-foreground">{objective.kind === 'badge' ? 'Badge' : 'Activity'}</span><CompactSelect value={rule.start_rule} onChange={(value) => updateObjective(objective.objective_uuid, { start_rule: value })} options={[["any_time", "Any time"], ["phase_start", "Phase start"], ["specific_date", "Date"]]} />{rule.start_rule === 'specific_date' ? <CompactDate value={rule.start_date} onChange={(value) => updateObjective(objective.objective_uuid, { start_date: value })} /> : <span className="text-xs text-muted-foreground">{rule.start_rule === 'phase_start' ? dates?.start_date || '—' : '—'}</span>}<CompactSelect value={rule.due_rule} onChange={(value) => updateObjective(objective.objective_uuid, { due_rule: value, allow_late: value === 'optional' ? false : rule.allow_late })} options={[["optional", "Optional"], ["phase_end", "Phase end"], ["specific_date", "Date"]]} />{rule.due_rule === 'specific_date' ? <CompactDate value={rule.due_date} onChange={(value) => updateObjective(objective.objective_uuid, { due_date: value })} /> : <span className="text-xs text-muted-foreground">{rule.due_rule === 'phase_end' ? dates?.end_date || '—' : '—'}</span>}{rule.due_rule === 'optional' ? <span className="text-xs text-muted-foreground">—</span> : <label className="inline-flex items-center gap-1.5 text-xs font-bold"><input type="checkbox" checked={rule.allow_late} onChange={(event) => updateObjective(objective.objective_uuid, { allow_late: event.target.checked })} className="h-4 w-4 accent-black" />Allow</label>}</div>
    })}</div></section>
  })}{!(program.phases || []).length && <Empty>This plan template has no phases to schedule.</Empty>}</div>
}

// eslint-disable-next-line no-unused-vars
function DateField({ label, value, onChange }: { label: string; value: string; onChange: (_value: string) => void }) { return <label className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground"><span className="mb-1 block">{label}</span><input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="h-8 rounded-md border border-border bg-card px-2 text-xs font-normal text-foreground" /></label> }
// eslint-disable-next-line no-unused-vars
function CompactSelect({ value, onChange, options }: { value: string; onChange: (_value: string) => void; options: string[][] }) { return <select value={value} onChange={(event) => onChange(event.target.value)} className="h-8 min-w-0 rounded-md border border-border bg-card px-2 text-xs">{options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select> }
// eslint-disable-next-line no-unused-vars
function CompactDate({ value, onChange }: { value: string; onChange: (_value: string) => void }) { return <input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="h-8 min-w-0 rounded-md border border-border px-2 text-[11px]" /> }
// eslint-disable-next-line no-unused-vars
function PickerSection({ title, count, search, setSearch, placeholder, children }: { title: string; count: number; search: string; setSearch: (_value: string) => void; placeholder: string; children: React.ReactNode }) { return <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border"><div className="shrink-0 border-b border-border p-3"><div className="flex items-center justify-between"><h3 className="text-sm font-black">{title}</h3><Count value={count} /></div><SearchInput value={search} onChange={setSearch} placeholder={placeholder} /></div><div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">{children}</div></section> }
// eslint-disable-next-line no-unused-vars
function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (_value: string) => void; placeholder: string }) { return <div className="relative mt-3"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></div> }
function PickerRow({ selected, onClick, icon, title, description }: { selected: boolean; onClick: () => void; icon: React.ReactNode; title: string; description: string }) { return <button type="button" onClick={onClick} aria-pressed={selected} className={cn('flex w-full items-center gap-3 rounded-lg border p-3 text-left transition', selected ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-100' : 'border-border bg-card hover:border-foreground/30')}><span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', selected ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground')}>{selected ? <Check size={15} /> : icon}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-black">{title}</span><span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{description}</span></span></button> }
function StepNumber({ active, complete = false, children }: { active: boolean; complete?: boolean; children: React.ReactNode }) { return <span className={cn('flex h-6 w-6 items-center justify-center rounded-full border text-[10px]', (active || complete) ? 'border-black bg-black text-white' : 'border-border text-muted-foreground')}>{complete ? <Check size={12} /> : children}</span> }
function StepDivider() { return <span className="mx-2 h-px w-8 bg-border" /> }
function Count({ value }: { value: number }) { return <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-black text-muted-foreground">{value} selected</span> }
function Loading() { return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted-foreground" size={20} /></div> }
function Empty({ children }: { children: React.ReactNode }) { return <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">{children}</div> }
function personName(person: any) { return [person.first_name, person.last_name].filter(Boolean).join(' ') || person.username || person.email || 'Organization member' }

function isProgramStaff(membership: any) {
  const role = membership?.role
  if (!role) return false
  if ([1, 2].includes(Number(role.id))) return true
  const rights = role.rights || {}
  return Boolean(rights.dashboard?.action_access && rights.learning_activities?.action_update)
}
