'use client'

import React from 'react'
import Link from 'next/link'
import useSWR, { mutate } from 'swr'
import toast from 'react-hot-toast'
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  ClipboardList,
  FileUp,
  Layers3,
  Loader2,
  Plus,
  RefreshCw,
  Send,
} from 'lucide-react'
import AdminFeatureHeader from '@components/Admin/AdminFeatureHeader'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import { programsApi } from '@services/programs/programs'
import { cn } from '@/lib/utils'

const programsKey = (orgId: number) => `${getAPIUrl()}programs/?org_id=${orgId}`

export default function ProgramsAdminPage({ orgslug, programUuid }: { orgslug: string; programUuid?: string }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const tab = [{ id: 'programs', label: 'Programs', icon: <Layers3 size={16} />, href: getUriWithOrg(orgslug, routePaths.org.dash.programs()) }]

  return (
    <div className="grid h-screen w-full grid-rows-[auto_1fr] bg-[#f8f8f8]">
      <AdminFeatureHeader feature="Programs" activeTab="programs" tabs={tab} />
      <div className="overflow-y-auto">
        {programUuid ? (
          <ProgramDefinition orgslug={orgslug} orgId={Number(org?.id)} token={token} programUuid={programUuid} />
        ) : (
          <ProgramList orgslug={orgslug} orgId={Number(org?.id)} token={token} />
        )}
      </div>
    </div>
  )
}

