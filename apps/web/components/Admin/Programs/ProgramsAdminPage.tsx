'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'
import { Award, BookCopy, CalendarDays, Check, ChevronRight, ClipboardList, Clock3, FileText, GripVertical, Layers3, Loader2, Pencil, Plus, Send, Settings, Trash2, Upload, User, Users } from 'lucide-react'
import { motion } from 'motion/react'
import AdminFeatureHeader from '@components/Admin/AdminFeatureHeader'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { BadgeThumbnailImage } from '@components/Objects/Thumbnails/BadgeThumbnailImage'
import { SafeImage } from '@components/Objects/SafeImage'
import ImageMediaPicker from '@components/Objects/Media/ImageMediaPicker'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { programsApi } from '@services/programs/programs'
import ProgramObjectiveEditorRow from './ProgramObjectiveEditorRow'
import { cn } from '@/lib/utils'

type ProgramSubpage = 'objectives' | 'assignments' | 'settings'
type EvidenceField = { field_uuid: string; title: string; type: 'text' | 'media'; allow_student_upload: boolean; allowed_types: string[] }

const programTabs = [
  { key: 'objectives' as const, label: 'Objectives', icon: ClipboardList },
  { key: 'assignments' as const, label: 'Assignments', icon: Users },
  { key: 'settings' as const, label: 'Settings', icon: Settings },
]
const programsKey = (orgId: number) => `${getAPIUrl()}programs/?org_id=${orgId}`

export default function ProgramsAdminPage({ orgslug, programUuid, activeSubpage = 'objectives' }: { orgslug: string; programUuid?: string; activeSubpage?: ProgramSubpage }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  if (programUuid) return <ProgramDetail orgslug={orgslug} orgId={Number(org?.id)} token={token} programUuid={programUuid} activeSubpage={activeSubpage} />
  return <div className="min-h-full w-full bg-[#f8f8f8]"><AdminFeatureHeader feature="Programs" activeTab="programs" tabs={[{ id: 'programs', label: 'Programs', icon: <Layers3 size={16} /> }]} /><ProgramList orgslug={orgslug} orgId={Number(org?.id)} token={token} /></div>
}

function ProgramList({ orgslug, orgId, token }: { orgslug: string; orgId: number; token?: string }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const { data: programs, isLoading } = useSWR(orgId && token ? programsKey(orgId) : null, (url) => swrFetcher(url, token))
  const create = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const program = await programsApi.create(orgId, { name, description }, token)
      await mutate(programsKey(orgId)); setOpen(false)
      router.push(getUriWithOrg(orgslug, routePaths.org.dash.programPage(program.program_uuid, 'objectives')))
    } catch (error: any) { toast.error(error?.message || 'Could not create the program.') } finally { setSaving(false) }
  }
  return <div className="px-10 pb-10 pt-6"><section className="rounded-xl bg-card p-6 shadow-xs">
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-bold text-foreground">Programs</h2><p className="mt-1 text-sm text-muted-foreground">Reusable objective sets for groups and individual learners.</p></div><Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="md" dialogTitle="New Program" dialogDescription="Create the program first, then organize its objectives into phases." dialogTrigger={<button className="flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white nice-shadow transition-transform hover:scale-105"><Plus className="h-4 w-4" />New Program</button>} dialogContent={<div className="flex flex-col gap-4 p-2"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Program name" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" rows={3} className="w-full resize-none rounded-lg border border-border px-3 py-2 text-sm" /><button onClick={() => void create()} disabled={saving || !name.trim()} className="ml-auto inline-flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Create Program</button></div>} /></div>
    {isLoading ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-muted-foreground" /></div> : programs?.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{programs.map((program: any) => <Link key={program.program_uuid} href={getUriWithOrg(orgslug, routePaths.org.dash.programPage(program.program_uuid, 'objectives'))} className="group relative flex w-full flex-col overflow-hidden rounded-xl bg-card nice-shadow transition-all duration-300 hover:scale-[1.01]"><div className="relative flex aspect-video items-center justify-center overflow-hidden bg-muted text-blue-500">{program.thumbnail_image ? <SafeImage src={program.thumbnail_image} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" /> : <Layers3 size={42} strokeWidth={1.4} />}</div><div className="flex flex-col space-y-1.5 p-3"><h2 className="line-clamp-1 text-base font-bold leading-tight text-foreground">{program.name}</h2><p className="min-h-[1.5rem] line-clamp-2 text-[11px] text-muted-foreground">{program.description || 'Organize objectives into phases and assign them to learners.'}</p><div className="flex items-center justify-between border-t border-border pt-1.5"><div className="flex items-center gap-1.5 text-muted-foreground"><BookCopy size={12} /><span className="text-[10px] font-bold uppercase tracking-wider">{program.objectives?.length || 0} objectives</span></div><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{program.assignment_count || 0} assignments</span></div></div></Link>)}</div> : <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-border py-16 text-center"><div><Layers3 size={36} className="mx-auto mb-3 text-gray-300" /><p className="text-sm text-muted-foreground">Create a program to start organizing reusable objectives.</p></div></div>}
  </section></div>
}

