'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { CalendarDays, ClipboardCheck, Layers3, Loader2, Plus, Settings, Trash2, Users } from 'lucide-react'
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
import GroupRequirementsGrid from '@components/Admin/Plans/GroupRequirementsGrid'
import GroupPlansGrid from '@components/Admin/Plans/GroupPlansGrid'

const tabs = [
  { id: 'plans', label: 'Plans', icon: Layers3 },
  { id: 'requirements', label: 'Requirements', icon: ClipboardCheck },
  { id: 'members', label: 'Members', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const

export type GroupSubpage = typeof tabs[number]['id']

export default function GroupAdminDetail({ orgslug, groupId, subpage = 'plans' }: { orgslug: string; groupId: number; subpage?: GroupSubpage }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const activeSubpage: GroupSubpage = tabs.some((tab) => tab.id === subpage) ? subpage : 'plans'
  const key = org?.id && accessToken ? `${getAPIUrl()}planning/cohorts/${groupId}?org_id=${org.id}` : null
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
            { label: 'Users', href: getUriWithOrg(orgslug, routePaths.org.dash.users.users()), icon: <Users size={14} /> },
            { label: group.name },
          ]} />
        </div>
        <EditableDetailHeader
          collection={group}
          orgId={Number(org.id)}
          canEdit
          entityName="Group"
          fallbackDescription="Plans, requirements and members for this group."
          fallbackIcon={<Users size={32} strokeWidth={1.5} />}
          metadata={<><Users size={14} />{data.learner_count} member{data.learner_count === 1 ? '' : 's'}</>}
          updateItem={updateGroup}
        />
        <div className="flex space-x-0.5 text-sm font-black">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeSubpage === tab.id
            return (
              <Link key={tab.id} href={getUriWithOrg(orgslug, routePaths.org.dash.users.group(groupId, tab.id))} replace>
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
        {activeSubpage === 'plans' ? <GroupPlans orgslug={orgslug} orgId={Number(org.id)} token={accessToken} groupId={groupId} programs={data.programs || []} completedPrograms={data.completed_programs || []} refresh={mutate} /> : null}
        {activeSubpage === 'requirements' ? <div className="px-10 pb-10"><GroupRequirementsGrid orgslug={orgslug} orgId={Number(org.id)} token={accessToken} groupId={groupId} /></div> : null}
        {activeSubpage === 'members' ? <div className="px-10 pb-10"><section className="rounded-xl bg-card p-6 shadow-xs"><ManageUsers usergroup_id={groupId} embedded /></section></div> : null}
        {activeSubpage === 'settings' ? <GroupSettings orgslug={orgslug} group={group} /> : null}
      </motion.div>
    </div>
  )
}

function GroupPlans({ orgslug, orgId, token, groupId, programs, completedPrograms, refresh }: { orgslug: string; orgId: number; token?: string; groupId: number; programs: any[]; completedPrograms: any[]; refresh: () => Promise<any> }) {
  const router = useRouter()
  const params = useSearchParams()
  const all = [...programs, ...completedPrograms]
  const requested = params.get('assignment')
  const current = all.find((item) => item.assignment_uuid === requested) || programs[0] || completedPrograms[0]
  const choose = (uuid: string) => router.replace(getUriWithOrg(orgslug, routePaths.org.dash.users.groupPlans(groupId, uuid)))
  const assign = <ProgramAssignmentModal initialGroupIds={[groupId]} onAssigned={refresh} trigger={<button className="inline-flex h-9 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-sm font-medium hover:bg-gray-50"><Plus size={15} />Assign a template</button>} />
  if (!current) return <div className="px-10 pb-10"><div className="rounded-xl border-2 border-dashed border-border bg-card py-16 text-center"><Layers3 className="mx-auto h-9 w-9 text-gray-300" /><p className="mt-3 text-sm text-muted-foreground">No templates are assigned to this group yet.</p><div className="mt-4 flex justify-center">{assign}</div></div></div>
  return (
    <div className="space-y-4 px-10 pb-10">
      <div className="flex flex-wrap items-center gap-2">
        {all.map((program) => <button key={program.assignment_uuid} type="button" onClick={() => choose(program.assignment_uuid)} aria-pressed={program.assignment_uuid === current.assignment_uuid} className={`inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-semibold ${program.assignment_uuid === current.assignment_uuid ? 'border-black bg-black text-white' : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'}`}>{program.program_name}{!program.active ? <span className="text-[10px] font-bold uppercase opacity-70">ended</span> : <span className={`text-xs ${program.assignment_uuid === current.assignment_uuid ? 'text-white/70' : 'text-gray-500'}`}>{program.progress_percent}%</span>}</button>)}
        <span className="flex-1" />
        <span className="inline-flex items-center gap-1.5 text-xs text-gray-500"><CalendarDays size={13} />{current.due_date ? `${current.active ? 'Ends' : 'Ended'} ${new Date(current.due_date).toLocaleDateString()}` : 'Self paced'}{current.staff?.length ? ` · Staff: ${current.staff.map((person: any) => [person.first_name, person.last_name].filter(Boolean).join(' ') || person.username).join(', ')}` : ''}</span>
        {assign}
      </div>
      <GroupPlansGrid orgslug={orgslug} orgId={orgId} token={token} assignmentUuid={current.assignment_uuid} />
    </div>
  )
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
