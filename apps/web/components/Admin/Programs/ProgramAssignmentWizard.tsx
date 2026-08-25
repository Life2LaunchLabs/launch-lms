'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { ArrowLeft, ArrowRight, CalendarDays, Check, Layers3, Loader2, Mail, Plus, Users } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { errorHandling, RequestBodyWithAuthHeader, swrFetcher } from '@services/utils/ts/requests'
import { programsApi } from '@services/programs/programs'
import { cn } from '@/lib/utils'

type PhaseDate = { phase_uuid: string; start_date: string; end_date: string }
type ObjectiveRule = { objective_uuid: string; phase_uuid: string; start_rule: string; start_date: string; due_rule: string; due_date: string; allow_late: boolean }

const steps = ['Cohort', 'Staff', 'Schedule', 'Invitation']
const dateValue = (date: Date) => date.toISOString().slice(0, 10)
const addDays = (value: string, days: number) => { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + days); return dateValue(date) }

export default function ProgramAssignmentWizard({ orgslug, programUuid }: { orgslug: string; programUuid: string }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const orgId = Number(org?.id)
  const router = useRouter()
  const { data: program, isLoading } = useSWR(orgId && token ? `${getAPIUrl()}programs/${programUuid}?org_id=${orgId}` : null, (url) => swrFetcher(url, token))
  const { data: groups, mutate: refreshGroups } = useSWR(orgId && token ? `${getAPIUrl()}usergroups/org/${orgId}?org_id=${orgId}` : null, (url) => swrFetcher(url, token))
  const { data: people } = useSWR(orgId && token ? `${getAPIUrl()}orgs/${orgId}/users?page=1&limit=100` : null, (url) => swrFetcher(url, token))
  const [step, setStep] = React.useState(0)
  const [groupId, setGroupId] = React.useState('')
  const [creatingGroup, setCreatingGroup] = React.useState(false)
  const [groupName, setGroupName] = React.useState('')
  const [groupDescription, setGroupDescription] = React.useState('')
  const [staffIds, setStaffIds] = React.useState<number[]>([])
  const [initiateDate, setInitiateDate] = React.useState(dateValue(new Date()))
  const [phaseDates, setPhaseDates] = React.useState<PhaseDate[]>([])
  const [objectiveRules, setObjectiveRules] = React.useState<ObjectiveRule[]>([])
  const [welcome, setWelcome] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!program || phaseDates.length) return
    let cursor = dateValue(new Date())
    const phases = (program.phases || []).map((phase: any) => {
      const start = cursor
      const end = addDays(start, Math.max(1, Number(phase.suggested_duration_weeks || 1) * 7) - 1)
      cursor = addDays(end, 1)
      return { phase_uuid: phase.phase_uuid, start_date: start, end_date: end }
    })
    setPhaseDates(phases)
    setObjectiveRules((program.phases || []).flatMap((phase: any) => (phase.objectives || []).map((objective: any) => ({
      objective_uuid: objective.objective_uuid,
      phase_uuid: phase.phase_uuid,
      start_rule: objective.default_start_rule || 'any_time',
      start_date: '',
      due_rule: objective.default_due_rule || 'optional',
      due_date: '',
      allow_late: Boolean(objective.default_allow_late),
    }))))
    setWelcome(program.instructions || '')
  }, [program, phaseDates.length])

  if (isLoading || !program) return <div className="flex min-h-[70vh] items-center justify-center bg-[#f8f8f8]"><Loader2 className="animate-spin text-muted-foreground" /></div>
  const members = (people?.items || []).filter(isProgramStaff)
  const updatePhase = (uuid: string, patch: Partial<PhaseDate>) => setPhaseDates((current) => current.map((item) => item.phase_uuid === uuid ? { ...item, ...patch } : item))
  const updateObjective = (uuid: string, patch: Partial<ObjectiveRule>) => setObjectiveRules((current) => current.map((item) => item.objective_uuid === uuid ? { ...item, ...patch } : item))
  const selectedGroup = (groups || []).find((group: any) => String(group.id) === groupId)

  const next = async () => {
    if (step === 0 && creatingGroup) {
      if (!groupName.trim()) return toast.error('Enter a cohort name.')
      setSaving(true)
      try {
        const response = await fetch(`${getAPIUrl()}usergroups/?org_id=${orgId}`, RequestBodyWithAuthHeader('POST', { org_id: orgId, name: groupName.trim(), description: groupDescription }, null, token))
        const created = await errorHandling(response)
        setGroupId(String(created.id)); setCreatingGroup(false); await refreshGroups()
      } catch (error: any) { toast.error(error?.message || 'Could not create the cohort.'); return } finally { setSaving(false) }
    }
    if (step === 0 && !groupId && !creatingGroup) return toast.error('Choose or create a cohort.')
    if (step === 1 && !staffIds.length) return toast.error('Assign at least one staff member.')
    if (step === 2) {
      if (!initiateDate) return toast.error('Choose an initiate date.')
      if (phaseDates.some((phase) => !phase.start_date || !phase.end_date || phase.end_date < phase.start_date)) return toast.error('Check the start and end date for every phase.')
      if (objectiveRules.some((rule) => (rule.start_rule === 'specific_date' && !rule.start_date) || (rule.due_rule === 'specific_date' && !rule.due_date))) return toast.error('Fill in each specific objective date.')
    }
    setStep((current) => Math.min(3, current + 1))
  }

  const submit = async () => {
    setSaving(true)
    try {
      const starts = phaseDates.map((phase) => phase.start_date).sort()
      const ends = phaseDates.map((phase) => phase.end_date).sort()
      await programsApi.assign(orgId, programUuid, {
        usergroup_id: Number(groupId), staff_user_ids: staffIds,
        initiate_date: new Date(`${initiateDate}T09:00:00`).toISOString(),
        start_date: starts.length ? new Date(`${starts[0]}T00:00:00`).toISOString() : null,
        due_date: ends.length ? new Date(`${ends[ends.length - 1]}T23:59:59`).toISOString() : null,
        schedule: { phases: phaseDates, objectives: objectiveRules }, welcome_message: welcome,
      }, token)
      toast.success('Program assignment scheduled.')
      router.push(getUriWithOrg(orgslug, routePaths.org.dash.programPage(programUuid, 'assignments')))
    } catch (error: any) { toast.error(error?.message || 'Could not assign the program.') } finally { setSaving(false) }
  }

  return <main className="min-h-full bg-[#f8f8f8] px-6 py-7"><div className="mx-auto max-w-6xl">
    <Link href={getUriWithOrg(orgslug, routePaths.org.dash.programPage(programUuid, 'assignments'))} className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground"><ArrowLeft size={14} />Back to assignments</Link>
    <div className="mt-5 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]"><aside><div className="rounded-xl border border-border bg-card p-4 shadow-xs"><div className="flex items-center gap-3 border-b border-border pb-4"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Layers3 size={17} /></span><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Assign program</p><p className="truncate text-sm font-black">{program.name}</p></div></div><ol className="mt-4 space-y-1">{steps.map((label, index) => <li key={label}><button onClick={() => index < step && setStep(index)} disabled={index > step} className={cn('flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-xs font-bold', index === step ? 'bg-foreground text-background' : index < step ? 'text-foreground hover:bg-muted' : 'text-muted-foreground')}><span className={cn('flex h-5 w-5 items-center justify-center rounded-full border text-[10px]', index < step && 'border-green-600 bg-green-600 text-white')}>{index < step ? <Check size={11} /> : index + 1}</span>{label}</button></li>)}</ol></div></aside>
      <section className="rounded-xl border border-border bg-card shadow-xs"><div className="border-b border-border px-6 py-5"><p className="text-xs font-black uppercase tracking-widest text-blue-600">Step {step + 1} of 4</p><h1 className="mt-1 text-2xl font-black">{step === 0 ? 'Choose a cohort' : step === 1 ? 'Assign staff' : step === 2 ? 'Set the schedule' : 'Prepare the invitation'}</h1><p className="mt-1 text-sm text-muted-foreground">{step === 0 ? 'Use an existing cohort or create one here.' : step === 1 ? 'Choose the staff responsible for this program.' : step === 2 ? 'Set exact phase dates and customize objective rules.' : 'Choose when invitations go out and add a welcome message.'}</p></div>
        <div className="min-h-[440px] p-6">
          {step === 0 && <div className="grid gap-3 sm:grid-cols-2">{(groups || []).map((group: any) => <button key={group.id} onClick={() => { setGroupId(String(group.id)); setCreatingGroup(false) }} className={cn('flex items-center gap-3 rounded-xl border p-4 text-left', groupId === String(group.id) ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : 'border-border hover:bg-muted/40')}><Users size={19} className="text-blue-600" /><div><p className="text-sm font-black">{group.name}</p><p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{group.description || 'Cohort'}</p></div></button>)}<button onClick={() => { setCreatingGroup(true); setGroupId('') }} className={cn('flex items-center gap-3 rounded-xl border border-dashed p-4 text-left', creatingGroup ? 'border-blue-500 bg-blue-50' : 'border-border hover:bg-muted/40')}><Plus size={19} /><span className="text-sm font-black">Create a cohort</span></button>{creatingGroup && <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4 sm:col-span-2"><Field label="Cohort name"><input autoFocus value={groupName} onChange={(e) => setGroupName(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm" /></Field><Field label="Description (optional)"><textarea value={groupDescription} onChange={(e) => setGroupDescription(e.target.value)} rows={2} className="w-full rounded-lg border border-border bg-card p-3 text-sm" /></Field></div>}</div>}
          {step === 1 && <StaffStep members={members} staffIds={staffIds} setStaffIds={setStaffIds} />}
          {step === 2 && <ScheduleStep program={program} initiateDate={initiateDate} setInitiateDate={setInitiateDate} phaseDates={phaseDates} updatePhase={updatePhase} objectiveRules={objectiveRules} updateObjective={updateObjective} />}
          {step === 2 && <div className="space-y-6"><div><Field label="Initiate date"><input type="date" value={initiateDate} onChange={(e) => setInitiateDate(e.target.value)} className="h-10 w-full max-w-xs rounded-lg border border-border px-3 text-sm" /></Field><p className="mt-1 text-xs text-muted-foreground">Invitations become visible on this date. Accepted learners can view the program before objectives open.</p></div>{(program.phases || []).map((phase: any) => { const dates = phaseDates.find((item) => item.phase_uuid === phase.phase_uuid); return <div key={phase.phase_uuid} className="overflow-hidden rounded-xl border border-border"><div className="flex flex-wrap items-center gap-4 bg-muted/40 px-4 py-3"><div className="min-w-40 flex-1"><p className="text-sm font-black">{phase.name}</p><p className="text-xs text-muted-foreground">{phase.suggested_duration_weeks ? `${phase.suggested_duration_weeks} weeks suggested` : 'No suggested duration'}</p></div><DateField label="Starts" value={dates?.start_date || ''} onChange={(value) => updatePhase(phase.phase_uuid, { start_date: value })} /><DateField label="Ends" value={dates?.end_date || ''} onChange={(value) => updatePhase(phase.phase_uuid, { end_date: value })} /></div><div className="divide-y divide-border">{(phase.objectives || []).map((objective: any) => { const rule = objectiveRules.find((item) => item.objective_uuid === objective.objective_uuid); if (!rule) return null; return <div key={objective.objective_uuid} className="p-4"><p className="mb-3 text-sm font-black">{objective.title}</p><div className="grid gap-3 md:grid-cols-2"><RuleField label="Can be started" value={rule.start_rule} onChange={(value) => updateObjective(objective.objective_uuid, { start_rule: value })} options={[['any_time', 'Any time after acceptance'], ['phase_start', 'At phase start'], ['specific_date', 'On a specific date']]} date={rule.start_date} onDate={(value) => updateObjective(objective.objective_uuid, { start_date: value })} /><RuleField label="Must be completed" value={rule.due_rule} onChange={(value) => updateObjective(objective.objective_uuid, { due_rule: value })} options={[['optional', 'Optional / no deadline'], ['phase_end', 'By phase end'], ['specific_date', 'By a specific date']]} date={rule.due_date} onDate={(value) => updateObjective(objective.objective_uuid, { due_date: value })} /><label className="flex items-center gap-2 text-xs font-bold md:col-span-2"><input type="checkbox" checked={rule.allow_late} disabled={rule.due_rule === 'optional'} onChange={(e) => updateObjective(objective.objective_uuid, { allow_late: e.target.checked })} className="h-4 w-4 accent-black" />Allow late submissions</label></div></div>})}</div></div>})}</div>}
          {step === 3 && <div className="space-y-6"><div className="grid gap-3 rounded-xl bg-muted/40 p-4 sm:grid-cols-3"><Summary label="Cohort" value={selectedGroup?.name || groupName} /><Summary label="Staff" value={staffIds.length ? `${staffIds.length} assigned` : 'No staff assigned'} /><Summary label="Invitations" value={new Date(`${initiateDate}T12:00:00`).toLocaleDateString()} /></div><Field label="Welcome message"><textarea value={welcome} onChange={(e) => setWelcome(e.target.value)} rows={7} className="w-full rounded-xl border border-border p-4 text-sm leading-6" placeholder={`Welcome to ${program.name}. Share what learners should expect and how to get started.`} /></Field><div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900"><Mail className="mb-2" size={18} /><strong>Invitations are scheduled for {new Date(`${initiateDate}T12:00:00`).toLocaleDateString()}.</strong> Learners can view the program after accepting, while each objective follows the availability rules you set.</div></div>}
        </div><div className="flex items-center justify-between border-t border-border px-6 py-4"><button onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0 || saving} className="rounded-lg border border-border px-4 py-2 text-xs font-black disabled:opacity-30">Back</button>{step < 3 ? <button onClick={() => void next()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-black px-5 py-2.5 text-xs font-black text-white disabled:opacity-50">{saving && <Loader2 size={14} className="animate-spin" />}Continue<ArrowRight size={14} /></button> : <button onClick={() => void submit()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-black px-5 py-2.5 text-xs font-black text-white disabled:opacity-50">{saving ? <Loader2 size={14} className="animate-spin" /> : <CalendarDays size={14} />}Schedule assignment</button>}</div>
      </section></div></div></main>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-black"><span className="mb-2 block">{label}</span>{children}</label> }
// eslint-disable-next-line no-unused-vars
function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <Field label={label}><input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-lg border border-border bg-card px-2 text-xs" /></Field> }
// eslint-disable-next-line no-unused-vars
function RuleField({ label, value, onChange, options, date, onDate }: { label: string; value: string; onChange: (value: string) => void; options: string[][]; date: string; onDate: (value: string) => void }) { return <Field label={label}><div className="flex gap-2"><select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-card px-2 text-xs">{options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select>{value === 'specific_date' && <input type="date" value={date} onChange={(e) => onDate(e.target.value)} className="h-9 rounded-lg border border-border px-2 text-xs" />}</div></Field> }
function Summary({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 text-sm font-black">{value}</p></div> }

function StaffStep({ members, staffIds, setStaffIds }: { members: any[]; staffIds: number[]; setStaffIds: React.Dispatch<React.SetStateAction<number[]>> }) {
  return <div>
    <p className="mb-4 text-sm text-muted-foreground">Select at least one staff member. They will grade activities, confirm objectives, and progress learners through this assignment.</p>
    <div className="grid gap-2 sm:grid-cols-2">
      {members.map((membership: any) => {
        const person = membership.user || membership
        const selected = staffIds.includes(Number(person.id))
        return <button key={person.id} onClick={() => setStaffIds((current) => selected ? current.filter((id) => id !== Number(person.id)) : [...current, Number(person.id)])} className={cn('flex items-center gap-3 rounded-xl border p-3 text-left', selected ? 'border-blue-500 bg-blue-50' : 'border-border hover:bg-muted/40')}>
          <span className={cn('flex h-5 w-5 items-center justify-center rounded border', selected && 'border-blue-600 bg-blue-600 text-white')}>{selected && <Check size={12} />}</span>
          <div><p className="text-sm font-black">{[person.first_name, person.last_name].filter(Boolean).join(' ') || person.username}</p><p className="text-xs text-muted-foreground">{membership.role?.name}</p></div>
        </button>
      })}
      {!members.length && <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground sm:col-span-2">No organization staff are available. Give an organization member a staff role before assigning this program.</div>}
    </div>
  </div>
}

function ScheduleStep({ program, initiateDate, setInitiateDate, phaseDates, updatePhase, objectiveRules, updateObjective }: any) {
  return <div className="schedule-compact space-y-5">
    <style>{'.schedule-compact + .space-y-6{display:none}'}</style>
    <div className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-muted/30 p-4">
      <DateField label="Initiate" value={initiateDate} onChange={setInitiateDate} />
      <p className="max-w-xl pb-1 text-xs leading-5 text-muted-foreground">Invitations become visible on this date. Accepted learners can view the program before objectives open.</p>
    </div>
    {(program.phases || []).map((phase: any) => {
      const dates = phaseDates.find((item: PhaseDate) => item.phase_uuid === phase.phase_uuid)
      return <section key={phase.phase_uuid} className="overflow-hidden rounded-xl border border-border">
        <header className="flex flex-wrap items-end gap-3 border-b border-border bg-muted/40 px-4 py-3">
          <div className="min-w-44 flex-1"><p className="text-sm font-black">{phase.name}</p>{phase.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{phase.description}</p>}</div>
          <DateField label="Start" value={dates?.start_date || ''} onChange={(value) => updatePhase(phase.phase_uuid, { start_date: value })} />
          <DateField label="End" value={dates?.end_date || ''} onChange={(value) => updatePhase(phase.phase_uuid, { end_date: value })} />
        </header>
        <div className="overflow-x-auto">
          <div className="grid min-w-[850px] grid-cols-[minmax(220px,1fr)_90px_170px_145px_170px_145px_110px] gap-2 border-b border-border bg-card px-3 py-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
            <span>Objective</span><span>Type</span><span>Open</span><span>Date</span><span>Due</span><span>Submit by</span><span>Late</span>
          </div>
          {(phase.objectives || []).map((objective: any) => {
            const rule = objectiveRules.find((item: ObjectiveRule) => item.objective_uuid === objective.objective_uuid)
            if (!rule) return null
            return <div key={objective.objective_uuid} className="grid min-w-[850px] grid-cols-[minmax(220px,1fr)_90px_170px_145px_170px_145px_110px] items-center gap-2 border-b border-border px-3 py-2 last:border-b-0">
              <p className="truncate text-xs font-bold" title={objective.title}>{objective.title}</p>
              <span className="text-[10px] font-bold uppercase text-muted-foreground">{objective.kind === 'badge' ? 'Badge' : 'Activity'}</span>
              <CompactSelect value={rule.start_rule} onChange={(value) => updateObjective(objective.objective_uuid, { start_rule: value })} options={[["any_time", "Any time"], ["phase_start", "Phase start"], ["specific_date", "Date"]]} />
              {rule.start_rule === 'specific_date' ? <CompactDate value={rule.start_date} onChange={(value) => updateObjective(objective.objective_uuid, { start_date: value })} /> : <span className="text-xs text-muted-foreground">{rule.start_rule === 'phase_start' ? dates?.start_date || '—' : '—'}</span>}
              <CompactSelect value={rule.due_rule} onChange={(value) => updateObjective(objective.objective_uuid, { due_rule: value, allow_late: value === 'optional' ? false : rule.allow_late })} options={[["optional", "Optional"], ["phase_end", "Phase end"], ["specific_date", "Date"]]} />
              {rule.due_rule === 'specific_date' ? <CompactDate value={rule.due_date} onChange={(value) => updateObjective(objective.objective_uuid, { due_date: value })} /> : <span className="text-xs text-muted-foreground">{rule.due_rule === 'phase_end' ? dates?.end_date || '—' : '—'}</span>}
              {rule.due_rule === 'optional' ? <span className="text-xs text-muted-foreground">—</span> : <label className="inline-flex items-center gap-1.5 text-xs font-bold"><input type="checkbox" checked={rule.allow_late} onChange={(event) => updateObjective(objective.objective_uuid, { allow_late: event.target.checked })} className="h-4 w-4 accent-black" />Allow</label>}
            </div>
          })}
        </div>
      </section>
    })}
  </div>
}

// eslint-disable-next-line no-unused-vars
function CompactSelect({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[][] }) { return <select value={value} onChange={(event) => onChange(event.target.value)} className="h-8 min-w-0 rounded-md border border-border bg-card px-2 text-xs">{options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select> }
// eslint-disable-next-line no-unused-vars
function CompactDate({ value, onChange }: { value: string; onChange: (value: string) => void }) { return <input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="h-8 min-w-0 rounded-md border border-border px-2 text-[11px]" /> }

function isProgramStaff(membership: any) {
  const role = membership?.role
  if (!role) return false
  if ([1, 2].includes(Number(role.id))) return true
  const rights = role.rights || {}
  return Boolean(rights.dashboard?.action_access && rights.learning_activities?.action_update)
}