function ProgramList({ orgslug, orgId, token }: { orgslug: string; orgId: number; token?: string }) {
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
      await mutate(programsKey(orgId))
      setOpen(false)
      setName('')
      setDescription('')
      window.location.href = getUriWithOrg(orgslug, routePaths.org.dash.program(program.program_uuid))
    } catch (error: any) {
      toast.error(error?.message || 'Could not create the program.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-8 py-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Reusable templates</p>
          <h1 className="mt-1 text-2xl font-black text-gray-950">Programs</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">Define a shared sequence once, then assign it to cohorts or individual learners.</p>
        </div>
        <Modal
          isDialogOpen={open}
          onOpenChange={setOpen}
          minHeight="no-min"
          minWidth="md"
          dialogTitle="Create a program"
          dialogDescription="You can add reusable objectives and cohort timing next."
          dialogTrigger={<button className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2.5 text-sm font-bold text-white"><Plus size={16} />New program</button>}
          dialogContent={
            <div className="space-y-4 p-2">
              <Field label="Program name"><input autoFocus value={name} onChange={(event) => setName(event.target.value)} className="h-11 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-blue-400" placeholder="Creative Futures" /></Field>
              <Field label="Short description"><textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-24 w-full rounded-lg border border-gray-200 p-3 text-sm outline-none focus:border-blue-400" placeholder="What learners will work toward and why." /></Field>
              <button onClick={() => void create()} disabled={saving || !name.trim()} className="ml-auto flex items-center gap-2 rounded-lg bg-black px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">{saving && <Loader2 className="animate-spin" size={16} />}Create program</button>
            </div>
          }
        />
      </div>

      {isLoading ? <div className="flex justify-center py-24"><Loader2 className="animate-spin text-gray-400" /></div> : programs?.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {programs.map((program: any) => (
            <Link key={program.program_uuid} href={getUriWithOrg(orgslug, routePaths.org.dash.program(program.program_uuid))} className="group rounded-xl border border-gray-100 bg-white p-5 nice-shadow transition hover:-translate-y-0.5 hover:border-blue-200">
              <div className="flex items-start justify-between gap-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><ClipboardList size={19} /></span>
                <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide', program.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500')}>{program.status}</span>
              </div>
              <h2 className="mt-5 text-base font-black text-gray-900 group-hover:text-blue-700">{program.name}</h2>
              <p className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-gray-500">{program.description || 'Add a description and objectives to finish this template.'}</p>
              <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4 text-xs font-semibold text-gray-500">
                <span>{program.objectives?.length || 0} objectives</span>
                <span>{program.assignment_count || 0} rollouts</span>
                <ChevronRight size={15} className="text-gray-300 group-hover:text-blue-600" />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-20 text-center">
          <ClipboardList className="mx-auto text-gray-300" size={40} />
          <h2 className="mt-4 font-black text-gray-800">Create your first reusable program</h2>
          <p className="mt-1 text-sm text-gray-500">Programs keep the requirements consistent across multiple cohorts.</p>
        </div>
      )}
    </main>
  )
}

function ProgramDefinition({ orgslug, orgId, token, programUuid }: { orgslug: string; orgId: number; token?: string; programUuid: string }) {
  const key = orgId && token ? `${getAPIUrl()}programs/${programUuid}?org_id=${orgId}` : null
  const { data: program, isLoading } = useSWR(key, (url) => swrFetcher(url, token))
  const { data: objectives } = useSWR(orgId && token ? `${getAPIUrl()}programs/objectives?org_id=${orgId}` : null, (url) => swrFetcher(url, token))
  const { data: groups } = useSWR(orgId && token ? `${getAPIUrl()}usergroups/org/${orgId}?org_id=${orgId}` : null, (url) => swrFetcher(url, token))
  const { data: badges } = useSWR(orgId && token ? `${getAPIUrl()}badges/?org_id=${orgId}&admin=true` : null, (url) => swrFetcher(url, token))
  const [objectiveOpen, setObjectiveOpen] = React.useState(false)
  const [assignOpen, setAssignOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [objectiveMode, setObjectiveMode] = React.useState<'new' | 'existing'>('new')
  const [objectiveUuid, setObjectiveUuid] = React.useState('')
  const [title, setTitle] = React.useState('')
  const [objectiveKind, setObjectiveKind] = React.useState<'custom' | 'badge'>('custom')
  const [badgeUuid, setBadgeUuid] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [completionPolicy, setCompletionPolicy] = React.useState('staff')
  const [evidencePolicy, setEvidencePolicy] = React.useState('none')
  const [groupId, setGroupId] = React.useState('')
  const [dueDate, setDueDate] = React.useState('')
  const [welcome, setWelcome] = React.useState('')

  const refresh = () => key ? mutate(key) : Promise.resolve()
  const addObjective = async () => {
    setSaving(true)
    try {
      const selectedBadge = (badges || []).find((badge: any) => badge.badge_uuid === badgeUuid)
      await programsApi.addObjective(orgId, programUuid, objectiveMode === 'existing' ? { objective_uuid: objectiveUuid } : {
        title: objectiveKind === 'badge' ? selectedBadge?.name : title,
        description: objectiveKind === 'badge' ? selectedBadge?.description || '' : description,
        kind: objectiveKind, badge_uuid: objectiveKind === 'badge' ? badgeUuid : null,
        completion_policy: objectiveKind === 'badge' ? 'automatic' : completionPolicy,
        evidence_policy: objectiveKind === 'badge' ? 'none' : evidencePolicy,
      }, token)
      await refresh()
      setObjectiveOpen(false)
      setTitle('')
      setDescription('')
      toast.success('Objective added to the program.')
    } catch (error: any) { toast.error(error?.message || 'Could not add the objective.') } finally { setSaving(false) }
  }
  const assign = async () => {
    if (!groupId) return
    setSaving(true)
    try {
      const assignment = await programsApi.assign(orgId, programUuid, { usergroup_id: Number(groupId), due_date: dueDate ? new Date(`${dueDate}T23:59:59`).toISOString() : null, welcome_message: welcome }, token)
      setAssignOpen(false)
      toast.success('Program assigned. Cohort invitations are ready.')
      window.location.href = getUriWithOrg(orgslug, routePaths.org.dash.users.cohortProgram(groupId, assignment.assignment_uuid))
    } catch (error: any) { toast.error(error?.message || 'Could not assign the program.') } finally { setSaving(false) }
  }

  if (isLoading || !program) return <div className="flex justify-center py-28"><Loader2 className="animate-spin text-gray-400" /></div>
  return (
    <main className="mx-auto w-full max-w-6xl px-8 py-8">
      <Link href={getUriWithOrg(orgslug, routePaths.org.dash.programs())} className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-black"><ArrowLeft size={15} />All programs</Link>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-blue-700">Template v{program.version}</span><span className="text-xs font-semibold text-gray-400">Changes apply to future rollouts</span></div>
          <h1 className="mt-3 text-3xl font-black text-gray-950">{program.name}</h1>
          <p className="mt-2 text-sm leading-6 text-gray-500">{program.description || 'Add objectives to describe the journey learners will take.'}</p>
        </div>
        <Modal isDialogOpen={assignOpen} onOpenChange={setAssignOpen} minHeight="no-min" minWidth="md" dialogTitle="Assign to a cohort" dialogDescription="Current and future cohort members will receive an invitation." dialogTrigger={<button className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2.5 text-sm font-bold text-white"><Send size={16} />Assign program</button>} dialogContent={<div className="space-y-4 p-2">
          <Field label="Cohort"><select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm"><option value="">Choose a cohort</option>{(groups || []).map((group: any) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></Field>
          <Field label="Complete by"><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-11 w-full rounded-lg border border-gray-200 px-3 text-sm" /></Field>
          <Field label="Welcome message"><textarea value={welcome} onChange={(e) => setWelcome(e.target.value)} className="min-h-24 w-full rounded-lg border border-gray-200 p-3 text-sm" placeholder="Optional context for this cohort" /></Field>
          <button onClick={() => void assign()} disabled={!groupId || saving} className="ml-auto flex items-center gap-2 rounded-lg bg-black px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">{saving && <Loader2 className="animate-spin" size={16} />}Assign and invite</button>
        </div>} />
      </div>

      {program.outdated_badge_objectives?.length ? <div className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex gap-3"><RefreshCw className="mt-0.5 text-amber-700" size={18} /><div><p className="text-sm font-black text-amber-950">A newer major badge version is available</p><p className="mt-0.5 text-xs text-amber-800">Updating changes future assignments only. Active cohorts keep their current requirements.</p></div></div><button onClick={async () => { await programsApi.updateBadgeVersions(orgId, programUuid, token); await refresh(); toast.success('Future rollouts now use the latest badge versions.') }} className="rounded-lg bg-amber-900 px-3 py-2 text-xs font-bold text-white">Update future rollouts</button></div> : null}

      <section className="mt-8 rounded-xl border border-gray-100 bg-white nice-shadow">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5"><div><h2 className="font-black text-gray-900">Program journey</h2><p className="mt-0.5 text-xs text-gray-500">Objectives are reusable across programs; completion carries everywhere.</p></div>
          <Modal isDialogOpen={objectiveOpen} onOpenChange={setObjectiveOpen} minHeight="no-min" minWidth="md" dialogTitle="Add an objective" dialogDescription="Reuse an organization objective or define a new one." dialogTrigger={<button className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3.5 py-2 text-xs font-bold text-gray-800 hover:bg-gray-50"><Plus size={14} />Add objective</button>} dialogContent={<div className="space-y-4 p-2">
            <div className="grid grid-cols-2 rounded-lg bg-gray-100 p-1 text-xs font-bold"><button onClick={() => setObjectiveMode('new')} className={cn('rounded-md px-3 py-2', objectiveMode === 'new' && 'bg-white shadow-sm')}>Create new</button><button onClick={() => setObjectiveMode('existing')} className={cn('rounded-md px-3 py-2', objectiveMode === 'existing' && 'bg-white shadow-sm')}>Reuse existing</button></div>
            {objectiveMode === 'existing' ? <Field label="Objective"><select value={objectiveUuid} onChange={(e) => setObjectiveUuid(e.target.value)} className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm"><option value="">Choose an objective</option>{(objectives || []).map((objective: any) => <option key={objective.objective_uuid} value={objective.objective_uuid}>{objective.title}</option>)}</select></Field> : <><div className="grid grid-cols-2 rounded-lg bg-gray-100 p-1 text-xs font-bold"><button onClick={() => setObjectiveKind('custom')} className={cn('rounded-md px-3 py-2', objectiveKind === 'custom' && 'bg-white shadow-sm')}>Custom objective</button><button onClick={() => setObjectiveKind('badge')} className={cn('rounded-md px-3 py-2', objectiveKind === 'badge' && 'bg-white shadow-sm')}>Badge to earn</button></div>{objectiveKind === 'badge' ? <Field label="Badge"><select value={badgeUuid} onChange={(e) => setBadgeUuid(e.target.value)} className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm"><option value="">Choose a badge</option>{(badges || []).filter((badge: any) => badge.status === 'published').map((badge: any) => <option key={badge.badge_uuid} value={badge.badge_uuid}>{badge.name}</option>)}</select><p className="mt-2 text-[10px] font-semibold text-gray-400">The current major version is pinned automatically.</p></Field> : <><Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} className="h-11 w-full rounded-lg border border-gray-200 px-3 text-sm" placeholder="Portfolio PDF" /></Field><Field label="Instructions"><textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-20 w-full rounded-lg border border-gray-200 p-3 text-sm" /></Field><div className="grid grid-cols-2 gap-3"><Field label="Who confirms completion?"><select value={completionPolicy} onChange={(e) => setCompletionPolicy(e.target.value)} className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm"><option value="staff">Staff</option><option value="learner">Learner</option><option value="either">Learner or staff</option><option value="both">Both</option></select></Field><Field label="Who uploads evidence?"><select value={evidencePolicy} onChange={(e) => setEvidencePolicy(e.target.value)} className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm"><option value="none">No upload</option><option value="learner">Learner</option><option value="staff">Staff</option><option value="both">Both</option></select></Field></div></>}</>}
            <button onClick={() => void addObjective()} disabled={saving || (objectiveMode === 'new' ? (objectiveKind === 'badge' ? !badgeUuid : !title.trim()) : !objectiveUuid)} className="ml-auto flex items-center gap-2 rounded-lg bg-black px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">{saving && <Loader2 className="animate-spin" size={16} />}Add objective</button>
          </div>} />
        </div>
        <div className="p-6">
          {program.objectives?.length ? <div className="relative grid gap-3 md:grid-cols-2 xl:grid-cols-3">{program.objectives.map((objective: any, index: number) => <div key={objective.objective_uuid} className="relative rounded-xl border border-gray-200 bg-[#fcfbfc] p-4"><div className="flex items-start justify-between"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-xs font-black text-blue-700 shadow-sm">{index + 1}</span>{objective.kind === 'badge' ? <Award className="text-amber-500" size={18} /> : objective.evidence_policy !== 'none' ? <FileUp className="text-blue-500" size={18} /> : <CircleDot className="text-gray-400" size={18} />}</div><h3 className="mt-4 text-sm font-black text-gray-900">{objective.title}</h3><p className="mt-1 line-clamp-2 min-h-8 text-xs leading-4 text-gray-500">{objective.description || 'No additional instructions.'}</p><div className="mt-4 flex flex-wrap gap-1.5"><Pill>{objective.completion_policy} confirms</Pill><Pill>{objective.evidence_policy === 'none' ? 'no upload' : `${objective.evidence_policy} upload`}</Pill>{objective.badge_major_version && <Pill>badge v{objective.badge_major_version}</Pill>}</div></div>)}</div> : <div className="py-14 text-center"><CheckCircle2 className="mx-auto text-gray-300" size={36} /><p className="mt-3 text-sm font-bold text-gray-600">Start by adding the first requirement.</p></div>}
        </div>
      </section>
    </main>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-bold text-gray-600"><span className="mb-2 block">{label}</span>{children}</label> }
function Pill({ children }: { children: React.ReactNode }) { return <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-gray-500 ring-1 ring-gray-200">{children}</span> }
