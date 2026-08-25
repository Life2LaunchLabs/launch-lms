'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BarChart3, CalendarDays, Check, ChevronRight, Layers3, Loader2, Plus, Search, Settings, Trash2, Users } from 'lucide-react'
import { motion } from 'motion/react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { EditableDetailHeader } from '@components/Learning/AdminBadgeCollection'
import ManageUsers from '@components/Objects/Modals/Dash/OrgUserGroups/ManageUsers'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { deleteUserGroup, updateUserGroup } from '@services/usergroups/usergroups'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import React from 'react'

const tabs = [
  { id: 'programs', label: 'Programs', icon: Layers3 },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
] as const

type GroupSubpage = typeof tabs[number]['id']

export default function GroupAdminDetail({ orgslug, groupId, subpage = 'programs' }: { orgslug: string; groupId: number; subpage?: string }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const activeSubpage: GroupSubpage = tabs.some((tab) => tab.id === subpage) ? subpage as GroupSubpage : 'programs'
  const key = org?.id && accessToken ? `${getAPIUrl()}programs/cohorts/${groupId}?org_id=${org.id}` : null
  const { data, isLoading, mutate } = useSWR(key, (url) => swrFetcher(url, accessToken), { revalidateOnFocus: false })

  if (isLoading || !data) {
    return <div className="flex min-h-[400px] items-center justify-center bg-[#f8f8f8]"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
  }

  const group = data.cohort
  const updateGroup = async (values: Record<string, any>, token?: string) => {
    const response = await updateUserGroup(groupId, Number(org.id), token || accessToken, values)
    if (response.status !== 200) throw new Error(response.data?.detail || 'Failed to update group.')
    await mutate((current: any) => current ? { ...current, cohort: { ...current.cohort, ...response.data } } : current, false)
    return response.data
  }

  return (
    <div className="min-h-full w-full bg-[#f8f8f8]">
      <div className="relative z-10 bg-[#fcfbfc] pl-10 pr-10 tracking-tight nice-shadow">
        <div className="pb-4 pt-6">
          <Breadcrumbs items={[
            { label: 'Users', href: '/admin/users', icon: <Users size={14} /> },
            { label: 'Groups', href: '/admin/users', icon: <Users size={14} /> },
            { label: group.name },
          ]} />
        </div>
        <EditableDetailHeader
          collection={group}
          orgId={Number(org.id)}
          canEdit
          entityName="Group"
          fallbackDescription="Manage programs and users in this group."
          fallbackIcon={<Users size={32} strokeWidth={1.5} />}
          metadata={<><Users size={14} />{data.learner_count} user{data.learner_count === 1 ? '' : 's'}</>}
          updateItem={updateGroup}
        />
        <div className="flex space-x-0.5 text-sm font-black">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeSubpage === tab.id
            return (
              <Link key={tab.id} href={getUriWithOrg(orgslug, `/admin/users/groups/${groupId}/${tab.id}`)} replace>
                <div className={`w-fit cursor-pointer border-black py-2 text-center transition-all ease-linear ${isActive ? 'border-b-4' : 'opacity-50'}`}>
                  <div className="mx-2.5 flex items-center space-x-2.5"><Icon size={16} /><div>{tab.label}</div></div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
      <div className="h-6" />
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.1 }}>
        {activeSubpage === 'programs' ? <GroupPrograms orgslug={orgslug} groupId={groupId} programs={data.programs || []} completedPrograms={data.completed_programs || []} /> : null}
        {activeSubpage === 'users' ? <div className="px-10 pb-10"><section className="rounded-xl bg-card p-6 shadow-xs"><ManageUsers usergroup_id={groupId} embedded /></section></div> : null}
        {activeSubpage === 'settings' ? <GroupSettings orgslug={orgslug} group={group} /> : null}
        {activeSubpage === 'reports' ? <div className="min-h-64" /> : null}
      </motion.div>
    </div>
  )
}

function GroupPrograms({ orgslug, groupId, programs, completedPrograms }: { orgslug: string; groupId: number; programs: any[]; completedPrograms: any[] }) {
  return (
    <div className="space-y-10 px-10 pb-10">
      <section>
      <div className="mb-4 flex items-center justify-between">
        <div><h2 className="text-lg font-bold text-foreground">Active programs</h2><p className="mt-1 text-sm text-muted-foreground">Programs currently assigned to this group.</p></div>
        <AssignProgramPicker orgslug={orgslug} groupId={groupId} assignedPrograms={programs} />
      </div>
      {programs.length ? <ProgramCards orgslug={orgslug} groupId={groupId} programs={programs} /> : (
        <div className="rounded-xl border-2 border-dashed border-border bg-card py-16 text-center"><Layers3 className="mx-auto h-9 w-9 text-gray-300" /><p className="mt-3 text-sm text-muted-foreground">No programs are assigned to this group yet.</p></div>
      )}
      </section>
      {completedPrograms.length ? <section><div className="mb-4"><h2 className="text-lg font-bold text-foreground">Completed programs</h2><p className="mt-1 text-sm text-muted-foreground">Programs that have concluded for this group.</p></div><ProgramCards orgslug={orgslug} groupId={groupId} programs={completedPrograms} completed /></section> : null}
    </div>
  )
}