function ProgramDetail({ orgslug, orgId, token, programUuid, activeSubpage }: { orgslug: string; orgId: number; token?: string; programUuid: string; activeSubpage: ProgramSubpage }) {
  const key = orgId && token ? `${getAPIUrl()}programs/${programUuid}?org_id=${orgId}` : null
  const { data: program, isLoading } = useSWR(key, (url) => swrFetcher(url, token))
  if (isLoading || !program) return <div className="flex min-h-full w-full items-center justify-center bg-[#f8f8f8]"><Loader2 className="animate-spin text-muted-foreground" /></div>
  const refresh = () => key ? mutate(key) : Promise.resolve()
  return <div className="min-h-full w-full bg-[#f8f8f8]">
    <div className="relative z-10 bg-[#fcfbfc] pl-10 pr-10 text-sm tracking-tight nice-shadow">
      <div className="pb-4 pt-6"><Breadcrumbs items={[{ label: 'Programs', href: '/admin/programs' }, { label: program.name }]} /></div>
      <ProgramHeader orgId={orgId} token={token} program={program} refresh={refresh} />
      <div className="flex space-x-3 text-sm font-black">{programTabs.map((tab) => { const Icon = tab.icon; const active = activeSubpage === tab.key; return <Link key={tab.key} href={getUriWithOrg(orgslug, routePaths.org.dash.programPage(programUuid, tab.key))}><div className={cn('flex w-fit cursor-pointer space-x-4 border-black py-2 text-center transition-all ease-linear', active ? 'border-b-4' : 'opacity-50 hover:opacity-75')}><div className="mx-2 flex items-center space-x-2.5"><Icon size={16} /><div>{tab.label}</div></div></div></Link> })}</div>
    </div>
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.1 }}>{activeSubpage === 'objectives' && <ProgramObjectives orgId={orgId} token={token} program={program} refresh={refresh} />}{activeSubpage === 'assignments' && <ProgramAssignments orgslug={orgslug} orgId={orgId} token={token} program={program} refresh={refresh} />}{activeSubpage === 'settings' && <ProgramSettings orgslug={orgslug} orgId={orgId} token={token} program={program} refresh={refresh} />}</motion.div>
  </div>
}

