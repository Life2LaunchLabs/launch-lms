'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'
import { BarChart3, BookCopy, CalendarDays, Check, ChevronRight, ClipboardCheck, ClipboardList, Clock3, GripVertical, Layers3, Loader2, Pencil, Plus, Send, Settings, Trash2, User, Users } from 'lucide-react'
import { motion } from 'motion/react'
import AdminFeatureHeader from '@components/Admin/AdminFeatureHeader'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { SafeImage } from '@components/Objects/SafeImage'
import ImageMediaPicker from '@components/Objects/Media/ImageMediaPicker'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { programsApi } from '@services/programs/programs'
import ProgramObjectiveEditorRow from './ProgramObjectiveEditorRow'
import ProgramAssignmentModal from './ProgramAssignmentModal'
import { RequirementFrameworkDetail, RequirementsAdmin, RequirementsReporting } from './RequirementsAdmin'
import { PlanObjectiveDefinitionCard, PlanPermissionChecklist } from '@components/Plans/PlanEditorShared'
import { getLearningBadges } from '@services/learning/learning'
import { cn } from '@/lib/utils'

type ProgramSubpage = 'objectives' | 'assignments' | 'settings'

const programTabs = [
  { key: 'objectives' as const, label: 'Objectives', icon: ClipboardList },
  { key: 'assignments' as const, label: 'Assignments', icon: Users },
  { key: 'settings' as const, label: 'Settings', icon: Settings },
]
const programsKey = (orgId: number) => `${getAPIUrl()}planning/templates?org_id=${orgId}`

export default function ProgramsAdminPage({ orgslug, programUuid, activeSubpage = 'objectives', rootTab = 'templates', requirementFrameworkUuid, requirementSubpage = 'details' }: { orgslug: string; programUuid?: string; activeSubpage?: ProgramSubpage; rootTab?: 'templates' | 'assignments' | 'requirements' | 'reporting'; requirementFrameworkUuid?: string; requirementSubpage?: 'details' | 'levels' | 'spec' }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  if (programUuid) return <ProgramDetail orgslug={orgslug} orgId={Number(org?.id)} token={token} programUuid={programUuid} activeSubpage={activeSubpage} />
  if (requirementFrameworkUuid) return <div className="min-h-full w-full bg-[#f8f8f8]"><AdminFeatureHeader feature="Plans" activeTab="requirements" tabs={tabsForPlans(orgslug)} /><RequirementFrameworkDetail orgslug={orgslug} orgId={Number(org?.id)} token={token} frameworkUuid={requirementFrameworkUuid} activeSubpage={requirementSubpage} /></div>
  const tabs = tabsForPlans(orgslug)
  const content = rootTab === 'assignments' ? <AllAssignments orgslug={orgslug} orgId={Number(org?.id)} token={token} /> : rootTab === 'requirements' ? <RequirementsAdmin orgId={Number(org?.id)} token={token} orgslug={orgslug} /> : rootTab === 'reporting' ? <RequirementsReporting orgId={Number(org?.id)} token={token} /> : <ProgramList orgslug={orgslug} orgId={Number(org?.id)} token={token} />
  return <div className="min-h-full w-full bg-[#f8f8f8]"><AdminFeatureHeader feature="Plans" activeTab={rootTab} tabs={tabs} />{(rootTab === 'templates' || rootTab === 'assignments') ? <PlanStructureGuide active={rootTab} /> : null}{content}</div>
}

function tabsForPlans(orgslug: string) {
  return [
    { id: 'templates', label: 'Templates', icon: <Layers3 size={16} />, href: getUriWithOrg(orgslug, routePaths.org.dash.programs()) },
    { id: 'assignments', label: 'Assignments', icon: <Users size={16} />, href: getUriWithOrg(orgslug, routePaths.org.dash.planAssignments()) },
    { id: 'requirements', label: 'Requirements', icon: <ClipboardCheck size={16} />, href: getUriWithOrg(orgslug, routePaths.org.dash.planRequirements()) },
    { id: 'reporting', label: 'Reporting', icon: <BarChart3 size={16} />, href: getUriWithOrg(orgslug, routePaths.org.dash.planReporting()) },
  ]
}

function PlanStructureGuide({ active }: { active: 'templates' | 'assignments' }) {
  return <div className="px-10 pt-6"><div className="rounded-xl border border-border bg-card px-5 py-4 shadow-xs"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">How managed plans work</p><div className="mt-2 flex flex-wrap items-center gap-2 text-xs"><span className={cn('rounded-lg px-3 py-2 font-black', active === 'templates' ? 'bg-foreground text-background' : 'bg-muted')}>1. Template <span className="font-medium opacity-70">defines the plan</span></span><ChevronRight size={14} className="text-muted-foreground" /><span className={cn('rounded-lg px-3 py-2 font-black', active === 'assignments' ? 'bg-foreground text-background' : 'bg-muted')}>2. Assignment <span className="font-medium opacity-70">delivers it to people</span></span><ChevronRight size={14} className="text-muted-foreground" /><span className="rounded-lg bg-muted px-3 py-2 font-black">3. Live plan <span className="font-medium opacity-70">tracks one learner</span></span></div></div></div>
}