function ProgramCards({ orgslug, groupId, programs, completed = false }: { orgslug: string; groupId: number; programs: any[]; completed?: boolean }) {
  return <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{programs.map((program) => (
    <Link key={program.assignment_uuid} href={getUriWithOrg(orgslug, routePaths.org.dash.users.groupProgram(groupId, program.assignment_uuid))} className="group rounded-xl border border-border bg-card p-5 shadow-xs transition hover:border-blue-300">
      <div className="flex items-start justify-between gap-4"><div><p className="font-black text-foreground group-hover:text-blue-700">{program.program_name}</p><p className="mt-1 text-xs text-muted-foreground">{program.objective_count} requirements · {program.learner_count} learners</p></div>{completed ? <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-[10px] font-black uppercase text-green-700"><Check size={11} />Completed</span> : <ChevronRight size={18} className="text-muted-foreground" />}</div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${completed ? 'bg-green-600' : 'bg-blue-600'}`} style={{ width: `${program.progress_percent}%` }} /></div>
      <div className="mt-3 flex items-center justify-between text-xs font-semibold text-muted-foreground"><span>{program.progress_percent}% complete</span><span className="inline-flex items-center gap-1"><CalendarDays size={13} />{program.due_date ? `${completed ? 'Ended' : 'Due'} ${new Date(program.due_date).toLocaleDateString()}` : 'Self paced'}</span></div>
    </Link>
  ))}</div>
}

function AssignProgramPicker({ orgslug, groupId, assignedPrograms }: { orgslug: string; groupId: number; assignedPrograms: any[] }) {
  const router = useRouter()
  const org = useOrg() as any
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const orgId = Number(org?.id)
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const key = open && orgId && token ? `${getAPIUrl()}programs/?org_id=${orgId}` : null
  const { data: programs, isLoading } = useSWR(key, (url) => swrFetcher(url, token), { revalidateOnFocus: false })
  const activeProgramIds = React.useMemo(() => new Set(assignedPrograms.map((program) => program.program_uuid)), [assignedPrograms])
  const visiblePrograms = (programs || []).filter((program: any) => `${program.name} ${program.description || ''}`.toLowerCase().includes(search.trim().toLowerCase()))

  const chooseProgram = (programUuid: string) => {
    setOpen(false)
    router.push(`${getUriWithOrg(orgslug, routePaths.org.dash.programAssignmentNew(programUuid))}?groupId=${groupId}`)
  }

  return <Modal
    isDialogOpen={open}
    onOpenChange={(next) => { setOpen(next); if (!next) setSearch('') }}
    minHeight="sm"
    minWidth="sm"
    dialogTitle="Assign a program"
    dialogDescription="Choose a program to begin a new assignment for this group."
    dialogTrigger={<button className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2.5 text-xs font-bold text-white nice-shadow"><Plus size={15} />Assign a program</button>}
    dialogContent={<div className="space-y-4">
      <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search programs" className="h-10 w-full rounded-lg border border-border pl-10 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></div>
      <div className="max-h-80 space-y-2 overflow-y-auto">
        {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : visiblePrograms.length ? visiblePrograms.map((program: any) => {
          const alreadyAssigned = activeProgramIds.has(program.program_uuid)
          return <button key={program.program_uuid} disabled={alreadyAssigned} onClick={() => chooseProgram(program.program_uuid)} className="flex w-full items-center justify-between gap-4 rounded-xl border border-border p-4 text-left transition hover:border-blue-300 hover:bg-blue-50/40 disabled:cursor-not-allowed disabled:opacity-50"><div className="min-w-0"><p className="truncate text-sm font-black">{program.name}</p><p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{program.description || 'No description'}</p></div>{alreadyAssigned ? <span className="shrink-0 text-[10px] font-black uppercase text-muted-foreground">Active</span> : <ChevronRight className="shrink-0 text-muted-foreground" size={17} />}</button>
        }) : <div className="py-12 text-center text-sm text-muted-foreground">{search ? 'No programs match your search.' : 'No programs are available.'}</div>}
      </div>
    </div>}
  />
}

function GroupSettings({ orgslug, group }: { orgslug: string; group: any }) {
  const router = useRouter()
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const [deleting, setDeleting] = React.useState(false)

  const removeGroup = async () => {
    if (deleting || !confirm(`Delete "${group.name}"?`)) return
    setDeleting(true)
    const response = await deleteUserGroup(group.id, org.id, accessToken)
    if (response.status === 200) {
      toast.success('Group deleted.')
      router.push(getUriWithOrg(orgslug, routePaths.org.dash.users.usergroups()))
      router.refresh()
      return
    }
    setDeleting(false)
    toast.error(response.data?.detail || 'Failed to delete group.')
  }

  return (
    <div className="px-10 pb-10 pt-6">
      <section className="rounded-xl border border-red-100 bg-card p-6 shadow-xs">
        <h2 className="text-lg font-bold text-red-700">Danger Zone</h2>
        <div className="mt-4 flex items-start justify-between gap-6">
          <div><h3 className="text-sm font-semibold text-foreground">Delete group</h3><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">This permanently deletes the group. Users remain in the organization.</p></div>
          <button onClick={removeGroup} disabled={deleting} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-xs font-bold text-red-700 disabled:opacity-50">{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Delete</button>
        </div>
      </section>
    </div>
  )
}