function ProgramHeader({ orgId, token, program, refresh }: any) {
  const [editingName, setEditingName] = React.useState(false)
  const [editingDescription, setEditingDescription] = React.useState(false)
  const [name, setName] = React.useState(program.name || '')
  const [description, setDescription] = React.useState(program.description || '')
  const [saving, setSaving] = React.useState<'name' | 'description' | 'image' | null>(null)

  React.useEffect(() => {
    setName(program.name || '')
    setDescription(program.description || '')
  }, [program.name, program.description])

  const saveText = async (field: 'name' | 'description') => {
    const value = field === 'name' ? name.trim() : description.trim()
    if (field === 'name' && !value) return toast.error('Program name is required.')
    setSaving(field)
    try {
      await programsApi.update(orgId, program.program_uuid, { [field]: value }, token)
      await refresh()
      field === 'name' ? setEditingName(false) : setEditingDescription(false)
      toast.success(`Program ${field} updated.`)
    } catch (error: any) {
      toast.error(error?.message || `Could not update the program ${field}.`)
    } finally {
      setSaving(null)
    }
  }

  const saveImage = async (url: string) => {
    setSaving('image')
    try {
      await programsApi.update(orgId, program.program_uuid, { thumbnail_image: url }, token)
      await refresh()
      toast.success('Program cover image updated.')
    } catch (error: any) {
      toast.error(error?.message || 'Could not update the program cover image.')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="my-2 flex flex-col gap-5 py-2 md:flex-row md:items-center">
      <div className="group relative aspect-video w-full max-w-[240px] shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
        {program.thumbnail_image ? (
          <SafeImage src={program.thumbnail_image} alt="Program cover" className={cn('h-full w-full object-cover', saving === 'image' && 'animate-pulse')} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-blue-500"><Layers3 size={42} strokeWidth={1.4} /></div>
        )}
        <div className="absolute right-2 top-2 z-20 opacity-0 transition-opacity group-hover:opacity-100">
          <ImageMediaPicker owner={{ type: 'org', id: Number(orgId) }} title="Choose program cover image" buttonText="" buttonSize="icon" buttonVariant="secondary" className="h-8 w-8 shadow-md" disabled={saving === 'image'} onSelect={saveImage} />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="group flex min-w-0 items-start gap-2">
          {editingName ? <input autoFocus value={name} maxLength={100} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void saveText('name'); if (event.key === 'Escape') { setName(program.name); setEditingName(false) } }} className="min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-2 text-3xl font-black leading-tight outline-none focus:ring-2 focus:ring-black" /> : <h1 className="min-w-0 break-words text-3xl font-black leading-tight text-foreground">{program.name}</h1>}
          <HoverEditButton editing={editingName} saving={saving === 'name'} onClick={() => editingName ? void saveText('name') : setEditingName(true)} label="program title" />
        </div>
        <div className="group mt-2 flex max-w-3xl items-start gap-2">
          {editingDescription ? <textarea autoFocus value={description} rows={3} onChange={(event) => setDescription(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') void saveText('description'); if (event.key === 'Escape') { setDescription(program.description || ''); setEditingDescription(false) } }} className="min-w-0 flex-1 resize-y rounded-md border border-border bg-card px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-black" /> : <p className="min-w-0 flex-1 text-sm leading-6 text-muted-foreground">{program.description || 'Organize the requirements learners will work through.'}</p>}
          <HoverEditButton editing={editingDescription} saving={saving === 'description'} onClick={() => editingDescription ? void saveText('description') : setEditingDescription(true)} label="program description" />
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground"><BookCopy size={14} />{program.objectives?.length || 0} objectives · {program.phases?.length || 1} phases</div>
      </div>
    </div>
  )
}

function HoverEditButton({ editing, saving, onClick, label }: { editing: boolean; saving: boolean; onClick: () => void; label: string }) {
  return <button type="button" disabled={saving} onClick={onClick} title={editing ? `Save ${label}` : `Edit ${label}`} className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md', editing ? 'bg-green-600 text-white hover:bg-green-700' : 'opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100')}>{saving ? <Loader2 size={15} className="animate-spin" /> : editing ? <Check size={15} /> : <Pencil size={15} />}</button>
}

function ProgramObjectives({ orgId, token, program, refresh }: { orgId: number; token?: string; program: any; refresh: () => Promise<any> }) {
  const [phases, setPhases] = React.useState<any[]>(program.phases || [])
  const [phaseOpen, setPhaseOpen] = React.useState(false)
  const [phaseName, setPhaseName] = React.useState('')
  const [durationWeeks, setDurationWeeks] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  React.useEffect(() => setPhases(program.phases || []), [program.phases])
  const persistOrder = async (next: any[]) => { setPhases(next); try { await programsApi.reorder(orgId, program.program_uuid, next.map((phase) => ({ phase_uuid: phase.phase_uuid, objective_uuids: phase.objectives.map((objective: any) => objective.objective_uuid) })), token); await refresh() } catch (error: any) { setPhases(program.phases || []); toast.error(error?.message || 'Could not save the new objective order.') } }
  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return
    if (result.type === 'PROGRAM_PHASE') {
      const next = [...phases]
      const [moved] = next.splice(result.source.index, 1)
      next.splice(result.destination.index, 0, moved)
      void persistOrder(next)
      return
    }
    const source = phases.findIndex((phase) => phase.phase_uuid === result.source.droppableId)
    const destination = phases.findIndex((phase) => phase.phase_uuid === result.destination?.droppableId)
    if (source < 0 || destination < 0) return
    const next = phases.map((phase) => ({ ...phase, objectives: [...phase.objectives] }))
    const [moved] = next[source].objectives.splice(result.source.index, 1)
    next[destination].objectives.splice(result.destination.index, 0, moved)
    void persistOrder(next)
  }
  const createPhase = async () => { if (!phaseName.trim()) return; setSaving(true); try { await programsApi.createPhase(orgId, program.program_uuid, { name: phaseName, suggested_duration_weeks: durationWeeks ? Number(durationWeeks) : null }, token); await refresh(); setPhaseOpen(false); setPhaseName(''); setDurationWeeks(''); toast.success('Phase added.') } catch (error: any) { toast.error(error?.message || 'Could not add the phase.') } finally { setSaving(false) } }
  return <div className="px-10 pb-10 pt-6"><div className="mx-auto max-w-5xl"><div className="mb-5 flex justify-end"><Modal isDialogOpen={phaseOpen} onOpenChange={setPhaseOpen} minHeight="no-min" minWidth="md" dialogTitle="Add phase" dialogDescription="Use phases for terms, units, milestones, or another meaningful grouping." dialogTrigger={<button className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-xs font-bold nice-shadow hover:bg-muted"><Plus size={15} />Add phase</button>} dialogContent={<div className="space-y-4 p-2"><Field label="Phase name"><input autoFocus value={phaseName} onChange={(e) => setPhaseName(e.target.value)} className="h-10 w-full rounded-lg border border-border px-3 text-sm" placeholder="Term 2" /></Field><Field label="Suggested duration in weeks (optional)"><input type="number" min={1} value={durationWeeks} onChange={(e) => setDurationWeeks(e.target.value)} className="h-10 w-full rounded-lg border border-border px-3 text-sm" placeholder="6" /></Field><button onClick={() => void createPhase()} disabled={!phaseName.trim() || saving} className="ml-auto flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white disabled:opacity-50">{saving && <Loader2 size={15} className="animate-spin" />}Add phase</button></div>} /></div>{program.outdated_badge_objectives?.length ? <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"><div><p className="text-xs font-bold text-amber-950">A newer major badge version is available.</p><p className="mt-0.5 text-[11px] text-amber-800">Updating changes future assignments only; active groups keep their requirements.</p></div><button onClick={async () => { await programsApi.updateBadgeVersions(orgId, program.program_uuid, token); await refresh(); toast.success('Future assignments now use the latest badge versions.') }} className="rounded-lg bg-amber-900 px-3 py-2 text-xs font-bold text-white">Use latest for future assignments</button></div> : null}<DragDropContext onDragEnd={onDragEnd}><Droppable droppableId="program-phases" type="PROGRAM_PHASE">{(provided) => <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-8">{phases.map((phase, index) => <Draggable key={phase.phase_uuid} draggableId={`phase:${phase.phase_uuid}`} index={index}>{(drag, dragging) => <div ref={drag.innerRef} {...drag.draggableProps} style={drag.draggableProps.style} className={cn(dragging.isDragging && 'rounded-xl bg-card p-3 shadow-xl ring-2 ring-blue-300')}><PhaseSection phase={phase} orgId={orgId} token={token} program={program} refresh={refresh} phaseDragHandleProps={drag.dragHandleProps} /></div>}</Draggable>)}{provided.placeholder}</div>}</Droppable></DragDropContext></div></div>
}

function PhaseSection({ phase, orgId, token, program, refresh, phaseDragHandleProps }: any) {
  const [editing, setEditing] = React.useState(false), [name, setName] = React.useState(phase.name), [durationWeeks, setDurationWeeks] = React.useState(phase.suggested_duration_weeks ? String(phase.suggested_duration_weeks) : ''), [saving, setSaving] = React.useState(false)
  const save = async () => { if (!name.trim()) return; setSaving(true); try { await programsApi.updatePhase(orgId, program.program_uuid, phase.phase_uuid, { name, suggested_duration_weeks: durationWeeks ? Number(durationWeeks) : null }, token); await refresh(); setEditing(false) } catch (error: any) { toast.error(error?.message || 'Could not update the phase.') } finally { setSaving(false) } }
  return <section><div className="group flex min-h-12 flex-wrap items-center gap-3 border-b border-border pb-2"><button {...phaseDragHandleProps} className="cursor-grab rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 active:cursor-grabbing" aria-label={`Move ${phase.name}`}><GripVertical size={18} /></button>{editing ? <><input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="h-9 min-w-44 flex-1 rounded-lg border border-border bg-card px-3 text-sm font-bold" /><label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">Suggested weeks<input type="number" min={1} value={durationWeeks} onChange={(e) => setDurationWeeks(e.target.value)} className="h-9 w-20 rounded-lg border border-border bg-card px-2 text-sm" /></label><button onClick={() => void save()} disabled={saving} className="flex h-9 items-center gap-1.5 rounded-lg bg-black px-3 text-xs font-bold text-white">{saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}Save</button></> : <><h3 className="min-w-0 flex-1 text-base font-black text-foreground">{phase.name}</h3>{phase.suggested_duration_weeks ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Clock3 size={13} />{phase.suggested_duration_weeks} week{phase.suggested_duration_weeks === 1 ? '' : 's'} suggested</span> : null}<button onClick={() => setEditing(true)} className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"><Pencil size={14} /></button></>}</div><Droppable droppableId={phase.phase_uuid} type="PROGRAM_OBJECTIVE">{(provided, snapshot) => <div ref={provided.innerRef} {...provided.droppableProps} className={cn('space-y-2 py-3 transition', snapshot.isDraggingOver && 'rounded-lg bg-blue-50/70 ring-2 ring-inset ring-blue-200')}>{phase.objectives.map((objective: any, index: number) => <Draggable key={objective.objective_uuid} draggableId={objective.objective_uuid} index={index}>{(drag, dragging) => <div ref={drag.innerRef} {...drag.draggableProps} style={drag.draggableProps.style}><ObjectiveRow objective={objective} dragHandleProps={drag.dragHandleProps} dragging={dragging.isDragging} /></div>}</Draggable>)}{provided.placeholder}{!phase.objectives.length && <div className="rounded-lg border border-dashed border-border py-7 text-center text-xs font-semibold text-muted-foreground">No requirements in this phase yet.</div>}<ObjectivePickerModal orgId={orgId} token={token} program={program} phase={phase} refresh={refresh} /></div>}</Droppable></section>
}

function ObjectiveRow(props: any) {
  const org = useOrg() as any
  const session = useLHSession() as any
  return <ProgramObjectiveEditorRow {...props} orgId={Number(org?.id)} token={session?.data?.tokens?.access_token} program={{ program_uuid: props.objective.program_uuid }} />
}

// eslint-disable-next-line no-unused-vars
function LegacyObjectiveRow({ objective, dragHandleProps, dragging }: any) {
  const org = useOrg() as any, session = useLHSession() as any, orgId = Number(org?.id), token = session?.data?.tokens?.access_token
  const [open, setOpen] = React.useState(false)
  const [startRule, setStartRule] = React.useState(objective.default_start_rule || 'any_time'), [dueRule, setDueRule] = React.useState(objective.default_due_rule || 'optional'), [allowLate, setAllowLate] = React.useState(Boolean(objective.default_allow_late)), [saving, setSaving] = React.useState(false)
  const save = async () => { setSaving(true); try { await programsApi.updateObjectiveSchedule(orgId, objective.program_uuid, objective.objective_uuid, { default_start_rule: startRule, default_due_rule: dueRule, default_allow_late: allowLate }, token); await mutate(`${getAPIUrl()}programs/${objective.program_uuid}?org_id=${orgId}`); setOpen(false); toast.success('Objective schedule defaults saved.') } catch (error: any) { toast.error(error?.message || 'Could not save schedule defaults.') } finally { setSaving(false) } }
  return <><div className={cn('group flex items-center gap-2 rounded-xl border border-border bg-card p-3 transition', dragging ? 'shadow-xl ring-2 ring-blue-300' : 'shadow-xs hover:border-foreground/30')}><button {...dragHandleProps} className="cursor-grab rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 active:cursor-grabbing" aria-label={`Move ${objective.title}`}><GripVertical size={18} /></button><button onClick={() => setOpen(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left"><div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', objective.kind === 'badge' ? 'bg-lime-100 text-lime-700' : 'bg-blue-50 text-blue-600')}>{objective.kind === 'badge' ? <Award size={18} /> : <FileText size={18} />}</div><div className="min-w-0 flex-1"><h4 className="truncate text-sm font-bold text-foreground">{objective.title}</h4><p className="mt-0.5 truncate text-xs text-muted-foreground">{objectiveSummary(objective)} · {startRule === 'phase_start' ? 'phase start' : startRule === 'specific_date' ? 'scheduled start' : 'any time'} · {dueRule === 'phase_end' ? 'phase end' : dueRule === 'specific_date' ? 'scheduled deadline' : 'no deadline'}</p></div><ChevronRight size={16} className="text-muted-foreground" /></button></div><Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="md" dialogTitle={objective.title} dialogDescription="Details and default assignment schedule" dialogContent={<div className="space-y-4 p-2"><p className="text-sm leading-6 text-muted-foreground">{objective.description || (objective.kind === 'badge' ? 'Learners complete this requirement by earning the badge.' : 'No additional instructions.')}</p>{objective.kind !== 'badge' && <ObjectiveDetails objective={objective} />}<div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2"><Field label="Can be started"><select value={startRule} onChange={(e) => setStartRule(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"><option value="any_time">Any time after acceptance</option><option value="phase_start">At phase start</option><option value="specific_date">On a specific date</option></select></Field><Field label="Must be completed"><select value={dueRule} onChange={(e) => setDueRule(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"><option value="optional">Optional / no deadline</option><option value="phase_end">By phase end</option><option value="specific_date">By a specific date</option></select></Field><div className="sm:col-span-2"><CheckLabel checked={allowLate} onChange={setAllowLate}>Allow late submissions when a deadline is set</CheckLabel><p className="ml-6 mt-1 text-[11px] text-muted-foreground">Specific dates are filled in when this program is assigned.</p></div><button onClick={() => void save()} disabled={saving} className="sm:col-span-2 ml-auto rounded-lg bg-black px-5 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save defaults'}</button></div></div>} /></>
}

function ObjectivePickerModal({ orgId, token, program, phase, refresh }: any) {
  const [open, setOpen] = React.useState(false), [tab, setTab] = React.useState<'objective' | 'badge'>('objective'), [selection, setSelection] = React.useState<{ type: 'existing' | 'new' | 'badge'; id?: string } | null>(null), [saving, setSaving] = React.useState(false)
  const [title, setTitle] = React.useState(''), [instructions, setInstructions] = React.useState(''), [allowConfirmation, setAllowConfirmation] = React.useState(false), [fields, setFields] = React.useState<EvidenceField[]>([])
  const { data: objectives } = useSWR(orgId && token ? `${getAPIUrl()}programs/objectives?org_id=${orgId}` : null, (url) => swrFetcher(url, token))
  const { data: collections } = useSWR(orgId && token ? `${getAPIUrl()}badge-collections/?admin=true&org_id=${orgId}` : null, (url) => swrFetcher(url, token))
  const badges = (collections || []).flatMap((collection: any) => collection.badges || []).filter((badge: any) => badge.status === 'published')
  const used = new Set(program.objectives.filter((objective: any) => objective.kind !== 'badge').map((objective: any) => objective.objective_uuid))
  const usedBadgeIds = new Set(program.objectives.filter((objective: any) => objective.kind === 'badge' && objective.badge_id).map((objective: any) => String(objective.badge_id)))
  const selectedExisting = (objectives || []).find((objective: any) => selection?.type === 'existing' && objective.objective_uuid === selection.id)
  const selectedBadge = badges.find((badge: any) => selection?.type === 'badge' && badge.badge_uuid === selection.id)
  const chooseTab = (next: 'objective' | 'badge') => { setTab(next); setSelection(null) }
  const addField = () => setFields((current) => [...current, { field_uuid: crypto.randomUUID(), title: '', type: 'text', allow_student_upload: false, allowed_types: [] }])
  const updateField = (uuid: string, patch: Partial<EvidenceField>) => setFields((current) => current.map((field) => field.field_uuid === uuid ? { ...field, ...patch } : field))
  const canAdd = selection?.type === 'existing' ? Boolean(selectedExisting) && !used.has(String(selection.id)) : selection?.type === 'badge' ? Boolean(selectedBadge) && !usedBadgeIds.has(String(selectedBadge?.id)) : selection?.type === 'new' ? Boolean(title.trim()) && fields.every((field) => field.title.trim()) : false
  const add = async () => { if (!selection || !canAdd) return; setSaving(true); try { const payload = selection.type === 'existing' ? { objective_uuid: selection.id, phase_uuid: phase.phase_uuid } : selection.type === 'badge' ? { kind: 'badge', badge_uuid: selection.id, title: selectedBadge.name, phase_uuid: phase.phase_uuid } : { kind: 'custom', title, description: instructions, phase_uuid: phase.phase_uuid, allow_learner_confirmation: allowConfirmation, custom_fields: fields }; await programsApi.addObjective(orgId, program.program_uuid, payload, token); await refresh(); setOpen(false); setSelection(null); toast.success(`${selection.type === 'badge' ? 'Badge' : 'Objective'} added to ${phase.name}.`) } catch (error: any) { toast.error(error?.message || 'Could not add this objective.') } finally { setSaving(false) } }
  return <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="no-min" customHeight="h-[min(760px,88dvh)]" customWidth="md:w-[min(1000px,90vw)]" dialogTitle={`Add to ${phase.name}`} dialogDescription="Choose a reusable objective, create a new one, or add a badge requirement." dialogTrigger={<button className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border text-xs font-bold text-muted-foreground transition hover:border-foreground hover:bg-muted hover:text-foreground"><Plus size={15} />Add objective</button>} dialogContent={<div className="flex h-full min-h-0 flex-col p-2"><div className="flex shrink-0 gap-6 border-b border-border"><button onClick={() => chooseTab('objective')} className={cn('border-b-2 px-1 pb-3 pt-1 text-sm font-bold', tab === 'objective' ? 'border-black text-foreground' : 'border-transparent text-muted-foreground')}>Objective</button><button onClick={() => chooseTab('badge')} className={cn('border-b-2 px-1 pb-3 pt-1 text-sm font-bold', tab === 'badge' ? 'border-black text-foreground' : 'border-transparent text-muted-foreground')}>Badge</button></div><div className="min-h-0 flex-1 overflow-y-auto py-4 pr-1">{tab === 'objective' ? <div className="space-y-3">{selection?.type === 'new' ? <NewObjectiveEditor title={title} setTitle={setTitle} instructions={instructions} setInstructions={setInstructions} allowConfirmation={allowConfirmation} setAllowConfirmation={setAllowConfirmation} fields={fields} setFields={setFields} addField={addField} updateField={updateField} /> : <button onClick={() => setSelection({ type: 'new' })} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-4 text-sm font-bold hover:border-blue-400 hover:bg-blue-50"><Plus size={16} />New objective</button>}{(objectives || []).map((objective: any) => { const selected = selection?.type === 'existing' && selection.id === objective.objective_uuid; const alreadyUsed = used.has(objective.objective_uuid); return <button key={objective.objective_uuid} disabled={alreadyUsed} onClick={() => setSelection({ type: 'existing', id: objective.objective_uuid })} className={cn('w-full rounded-xl border bg-card p-4 text-left transition', selected ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-border hover:border-gray-400', alreadyUsed && 'cursor-not-allowed opacity-45')}><div className="flex items-start gap-3"><ChoiceDot selected={selected} /><div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><p className="text-sm font-bold">{objective.title}</p>{alreadyUsed && <span className="text-[10px] font-bold uppercase text-muted-foreground">Already added</span>}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{objective.description || 'No additional instructions.'}</p>{selected && <ObjectiveDetails objective={objective} />}</div></div></button> })}</div> : <div className="grid grid-cols-2 gap-4">{badges.map((badge: any) => { const selected = selection?.type === 'badge' && selection.id === badge.badge_uuid; const alreadyUsed = usedBadgeIds.has(String(badge.id)); return <button key={badge.badge_uuid} disabled={alreadyUsed} onClick={() => setSelection({ type: 'badge', id: badge.badge_uuid })} className={cn('relative flex min-h-40 flex-col items-center rounded-xl border bg-card p-4 text-center', selected ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-border hover:border-gray-400', alreadyUsed && 'cursor-not-allowed opacity-45 grayscale')}>{alreadyUsed && <span className="absolute right-3 top-3 text-[10px] font-bold uppercase text-muted-foreground">Already added</span>}{selected && <span className="absolute right-3 top-3"><ChoiceDot selected /></span>}<div className="h-20 w-20">{badge.thumbnail_image ? <BadgeThumbnailImage src={badge.thumbnail_image} alt={`${badge.name} badge`} hoverScale /> : <div className="flex h-full w-full items-center justify-center rounded-xl bg-muted text-lime-500"><Award size={28} /></div>}</div><p className="mt-3 line-clamp-2 text-sm font-bold">{badge.name}</p>{selected && <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{badge.description || 'Learners complete this by earning the badge.'}</p>}</button> })}{!badges.length && <div className="col-span-2 rounded-xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">No badges are currently available for this organization to issue.</div>}</div>}</div><div className="flex shrink-0 items-center justify-between border-t border-border pt-4"><p className="text-xs font-semibold text-muted-foreground">{selection ? selection.type === 'new' ? 'New objective selected' : selection.type === 'badge' ? `${selectedBadge?.name || 'Badge'} selected` : `${selectedExisting?.title || 'Objective'} selected` : 'Choose what to add'}</p><button onClick={() => void add()} disabled={!canAdd || saving} className="inline-flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white disabled:opacity-40">{saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}Add to phase</button></div></div>} />
}

function NewObjectiveEditor(props: any) {
  const { fields, setFields } = props
  const [startRule, setStartRule] = React.useState('any_time')
  const [dueRule, setDueRule] = React.useState('optional')
  const [allowLate, setAllowLate] = React.useState(false)
  React.useEffect(() => {
    setFields((current: EvidenceField[]) => {
      const schedule = { default_start_rule: startRule, default_due_rule: dueRule, default_allow_late: dueRule === 'optional' ? false : allowLate }
      const existing = (current as any).__schedule
      if (existing && JSON.stringify(existing) === JSON.stringify(schedule)) return current
      const next = [...current] as any
      next.__schedule = schedule
      return next
    })
  }, [startRule, dueRule, allowLate, fields, setFields])
  return <div className="space-y-4"><ObjectiveCoreEditor {...props} /><section className="rounded-xl border border-border bg-card p-4"><h3 className="text-sm font-black">Assignment defaults</h3><p className="mt-1 text-xs text-muted-foreground">Specific dates are selected when the program is assigned.</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Open"><select value={startRule} onChange={(event) => setStartRule(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"><option value="any_time">Any time</option><option value="phase_start">Phase start</option><option value="specific_date">Specific date</option></select></Field><Field label="Due"><select value={dueRule} onChange={(event) => { setDueRule(event.target.value); if (event.target.value === 'optional') setAllowLate(false) }} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"><option value="optional">Optional</option><option value="phase_end">Phase end</option><option value="specific_date">Specific date</option></select></Field>{dueRule !== 'optional' && <div className="sm:col-span-2"><CheckLabel checked={allowLate} onChange={setAllowLate}>Allow late submissions</CheckLabel></div>}</div></section></div>
}

function ObjectiveCoreEditor({ title, setTitle, instructions, setInstructions, allowConfirmation, setAllowConfirmation, fields, setFields, addField, updateField }: any) {
  return <section className="rounded-xl border border-blue-500 bg-blue-50/20 p-4 ring-2 ring-blue-500/20"><div className="mb-4 flex items-center gap-2"><ChoiceDot selected /><h3 className="text-sm font-black">New objective</h3></div><div className="space-y-4"><Field label="Title"><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm" placeholder="Complete a community interview" /></Field><Field label="Instructions"><textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} className="w-full resize-y rounded-lg border border-border bg-card p-3 text-sm" placeholder="Explain what the learner needs to do." /></Field><div><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold">Evidence fields</p><p className="mt-0.5 text-[11px] text-muted-foreground">Staff can always add or change evidence. Choose whether learners can also contribute.</p></div><button onClick={addField} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold hover:bg-muted"><Plus size={13} />Add field</button></div><div className="mt-3 space-y-3">{fields.map((field: EvidenceField, index: number) => <div key={field.field_uuid} className="rounded-lg border border-border bg-card p-3"><div className="flex items-start gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-black text-muted-foreground">{index + 1}</div><div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_130px]"><Field label="Field title"><input value={field.title} onChange={(e) => updateField(field.field_uuid, { title: e.target.value })} className="h-9 w-full rounded-lg border border-border px-3 text-sm" placeholder="Reflection link" /></Field><Field label="Field type"><select value={field.type} onChange={(e) => updateField(field.field_uuid, { type: e.target.value, allowed_types: [] })} className="h-9 w-full rounded-lg border border-border bg-card px-2 text-sm"><option value="text">Text</option><option value="media">Media upload</option></select></Field></div><button onClick={() => setFields((current: EvidenceField[]) => current.filter((item) => item.field_uuid !== field.field_uuid))} className="mt-5 rounded-md p-1.5 text-red-500 hover:bg-red-50"><Trash2 size={14} /></button></div>{field.type === 'media' && <div className="ml-11 mt-3 flex flex-wrap items-center gap-4"><span className="text-xs font-bold text-muted-foreground">Allowed types</span>{['image', 'video', 'pdf'].map((type) => <CheckLabel key={type} checked={field.allowed_types.includes(type)} onChange={(checked) => updateField(field.field_uuid, { allowed_types: checked ? [...field.allowed_types, type] : field.allowed_types.filter((item) => item !== type) })}>{type === 'pdf' ? 'PDF' : type[0].toUpperCase() + type.slice(1)}</CheckLabel>)}</div>}<div className="ml-11 mt-3"><CheckLabel checked={field.allow_student_upload} onChange={(checked) => updateField(field.field_uuid, { allow_student_upload: checked })}>Allow learner to {field.type === 'text' ? 'complete this field' : 'upload files'}</CheckLabel></div></div>)}{!fields.length && <div className="rounded-lg border border-dashed border-border bg-card py-6 text-center text-xs text-muted-foreground">No evidence is required. Add a field if staff or learners should attach something.</div>}</div></div><div className="border-t border-border pt-4"><CheckLabel checked={allowConfirmation} onChange={setAllowConfirmation}>Allow learner to confirm this objective is complete</CheckLabel><p className="ml-6 mt-1 text-[11px] text-muted-foreground">Staff can always confirm, reopen, or change completion.</p></div></div></section>
}

function ObjectiveDetails({ objective }: { objective: any }) { return <div className="mt-3 space-y-2 border-t border-border pt-3"><p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">What this collects</p>{objective.custom_fields?.length ? objective.custom_fields.map((field: EvidenceField) => <div key={field.field_uuid} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs"><span>{field.type === 'media' ? <Upload size={13} /> : <FileText size={13} />}</span><span className="font-semibold">{field.title}</span><span className="ml-auto text-[10px] text-muted-foreground">{field.allow_student_upload ? 'Learner + staff' : 'Staff only'}</span></div>) : <p className="text-xs text-muted-foreground">No evidence fields.</p>}<p className="text-xs text-muted-foreground">{objective.allow_learner_confirmation ? 'Learners and staff can confirm completion.' : 'Staff confirms completion.'}</p></div> }