function AllAssignments({ orgslug, orgId, token }: { orgslug: string; orgId: number; token?: string }) {
  const key = orgId && token ? `${getAPIUrl()}planning/assignment-batches?org_id=${orgId}` : null
  const { data: assignments, isLoading, mutate: refresh } = useSWR(key, (url) => swrFetcher(url, token), { revalidateOnFocus: false })
  const [query, setQuery] = React.useState('')
  const [type, setType] = React.useState('all')
  const [lifecycle, setLifecycle] = React.useState('active')
  const visible = (assignments || []).filter((assignment: any) => {
    const recipient = assignment.cohort?.name || [assignment.user?.first_name, assignment.user?.last_name].filter(Boolean).join(' ') || assignment.user?.username || assignment.subject_email || ''
    const matchesSearch = `${assignment.program_name} ${recipient}`.toLowerCase().includes(query.trim().toLowerCase())
    const matchesType = type === 'all' || assignment.assignment_type === type
    const counts = assignment.lifecycle_counts || {}
    const matchesLifecycle = lifecycle === 'all' || Number(counts[lifecycle] || 0) > 0
    return matchesSearch && matchesType && matchesLifecycle
  })
  return <div className="px-10 pb-10 pt-6"><section className="rounded-xl bg-card p-6 shadow-xs">
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-bold text-foreground">Plan assignments</h2><p className="mt-1 text-sm text-muted-foreground">Manage assignment batches and each person’s independent live plan.</p></div><ProgramAssignmentModal onAssigned={refresh} trigger={<button className="inline-flex items-center gap-2 rounded-lg bg-black px-5 py-2.5 text-xs font-bold text-white nice-shadow"><Plus size={15} />Assign a plan</button>} /></div>
    {(assignments || []).length ? <><div className="mb-5 flex flex-wrap gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search plans or recipients" aria-label="Search plan assignments" className="h-10 min-w-64 flex-1 rounded-lg border border-border bg-card px-3 text-sm" /><select value={type} onChange={(event) => setType(event.target.value)} aria-label="Filter by assignment type" className="h-10 rounded-lg border border-border bg-card px-3 text-sm"><option value="all">All types</option><option value="group">Group batches</option><option value="individual">Individuals</option><option value="external">External</option></select><select value={lifecycle} onChange={(event) => setLifecycle(event.target.value)} aria-label="Filter by plan state" className="h-10 rounded-lg border border-border bg-card px-3 text-sm"><option value="active">Active plans</option><option value="pending">Pending plans</option><option value="completed">Completed plans</option><option value="archived">Archived plans</option><option value="all">All states</option></select></div>{visible.length ? <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[920px] text-left text-sm"><thead className="bg-muted/60 text-[11px] font-black uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Target</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Plan states</th><th className="px-4 py-3">Progress</th><th className="px-4 py-3">Reviews</th><th className="px-4 py-3">Owner</th><th className="px-4 py-3">Schedule</th></tr></thead><tbody className="divide-y divide-border">{visible.map((assignment: any) => <AssignmentRow key={assignment.assignment_uuid} assignment={assignment} orgslug={orgslug} />)}</tbody></table></div> : <div className="rounded-xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">No assignments match these filters.</div>}</> : isLoading ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-muted-foreground" /></div> : <div className="rounded-xl border-2 border-dashed border-border py-16 text-center"><Users className="mx-auto text-gray-300" size={38} /><p className="mt-3 font-bold text-foreground">No plan assignments</p><p className="mt-1 text-sm text-muted-foreground">Assign a template to a person or group to start tracking progress here.</p></div>}
  </section></div>
}

function AssignmentRow({ assignment, orgslug }: { assignment: any; orgslug: string }) {
  const recipient = assignment.cohort?.name || [assignment.user?.first_name, assignment.user?.last_name].filter(Boolean).join(' ') || assignment.user?.username || assignment.subject_email || 'Individual learner'
  const type = assignment.assignment_type || (assignment.cohort ? 'group' : 'individual')
  const href = type === 'group' || !assignment.plan_uuid ? getUriWithOrg(orgslug, routePaths.org.dash.planAssignment(assignment.assignment_uuid, 'overview')) : getUriWithOrg(orgslug, routePaths.org.dash.livePlan(assignment.plan_uuid))
  const states = Object.entries(assignment.lifecycle_counts || {}).filter(([, count]) => Number(count) > 0).map(([state, count]) => `${count} ${state}`).join(', ') || (assignment.active ? 'Active' : 'Ended')
  const owner = assignment.owner || assignment.staff?.[0]
  const typeLabel = type === 'group' ? 'Assignment batch' : assignment.plan_uuid ? 'Live plan' : 'Individual assignment'
  return <tr className="group hover:bg-muted/30"><td className="px-4 py-4"><Link href={href} className="inline-flex items-center gap-3 font-black text-foreground group-hover:text-blue-700"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">{type === 'group' ? <Users size={15} /> : <User size={15} />}</span>{assignment.program_name}<ChevronRight size={14} /></Link></td><td className="px-4 py-4 font-semibold">{recipient}</td><td className="px-4 py-4"><span className="rounded-full bg-muted px-2 py-1 text-xs font-bold">{typeLabel}</span></td><td className="px-4 py-4 text-xs capitalize text-muted-foreground">{states}</td><td className="px-4 py-4"><div className="flex items-center gap-2"><div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"><div className="h-full bg-blue-600" style={{ width: `${assignment.progress_percent}%` }} /></div><span className="text-xs font-bold">{assignment.progress_percent}%</span></div></td><td className="px-4 py-4 text-xs font-bold text-amber-700">{assignment.ready_for_review_count || '—'}</td><td className="px-4 py-4 text-xs">{owner ? [owner.first_name, owner.last_name].filter(Boolean).join(' ') || owner.username : '—'}</td><td className="px-4 py-4 text-xs text-muted-foreground">{assignment.due_date ? `Due ${new Date(assignment.due_date).toLocaleDateString()}` : 'Self-paced'}</td></tr>
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
    } catch (error: any) { toast.error(error?.message || 'Could not create the plan template.') } finally { setSaving(false) }
  }
  return <div className="px-10 pb-10 pt-6"><section className="rounded-xl bg-card p-6 shadow-xs">
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-bold text-foreground">Plan templates</h2><p className="mt-1 text-sm text-muted-foreground">Reusable phases, objectives, roles, and defaults for managed plans.</p></div><Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="md" dialogTitle="New plan template" dialogDescription="Create the template first, then organize its objectives into phases." dialogTrigger={<button className="flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white nice-shadow transition-transform hover:scale-105"><Plus className="h-4 w-4" />New template</button>} dialogContent={<div className="flex flex-col gap-4 p-2"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" rows={3} className="w-full resize-none rounded-lg border border-border px-3 py-2 text-sm" /><button onClick={() => void create()} disabled={saving || !name.trim()} className="ml-auto inline-flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Create template</button></div>} /></div>
    {isLoading ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-muted-foreground" /></div> : programs?.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{programs.map((program: any) => <Link key={program.program_uuid} href={getUriWithOrg(orgslug, routePaths.org.dash.programPage(program.program_uuid, 'objectives'))} className="group relative flex w-full flex-col overflow-hidden rounded-xl bg-card nice-shadow transition-all duration-300 hover:scale-[1.01]"><div className="relative flex aspect-video items-center justify-center overflow-hidden bg-muted text-blue-500">{program.thumbnail_image ? <SafeImage src={program.thumbnail_image} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" /> : <Layers3 size={42} strokeWidth={1.4} />}</div><div className="flex flex-col space-y-1.5 p-3"><h2 className="line-clamp-1 text-base font-bold leading-tight text-foreground">{program.name}</h2><p className="min-h-[1.5rem] line-clamp-2 text-[11px] text-muted-foreground">{program.description || 'Organize objectives into phases and assign them to learners.'}</p><div className="flex items-center justify-between border-t border-border pt-1.5"><div className="flex items-center gap-1.5 text-muted-foreground"><BookCopy size={12} /><span className="text-[10px] font-bold uppercase tracking-wider">{program.objectives?.length || 0} objectives</span></div><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{program.assignment_count || 0} assignments</span></div></div></Link>)}</div> : <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-border py-16 text-center"><div><Layers3 size={36} className="mx-auto mb-3 text-gray-300" /><p className="text-sm text-muted-foreground">Create a plan template to start organizing reusable objectives.</p></div></div>}
  </section></div>
}

