'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ClipboardCheck, Layers3, Loader2, Settings, Trash2, Users } from 'lucide-react'
import { motion } from 'motion/react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { EditableDetailHeader } from '@components/Learning/AdminBadgeCollection'
import ManageUsers from '@components/Objects/Modals/Dash/OrgUserGroups/ManageUsers'
import GroupStaffPanel from './GroupStaffPanel'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { deleteUserGroup, updateUserGroup } from '@services/usergroups/usergroups'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { cohortKey, goalAdminApi } from '@services/goals/admin'
import React from 'react'
import GroupRequirementsGrid from '@components/Goals/admin/live/GroupRequirementsGrid'
import { GroupAssignments } from '@components/Goals/admin/assignments/AssignmentsList'

const tabs = [
  { id: 'plans', label: 'Plans', icon: Layers3 },
  { id: 'requirements', label: 'Requirements', icon: ClipboardCheck },
  { id: 'members', label: 'People', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const

export type GroupSubpage = typeof tabs[number]['id']

export default function GroupAdminDetail({ orgslug, groupId, subpage = 'plans' }: { orgslug: string; groupId: number; subpage?: GroupSubpage }) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const activeSubpage: GroupSubpage = tabs.some((tab) => tab.id === subpage) ? subpage : 'plans'
  const key = org?.id && accessToken ? cohortKey(groupId, Number(org.id)) : null
  const { data, isLoading, mutate } = useSWR(key, () => goalAdminApi.cohort(Number(org.id), groupId, accessToken), { revalidateOnFocus: false })

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
          fallbackDescription="Goals, requirements, staff and students for this group."
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
        {activeSubpage === 'plans' ? <GroupAssignments orgslug={orgslug} groupId={groupId} cohort={data} refresh={() => mutate()} /> : null}
        {activeSubpage === 'requirements' ? <div className="px-10 pb-10"><GroupRequirementsGrid orgslug={orgslug} orgId={Number(org.id)} token={accessToken} groupId={groupId} /></div> : null}
        {activeSubpage === 'members' ? <div className="space-y-5 px-10 pb-10">
          <GroupStaffPanel orgId={Number(org.id)} groupId={groupId} token={accessToken} />
          <section className="rounded-xl bg-card p-6 shadow-xs"><h2 className="mb-4 text-lg font-bold">Students</h2><ManageUsers usergroup_id={groupId} embedded /></section>
        </div> : null}
        {activeSubpage === 'settings' ? <GroupSettings orgslug={orgslug} group={group} /> : null}
      </motion.div>
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