function AssignProgramModal({ orgslug, program }: any) {
  return <Link href={getUriWithOrg(orgslug, routePaths.org.dash.programAssignmentNew(program.program_uuid))} className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-xs font-bold text-white"><Send size={15} />Assign to…</Link>
}

function ProgramAssignments({ orgslug, orgId, token, program, refresh }: any) {
  const assignments = program.assignments || []
  const active = assignments.filter((assignment: any) => assignment.active)
  const inactive = assignments.filter((assignment: any) => !assignment.active)
  const programWithRefresh = { ...program, refresh }
  return <div className="px-10 pb-10 pt-6"><div className="mx-auto max-w-5xl"><div className="mb-5 flex justify-end"><AssignProgramModal orgslug={orgslug} orgId={orgId} token={token} program={programWithRefresh} /></div>{active.length ? <AssignmentSection title="Active" assignments={active} orgslug={orgslug} /> : <div className="rounded-xl border border-dashed border-border bg-card py-12 text-center"><Users className="mx-auto text-gray-300" size={34} /><p className="mt-3 text-sm font-semibold text-muted-foreground">This program has no active assignments.</p></div>}{inactive.length ? <div className="mt-8"><AssignmentSection title="Past" assignments={inactive} orgslug={orgslug} /></div> : null}</div></div>
}