function ProgramDetail({ orgslug, orgId, token, programUuid, activeSubpage }: { orgslug: string; orgId: number; token?: string; programUuid: string; activeSubpage: ProgramSubpage }) {
  const key = orgId && token ? `${getAPIUrl()}planning/templates/${programUuid}?org_id=${orgId}` : null
  const { data: program, isLoading } = useSWR(key, (url) => swrFetcher(url, token))
  if (isLoading || !program) return <div className="flex min-h-full w-full items-center justify-center bg-[#f8f8f8]"><Loader2 className="animate-spin text-muted-foreground" /></div>
  const refresh = () => key ? mutate(key) : Promise.resolve()
  return <div className="min-h-full w-full bg-[#f8f8f8]">
    <div className="relative z-10 bg-[#fcfbfc] pl-10 pr-10 text-sm tracking-tight nice-shadow">
      <div className="pb-4 pt-6"><Breadcrumbs items={[{ label: 'Plans', href: getUriWithOrg(orgslug, routePaths.org.dash.programs()) }, { label: 'Templates', href: getUriWithOrg(orgslug, routePaths.org.dash.programs()) }, { label: program.name }]} /><p className="mt-3 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Plan template · changes apply to future assignments</p></div>
      <ProgramHeader orgId={orgId} token={token} program={program} refresh={refresh} />
      <div className="flex space-x-3 text-sm font-black">{programTabs.map((tab) => { const Icon = tab.icon; const active = activeSubpage === tab.key; return <Link key={tab.key} href={getUriWithOrg(orgslug, routePaths.org.dash.programPage(programUuid, tab.key))}><div className={cn('flex w-fit cursor-pointer space-x-4 border-black py-2 text-center transition-all ease-linear', active ? 'border-b-4' : 'opacity-50 hover:opacity-75')}><div className="mx-2 flex items-center space-x-2.5"><Icon size={16} /><div>{tab.label}</div></div></div></Link> })}</div>
    </div>
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.1 }}>{activeSubpage === 'objectives' && <><TemplateRequirementCoverage orgId={orgId} token={token} program={program} /><ProgramObjectives orgId={orgId} token={token} program={program} refresh={refresh} /></>}{activeSubpage === 'assignments' && <ProgramAssignments orgslug={orgslug} program={program} refresh={refresh} />}{activeSubpage === 'settings' && <ProgramSettings orgslug={orgslug} orgId={orgId} token={token} program={program} refresh={refresh} />}</motion.div>
  </div>
}

