'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BarChart3, CalendarDays, Check, ChevronRight, Layers3, Loader2, Plus, Settings, Trash2, Users } from 'lucide-react'
import { motion } from 'motion/react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { EditableDetailHeader } from '@components/Learning/AdminBadgeCollection'
import ManageUsers from '@components/Objects/Modals/Dash/OrgUserGroups/ManageUsers'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { deleteUserGroup, updateUserGroup } from '@services/usergroups/usergroups'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { swrFetcher } from '@services/utils/ts/requests'
import React from 'react'
import ProgramAssignmentModal from '@components/Admin/Programs/ProgramAssignmentModal'

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
        {activeSubpage === 'programs' ? <GroupPrograms orgslug={orgslug} groupId={groupId} programs={data.programs || []} completedPrograms={data.completed_programs || []} refresh={mutate} /> : null}
        {activeSubpage === 'users' ? <div className="px-10 pb-10"><section className="rounded-xl bg-card p-6 shadow-xs"><ManageUsers usergroup_id={groupId} embedded /></section></div> : null}
        {activeSubpage === 'settings' ? <GroupSettings orgslug={orgslug} group={group} /> : null}
        {activeSubpage === 'reports' ? <div className="min-h-64" /> : null}
      </motion.div>
    </div>
  )
}

function GroupPrograms({ orgslug, groupId, programs, completedPrograms, refresh }: { orgslug: string; groupId: number; programs: any[]; completedPrograms: any[]; refresh: () => Promise<any> }) {
  return (
    <div className="space-y-10 px-10 pb-10">
      <section>
      <div className="mb-4 flex items-center justify-between">
        <div><h2 className="text-lg font-bold text-foreground">Active programs</h2><p className="mt-1 text-sm text-muted-foreground">Programs currently assigned to this group.</p></div>
        <ProgramAssignmentModal initialGroupIds={[groupId]} onAssigned={refresh} trigger={<button className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2.5 text-xs font-bold text-white nice-shadow"><Plus size={15} />Assign programs</button>} />
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