function AssignmentSection({ title, assignments, orgslug }: any) {
  return <section><div className="mb-2 border-b border-border pb-2"><h2 className="text-sm font-black uppercase tracking-wider text-muted-foreground">{title}</h2></div><div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs">{assignments.map((assignment: any) => { const cohort = assignment.cohort; const user = assignment.user; const label = cohort?.name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || 'Individual learner'; const href = cohort ? getUriWithOrg(orgslug, routePaths.org.dash.users.cohortProgram(cohort.id, assignment.assignment_uuid)) : user?.username ? getUriWithOrg(orgslug, routePaths.org.dash.users.user(user.username)) : null; const content = <><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">{cohort ? <Users size={18} /> : <User size={18} />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-black">{label}</h3><span className="rounded-full bg-green-50 px-2 py-0.5 text-[9px] font-black uppercase text-green-700">{assignment.active ? 'Active' : 'Ended'}</span></div><div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{assignment.learner_count} learner{assignment.learner_count === 1 ? '' : 's'}</span><span>{assignment.progress_percent}% complete</span>{assignment.due_date ? <span className="inline-flex items-center gap-1"><CalendarDays size={12} />Due {new Date(assignment.due_date).toLocaleDateString()}</span> : null}<span>Assigned {formatDate(assignment.creation_date)}</span></div></div><ChevronRight size={16} className="text-muted-foreground" /></>; return href ? <Link key={assignment.assignment_uuid} href={href} className="flex items-center gap-3 p-4 transition hover:bg-muted/50">{content}</Link> : <div key={assignment.assignment_uuid} className="flex items-center gap-3 p-4">{content}</div> })}</div></section>
}

function ProgramSettings({ orgslug, orgId, token, program, refresh }: any) {
  const [instructions, setInstructions] = React.useState(program.instructions || ''), [saving, setSaving] = React.useState(false), [deleteOpen, setDeleteOpen] = React.useState(false), [deleting, setDeleting] = React.useState(false)
  const save = async () => { setSaving(true); try { await programsApi.update(orgId, program.program_uuid, { instructions }, token); await refresh(); toast.success('Default instructions saved.') } catch (error: any) { toast.error(error?.message || 'Could not save the program.') } finally { setSaving(false) } }
  const remove = async () => { setDeleting(true); try { await programsApi.delete(orgId, program.program_uuid, token); toast.success('Program deleted.'); window.location.href = getUriWithOrg(orgslug, routePaths.org.dash.programs()) } catch (error: any) { toast.error(error?.message || 'Could not delete the program.'); setDeleting(false) } }
  return <div className="px-10 pb-10 pt-6"><div className="max-w-3xl space-y-6"><section className="rounded-xl border border-border bg-card p-6 shadow-xs"><h2 className="text-lg font-bold">Default instructions</h2><p className="mt-1 text-sm text-muted-foreground">These instructions are reused when staff assign this program.</p><div className="mt-6 space-y-5"><Field label="Instructions"><textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={6} className="w-full rounded-lg border border-border p-3 text-sm" /></Field><button onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white disabled:opacity-50">{saving && <Loader2 size={15} className="animate-spin" />}Save instructions</button></div></section><section className="rounded-xl border border-red-200 bg-card p-6 shadow-xs"><h2 className="text-lg font-bold text-red-700">Delete program</h2><p className="mt-1 text-sm text-muted-foreground">Permanently remove this program and its assignments. Shared objective completion records remain available to the organization.</p><Modal isDialogOpen={deleteOpen} onOpenChange={setDeleteOpen} minHeight="no-min" minWidth="sm" dialogTitle="Delete program?" dialogDescription="This cannot be undone." dialogTrigger={<button className="mt-5 inline-flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-50"><Trash2 size={14} />Delete program</button>} dialogContent={<div className="space-y-5 p-2"><p className="text-sm leading-6 text-muted-foreground">The program template and all of its assignment rollouts will be deleted. Organization-level objectives and learner completions are not deleted.</p><button onClick={() => void remove()} disabled={deleting} className="ml-auto flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2 text-xs font-bold text-white disabled:opacity-50">{deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}Delete permanently</button></div>} /></section></div></div>
}

function formatDate(value?: string) { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString() }

function ChoiceDot({ selected }: { selected: boolean }) { return <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300')}>{selected && <Check size={12} />}</span> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-bold"><span className="mb-2 block">{label}</span>{children}</label> }
// eslint-disable-next-line no-unused-vars
interface CheckLabelProps { checked: boolean; onChange(value: boolean): void; children: React.ReactNode }
function CheckLabel({ checked, onChange, children }: CheckLabelProps) { return <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-border accent-black" />{children}</label> }
function objectiveSummary(objective: any) { if (objective.kind === 'badge') return 'Badge requirement'; if (objective.custom_fields?.length) return `${objective.custom_fields.length} evidence field${objective.custom_fields.length === 1 ? '' : 's'}${objective.allow_learner_confirmation ? ' · learner can confirm' : ''}`; return objective.allow_learner_confirmation ? 'Learner can confirm completion' : 'Staff confirmation' }