function TemplateRequirementCoverage({ orgId, token, program }: any) {
  const { data: frameworks = [] } = useSWR(orgId && token ? `${getAPIUrl()}planning/requirements?org_id=${orgId}` : null, (url) => swrFetcher(url, token))
  const mapped = new Set((program.objectives || []).flatMap((objective: any) => (objective.requirement_mappings || []).map((item: any) => item.node_uuid)))
  const rows = frameworks.map((framework: any) => { const parents = new Set((framework.nodes || []).map((node: any) => node.parent_node_uuid).filter(Boolean)); const leaves = (framework.nodes || []).filter((node: any) => !parents.has(node.node_uuid)); return { ...framework, leaves, covered: leaves.filter((node: any) => mapped.has(node.node_uuid)).length } }).filter((framework: any) => framework.covered > 0)
  if (!rows.length) return null
  return <div className="px-10 pt-6"><div className="mx-auto max-w-5xl rounded-xl border border-border bg-card p-4 shadow-xs"><p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Requirement coverage</p><div className="mt-3 grid gap-3 md:grid-cols-2">{rows.map((framework: any) => <div key={framework.framework_uuid} className={cn('rounded-lg border p-3', framework.covered === framework.leaves.length ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50')}><div className="flex items-center justify-between gap-3"><p className="text-xs font-bold">{framework.name}</p><span className="text-xs font-black">{framework.covered}/{framework.leaves.length}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white"><div className={cn('h-full', framework.covered === framework.leaves.length ? 'bg-green-600' : 'bg-amber-500')} style={{ width: `${framework.leaves.length ? framework.covered / framework.leaves.length * 100 : 0}%` }} /></div>{framework.covered < framework.leaves.length ? <p className="mt-2 text-[10px] font-semibold text-amber-800">Removing a sole mapping or assigning this template alone leaves {framework.leaves.length - framework.covered} requirement{framework.leaves.length - framework.covered === 1 ? '' : 's'} uncovered.</p> : null}</div>)}</div></div></div>
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
    if (field === 'name' && !value) return toast.error('Template name is required.')
    setSaving(field)
    try {
      await programsApi.update(orgId, program.program_uuid, { [field]: value }, token)
      await refresh()
      field === 'name' ? setEditingName(false) : setEditingDescription(false)
      toast.success(`Template ${field} updated.`)
    } catch (error: any) {
      toast.error(error?.message || `Could not update the template ${field}.`)
    } finally {
      setSaving(null)
    }
  }

  const saveImage = async (url: string) => {
    setSaving('image')
    try {
      await programsApi.update(orgId, program.program_uuid, { thumbnail_image: url }, token)
      await refresh()
      toast.success('Template cover image updated.')
    } catch (error: any) {
      toast.error(error?.message || 'Could not update the template cover image.')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="my-2 flex flex-col gap-5 py-2 md:flex-row md:items-center">
      <div className="group relative aspect-video w-full max-w-[240px] shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
        {program.thumbnail_image ? (
          <SafeImage src={program.thumbnail_image} alt="Plan template cover" className={cn('h-full w-full object-cover', saving === 'image' && 'animate-pulse')} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-blue-500"><Layers3 size={42} strokeWidth={1.4} /></div>
        )}
        <div className="absolute right-2 top-2 z-20 opacity-0 transition-opacity group-hover:opacity-100">
          <ImageMediaPicker owner={{ type: 'org', id: Number(orgId) }} title="Choose plan template cover image" buttonText="" buttonSize="icon" buttonVariant="secondary" className="h-8 w-8 shadow-md" disabled={saving === 'image'} onSelect={saveImage} />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="group flex min-w-0 items-start gap-2">
          {editingName ? <input autoFocus value={name} maxLength={100} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void saveText('name'); if (event.key === 'Escape') { setName(program.name); setEditingName(false) } }} className="min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-2 text-3xl font-black leading-tight outline-none focus:ring-2 focus:ring-black" /> : <h1 className="min-w-0 break-words text-3xl font-black leading-tight text-foreground">{program.name}</h1>}
          <HoverEditButton editing={editingName} saving={saving === 'name'} onClick={() => editingName ? void saveText('name') : setEditingName(true)} label="template title" />
        </div>
        <div className="group mt-2 flex max-w-3xl items-start gap-2">
          {editingDescription ? <textarea autoFocus value={description} rows={3} onChange={(event) => setDescription(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') void saveText('description'); if (event.key === 'Escape') { setDescription(program.description || ''); setEditingDescription(false) } }} className="min-w-0 flex-1 resize-y rounded-md border border-border bg-card px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-black" /> : <p className="min-w-0 flex-1 text-sm leading-6 text-muted-foreground">{program.description || 'Organize the requirements learners will work through.'}</p>}
          <HoverEditButton editing={editingDescription} saving={saving === 'description'} onClick={() => editingDescription ? void saveText('description') : setEditingDescription(true)} label="template description" />
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
  const [versionCompareOpen, setVersionCompareOpen] = React.useState(false)
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
  return <div className="px-10 pb-10 pt-6"><div className="mx-auto max-w-5xl"><div className="mb-5 flex justify-end"><Modal isDialogOpen={phaseOpen} onOpenChange={setPhaseOpen} minHeight="no-min" minWidth="md" dialogTitle="Add phase" dialogDescription="Use phases for terms, units, milestones, or another meaningful grouping." dialogTrigger={<button className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-xs font-bold nice-shadow hover:bg-muted"><Plus size={15} />Add phase</button>} dialogContent={<div className="space-y-4 p-2"><Field label="Phase name"><input autoFocus value={phaseName} onChange={(e) => setPhaseName(e.target.value)} className="h-10 w-full rounded-lg border border-border px-3 text-sm" placeholder="Term 2" /></Field><Field label="Suggested duration in weeks (optional)"><input type="number" min={1} value={durationWeeks} onChange={(e) => setDurationWeeks(e.target.value)} className="h-10 w-full rounded-lg border border-border px-3 text-sm" placeholder="6" /></Field><button onClick={() => void createPhase()} disabled={!phaseName.trim() || saving} className="ml-auto flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white disabled:opacity-50">{saving && <Loader2 size={15} className="animate-spin" />}Add phase</button></div>} /></div>{program.outdated_badge_objectives?.length ? <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"><p className="text-xs font-bold text-amber-950">A newer major badge version is available.</p><p className="mt-0.5 text-[11px] text-amber-800">Choose whether earlier badge awards satisfy the updated objective. Active assignments keep their existing requirements.</p><div className="mt-3 flex flex-wrap gap-2"><Modal isDialogOpen={versionCompareOpen} onOpenChange={setVersionCompareOpen} minWidth="md" dialogTitle="Compare badge versions" dialogDescription="Review the major-version changes and how many existing badge holders are affected." dialogTrigger={<button className="rounded-lg border border-amber-900 px-3 py-2 text-xs font-bold text-amber-950">Compare versions</button>} dialogContent={<div className="space-y-4">{program.outdated_badge_objectives.map((objective: any) => <section key={objective.objective_uuid} className="rounded-xl border border-border p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-black">{objective.title}</p><span className="text-xs font-bold text-amber-800">{objective.earlier_version_holder_count || 0} earlier-version holder{objective.earlier_version_holder_count === 1 ? '' : 's'}</span></div><div className="mt-3 grid gap-3 sm:grid-cols-2">{(['previous', 'latest'] as const).map((key) => { const version = objective.version_comparison?.[key] || {}; return <div key={key} className="rounded-lg bg-muted p-3"><p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">{key === 'previous' ? 'Earlier' : 'New'} · v{version.semantic_version}</p><p className="mt-1 text-sm font-bold">{version.title}</p>{version.description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{version.description}</p> : null}</div> })}</div></section>)}</div>} /></div><div className="mt-2 flex flex-wrap gap-2"><button onClick={async () => { await programsApi.updateBadgeVersions(orgId, program.program_uuid, true, token); await refresh(); toast.success('Updated; earlier major versions will still satisfy the objective.') }} className="rounded-lg border border-amber-900 px-3 py-2 text-xs font-bold text-amber-950">Accept earlier versions</button><button onClick={async () => { await programsApi.updateBadgeVersions(orgId, program.program_uuid, false, token); await refresh(); toast.success('Updated; learners must earn the new major version.') }} className="rounded-lg bg-amber-900 px-3 py-2 text-xs font-bold text-white">Require new version</button></div></div> : null}<DragDropContext onDragEnd={onDragEnd}><Droppable droppableId="program-phases" type="PROGRAM_PHASE">{(provided) => <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-8">{phases.map((phase, index) => <Draggable key={phase.phase_uuid} draggableId={`phase:${phase.phase_uuid}`} index={index}>{(drag, dragging) => <div ref={drag.innerRef} {...drag.draggableProps} style={drag.draggableProps.style} className={cn(dragging.isDragging && 'rounded-xl bg-card p-3 shadow-xl ring-2 ring-blue-300')}><PhaseSection phase={phase} orgId={orgId} token={token} program={program} refresh={refresh} phaseDragHandleProps={drag.dragHandleProps} /></div>}</Draggable>)}{provided.placeholder}</div>}</Droppable></DragDropContext></div></div>
}

function PhaseSection({ phase, orgId, token, program, refresh, phaseDragHandleProps }: any) {
  const [editing, setEditing] = React.useState(false), [name, setName] = React.useState(phase.name), [durationWeeks, setDurationWeeks] = React.useState(phase.suggested_duration_weeks ? String(phase.suggested_duration_weeks) : ''), [saving, setSaving] = React.useState(false)
  const save = async () => { if (!name.trim()) return; setSaving(true); try { await programsApi.updatePhase(orgId, program.program_uuid, phase.phase_uuid, { name, suggested_duration_weeks: durationWeeks ? Number(durationWeeks) : null }, token); await refresh(); setEditing(false) } catch (error: any) { toast.error(error?.message || 'Could not update the phase.') } finally { setSaving(false) } }
  return <section>
    <div className="group flex min-h-12 flex-wrap items-center gap-3 border-b border-border pb-2">
      <button {...phaseDragHandleProps} className="cursor-grab rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 active:cursor-grabbing" aria-label={`Move ${phase.name}`}><GripVertical size={18} /></button>
      {editing ? <><input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="h-9 min-w-44 flex-1 rounded-lg border border-border bg-card px-3 text-sm font-bold" /><label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">Suggested weeks<input type="number" min={1} value={durationWeeks} onChange={(e) => setDurationWeeks(e.target.value)} className="h-9 w-20 rounded-lg border border-border bg-card px-2 text-sm" /></label><button onClick={() => void save()} disabled={saving} className="flex h-9 items-center gap-1.5 rounded-lg bg-black px-3 text-xs font-bold text-white">{saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}Save</button></> : <><h3 className="min-w-0 flex-1 text-base font-black text-foreground">{phase.name}</h3>{phase.suggested_duration_weeks ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Clock3 size={13} />{phase.suggested_duration_weeks} week{phase.suggested_duration_weeks === 1 ? '' : 's'} suggested</span> : null}<button onClick={() => setEditing(true)} className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"><Pencil size={14} /></button></>}
    </div>
    <Droppable droppableId={phase.phase_uuid} type="PROGRAM_OBJECTIVE">{(provided, snapshot) => <div ref={provided.innerRef} {...provided.droppableProps} className={cn('space-y-2 py-3 transition', snapshot.isDraggingOver && 'rounded-lg bg-blue-50/70 ring-2 ring-inset ring-blue-200')}>
      {phase.objectives.map((objective: any, index: number) => <Draggable key={objective.objective_uuid} draggableId={objective.objective_uuid} index={index}>{(drag, dragging) => <div ref={drag.innerRef} {...drag.draggableProps} style={drag.draggableProps.style}><ObjectiveRow objective={{ ...objective, suggested_duration_weeks: phase.suggested_duration_weeks }} dragHandleProps={drag.dragHandleProps} dragging={dragging.isDragging} /></div>}</Draggable>)}
      {provided.placeholder}
      {!phase.objectives.length && <div className="rounded-lg border border-dashed border-border py-7 text-center text-xs font-semibold text-muted-foreground">No objectives in this phase yet.</div>}
      <ObjectiveInlineCreator orgId={orgId} token={token} program={program} phase={phase} refresh={refresh} />
    </div>}</Droppable>
  </section>
}

function ObjectiveRow(props: any) {
  const org = useOrg() as any
  const session = useLHSession() as any
  return <ProgramObjectiveEditorRow {...props} orgId={Number(org?.id)} token={session?.data?.tokens?.access_token} program={{ program_uuid: props.objective.program_uuid }} />
}

function ObjectiveInlineCreator({ orgId, token, program, phase, refresh }: any) {
  const [open, setOpen] = React.useState(false)
  const [editorKey, setEditorKey] = React.useState(0)
  const [saving, setSaving] = React.useState(false)
  const { data: badges = [] } = useSWR(open && token ? ['template-objective-creator-badges', token] : null, async ([, accessToken]) => {
    const response = await getLearningBadges(undefined, accessToken)
    return Array.isArray(response) ? response : response?.data || []
  })
  const objective = React.useMemo(() => ({
    objective_uuid: `draft_${editorKey}`,
    title: '',
    description: '',
    fields: [],
    completion_restricted: true,
    allow_learner_confirmation: false,
    suggested_due_week: null,
    suggested_duration_weeks: phase.suggested_duration_weeks,
  }), [editorKey, phase.suggested_duration_weeks])
  const close = () => { setOpen(false); setEditorKey((value) => value + 1) }
  const add = async (draft: any) => {
    setSaving(true)
    try {
      await programsApi.addObjective(orgId, program.program_uuid, {
        kind: 'custom',
        title: draft.title.trim(),
        description: draft.description || '',
        phase_uuid: phase.phase_uuid,
        allow_learner_confirmation: !draft.completion_restricted,
        custom_fields: draft.fields.map((field: any) => ({ ...field, allow_student_upload: !field.restricted })),
        default_start_rule: 'phase_start',
        default_due_rule: 'phase_end',
        default_allow_late: false,
        suggested_due_week: draft.suggested_due_week ?? null,
      }, token)
      await refresh()
      close()
      toast.success(`Objective added to ${phase.name}.`)
    } catch (error: any) { toast.error(error?.message || 'Could not add this objective.'); return false } finally { setSaving(false) }
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border text-xs font-bold text-muted-foreground transition hover:border-foreground hover:bg-muted hover:text-foreground"><Plus size={15} />Add objective</button>
  return <section className="rounded-xl border border-blue-200 bg-blue-50/30 p-3 shadow-xs"><div className="mb-2 flex items-start justify-between gap-4 px-1"><div><p className="text-xs font-black text-foreground">New objective · {phase.name}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Add notes, media, links, checkboxes, or a badge as steps.</p></div><button type="button" onClick={close} disabled={saving} className="rounded-lg px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-card hover:text-foreground disabled:opacity-40">Cancel</button></div><PlanObjectiveDefinitionCard key={editorKey} objective={objective} mode="template" badges={badges} saving={saving} initiallyOpen initiallyEditing onSave={add} /></section>
}

function AssignProgramModal({ program }: any) {
  return <ProgramAssignmentModal
    initialProgramUuids={[program.program_uuid]}
    onAssigned={program.refresh}
    trigger={<button className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-xs font-bold text-white"><Send size={15} />Assign to…</button>}
  />
}

function ProgramAssignments({ orgslug, program, refresh }: any) {
  const assignments = program.assignments || []
  const active = assignments.filter((assignment: any) => assignment.active)
  const inactive = assignments.filter((assignment: any) => !assignment.active)
  const programWithRefresh = { ...program, refresh }
  return <div className="px-10 pb-10 pt-6"><div className="mx-auto max-w-5xl"><div className="mb-5 flex justify-end"><AssignProgramModal program={programWithRefresh} /></div>{active.length ? <AssignmentSection title="Active" assignments={active} orgslug={orgslug} /> : <div className="rounded-xl border border-dashed border-border bg-card py-12 text-center"><Users className="mx-auto text-gray-300" size={34} /><p className="mt-3 text-sm font-semibold text-muted-foreground">This template has no active assignments.</p></div>}{inactive.length ? <div className="mt-8"><AssignmentSection title="Past" assignments={inactive} orgslug={orgslug} /></div> : null}</div></div>
}

function AssignmentSection({ title, assignments, orgslug }: any) {
  return <section><div className="mb-2 border-b border-border pb-2"><h2 className="text-sm font-black uppercase tracking-wider text-muted-foreground">{title}</h2></div><div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-xs">{assignments.map((assignment: any) => { const cohort = assignment.cohort; const user = assignment.user; const label = cohort?.name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || 'Individual learner'; const isBatch = Boolean(cohort) || Number(assignment.learner_count || 0) > 1; const href = !isBatch && assignment.plan_uuid ? getUriWithOrg(orgslug, routePaths.org.dash.livePlan(assignment.plan_uuid)) : getUriWithOrg(orgslug, routePaths.org.dash.planAssignment(assignment.assignment_uuid)); const typeLabel = isBatch ? 'Assignment batch' : assignment.plan_uuid ? 'Live plan' : 'Individual assignment'; const content = <><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">{isBatch ? <Users size={18} /> : <User size={18} />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-black">{label}</h3><span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-black uppercase text-muted-foreground">{typeLabel}</span><span className="rounded-full bg-green-50 px-2 py-0.5 text-[9px] font-black uppercase text-green-700">{assignment.active ? 'Active' : 'Ended'}</span></div><div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{assignment.learner_count} learner{assignment.learner_count === 1 ? '' : 's'}</span><span>{assignment.progress_percent}% complete</span>{assignment.due_date ? <span className="inline-flex items-center gap-1"><CalendarDays size={12} />Due {new Date(assignment.due_date).toLocaleDateString()}</span> : null}<span>Assigned {formatDate(assignment.creation_date)}</span></div></div><ChevronRight size={16} className="text-muted-foreground" /></>; return <Link key={assignment.assignment_uuid} href={href} className="flex items-center gap-3 p-4 transition hover:bg-muted/50">{content}</Link> })}</div></section>
}

function ProgramSettings({ orgslug, orgId, token, program, refresh }: any) {
  const [instructions, setInstructions] = React.useState(program.instructions || ''), [saving, setSaving] = React.useState(false), [deleteOpen, setDeleteOpen] = React.useState(false), [deleting, setDeleting] = React.useState(false)
  const save = async () => { setSaving(true); try { await programsApi.update(orgId, program.program_uuid, { instructions }, token); await refresh(); toast.success('Default instructions saved.') } catch (error: any) { toast.error(error?.message || 'Could not save the plan template.') } finally { setSaving(false) } }
  const remove = async () => { setDeleting(true); try { await programsApi.delete(orgId, program.program_uuid, token); toast.success('Plan template deleted.'); window.location.href = getUriWithOrg(orgslug, routePaths.org.dash.programs()) } catch (error: any) { toast.error(error?.message || 'Could not delete the plan template.'); setDeleting(false) } }
  return <div className="px-10 pb-10 pt-6"><div className="max-w-3xl space-y-6"><section className="rounded-xl border border-border bg-card p-6 shadow-xs"><h2 className="text-lg font-bold">Default instructions</h2><p className="mt-1 text-sm text-muted-foreground">These instructions are reused when staff assign this plan template.</p><div className="mt-6 space-y-5"><Field label="Instructions"><textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={6} className="w-full rounded-lg border border-border p-3 text-sm" /></Field><button onClick={() => void save()} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white disabled:opacity-50">{saving && <Loader2 size={15} className="animate-spin" />}Save instructions</button></div></section><TemplateRoles orgId={orgId} token={token} program={program} refresh={refresh} /><section className="rounded-xl border border-red-200 bg-card p-6 shadow-xs"><h2 className="text-lg font-bold text-red-700">Delete plan template</h2><p className="mt-1 text-sm text-muted-foreground">Permanently remove this template and its assignment batches. Shared objective completion records remain available to the organization.</p><Modal isDialogOpen={deleteOpen} onOpenChange={setDeleteOpen} minHeight="no-min" minWidth="sm" dialogTitle="Delete plan template?" dialogDescription="This cannot be undone." dialogTrigger={<button className="mt-5 inline-flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-50"><Trash2 size={14} />Delete template</button>} dialogContent={<div className="space-y-5 p-2"><p className="text-sm leading-6 text-muted-foreground">The plan template and all of its assignment batches will be deleted. Organization-level objectives and learner completions are not deleted.</p><button onClick={() => void remove()} disabled={deleting} className="ml-auto flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2 text-xs font-bold text-white disabled:opacity-50">{deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}Delete permanently</button></div>} /></section></div></div>
}

function TemplateRoles({ orgId, token, program, refresh }: any) {
  const [roles, setRoles] = React.useState<any[]>(program.role_definitions || [])
  const [subjectKey, setSubjectKey] = React.useState(program.default_subject_role_key || 'subject')
  const [staffKey, setStaffKey] = React.useState(program.default_staff_role_key || 'reviewer')
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  React.useEffect(() => { setRoles(program.role_definitions || []); setSubjectKey(program.default_subject_role_key || 'subject'); setStaffKey(program.default_staff_role_key || 'reviewer') }, [program])
  const patchRole = (key: string, patch: any) => setRoles((current) => current.map((role) => role.key === key ? { ...role, ...patch } : role))
  const addRole = () => {
    let index = roles.length + 1
    while (roles.some((role) => role.key === `custom_role_${index}`)) index += 1
    const key = `custom_role_${index}`
    setRoles((current) => [...current, { key, name: 'Custom role', capabilities: ['view_plan'], grantable_role_keys: [] }])
    setSelectedKey(key)
  }
  const save = async () => {
    setSaving(true)
    try { await programsApi.update(orgId, program.program_uuid, { role_definitions: roles, default_subject_role_key: subjectKey, default_staff_role_key: staffKey }, token); await refresh(); toast.success('Template roles saved.') }
    catch (error: any) { toast.error(error?.message || 'Could not save template roles.') } finally { setSaving(false) }
  }
  const available = program.available_capabilities || Array.from(new Set(roles.flatMap((role) => role.capabilities || [])))
  const selectedRole = roles.find((role) => role.key === selectedKey)
  const removeRole = (key: string) => {
    setRoles((current) => current.filter((role) => role.key !== key))
    if (subjectKey === key) setSubjectKey('subject')
    if (staffKey === key) setStaffKey('reviewer')
    setSelectedKey(null)
  }
  return <section className="rounded-xl border border-border bg-card p-6 shadow-xs"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold">Plan roles</h2><p className="mt-1 text-sm text-muted-foreground">These permission bundles are copied into future assignments. Existing live plans do not change.</p></div><button onClick={addRole} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-bold"><Plus size={13} />Role</button></div><div className="mt-5 space-y-2">{roles.map((role) => <button key={role.key} type="button" onClick={() => setSelectedKey(role.key)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-border p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/30"><span className="min-w-0"><span className="block truncate text-sm font-black">{role.key === 'subject' ? 'Learner' : role.name}</span><span className="mt-1 block text-[10px] font-semibold text-muted-foreground">{(role.capabilities || []).length} permission{(role.capabilities || []).length === 1 ? '' : 's'}</span></span><span className="flex items-center gap-3"><span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">{role.key}</span><ChevronRight size={15} className="text-muted-foreground" /></span></button>)}</div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Default learner role"><select value={subjectKey} onChange={(event) => setSubjectKey(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm">{roles.map((role) => <option key={role.key} value={role.key}>{role.key === 'subject' ? 'Learner' : role.name}</option>)}</select></Field><Field label="Default staff role"><select value={staffKey} onChange={(event) => setStaffKey(event.target.value)} className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm">{roles.filter((role) => role.key !== 'subject').map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}</select></Field></div><button onClick={() => void save()} disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white disabled:opacity-50">{saving && <Loader2 size={14} className="animate-spin" />}Save roles</button>{selectedRole ? <Modal isDialogOpen onOpenChange={(next) => !next && setSelectedKey(null)} minHeight="no-min" minWidth="md" dialogTitle={selectedRole.key === 'subject' ? 'Learner' : selectedRole.name} dialogDescription={selectedRole.key === 'plan_admin' ? 'Plan admin has every permission and cannot be changed.' : 'Changes remain in this template draft until you save roles.'} dialogContent={<div className="space-y-5"><Field label="Role name"><input value={selectedRole.key === 'subject' ? 'Learner' : selectedRole.name} disabled={['subject', 'plan_admin'].includes(selectedRole.key)} onChange={(event) => patchRole(selectedRole.key, { name: event.target.value })} className="h-10 w-full rounded-lg border border-border px-3 text-sm font-bold disabled:bg-muted" /></Field><div><p className="mb-2 text-xs font-black">Permissions</p><PlanPermissionChecklist capabilities={selectedRole.capabilities || []} setCapabilities={(capabilities) => patchRole(selectedRole.key, { capabilities })} available={available} disabled={selectedRole.key === 'plan_admin'} /></div><div className="flex items-center justify-between gap-3">{!['subject', 'reviewer', 'plan_admin', 'viewer'].includes(selectedRole.key) ? <button type="button" onClick={() => removeRole(selectedRole.key)} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-xs font-bold text-red-700"><Trash2 size={14} />Remove role</button> : <span />}<button type="button" onClick={() => setSelectedKey(null)} className="rounded-lg bg-black px-5 py-2 text-xs font-bold text-white">Done</button></div></div>} /> : null}</section>
}

function formatDate(value?: string) { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString() }

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-bold"><span className="mb-2 block">{label}</span>{children}</label> }
