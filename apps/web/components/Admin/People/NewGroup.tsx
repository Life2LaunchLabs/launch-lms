'use client'

import React, { type Dispatch } from 'react'
import { useRouter } from 'next/navigation'
import { useSWRConfig } from 'swr'
import toast from 'react-hot-toast'
import EditSheet from '@components/Goals/edit/EditSheet'
import { getAPIUrl, getUriWithOrg, routePaths } from '@services/config/config'
import { createUserGroup, linkUsersToUserGroup } from '@services/usergroups/usergroups'
import { schoolApi } from '@services/school/school'
import { DraftPeople, type PersonToAdd } from './GroupPeople'
import { usePeopleContext, useRefreshPeople } from './usePeople'

/**
 * A new group, named and filled in one go with the same people list as Manage group. Its chat
 * opens with "<you> created this group", so it's on top of People, and it opens once made.
 */
export default function NewGroup({ orgslug, open, onOpenChange }: { orgslug: string; open: boolean; onOpenChange: Dispatch<boolean> }) {
  const { orgId, token } = usePeopleContext()
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const refreshList = useRefreshPeople()
  const [name, setName] = React.useState('')
  const [picked, setPicked] = React.useState<PersonToAdd[]>([])
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => { if (!open) { setName(''); setPicked([]) } }, [open])

  const create = async (event?: React.FormEvent) => {
    event?.preventDefault()
    if (!token || busy || !name.trim()) return
    setBusy(true)
    const created = await createUserGroup({ name: name.trim(), description: '', org_id: orgId }, token)
    const groupId = Number(created.data?.id)
    if (created.status !== 200 || !groupId) {
      setBusy(false)
      return void toast.error(created.data?.detail || 'The group wasn’t created')
    }
    let missed = 0
    for (const person of picked.filter((item) => item.as === 'staff')) {
      try { await schoolApi.setStaff(orgId, groupId, { user_id: person.user.id, role_key: 'commenter', assignment_uuids: [] }, token) } catch { missed += 1 }
    }
    const learners = picked.filter((item) => item.as === 'learner').map((item) => item.user.id)
    if (learners.length && (await linkUsersToUserGroup(groupId, learners, orgId, token)).status !== 200) missed += learners.length
    setBusy(false)
    if (missed) toast.error(`${missed === 1 ? 'One person wasn’t' : `${missed} people weren’t`} added. Add them from Manage group.`)
    else toast.success('Group created')
    await Promise.all([refreshList(), mutate(`${getAPIUrl()}usergroups/org/${orgId}?org_id=${orgId}`), mutate(`${getAPIUrl()}usergroups/org/${orgId}/overview`)])
    onOpenChange(false)
    router.push(getUriWithOrg(orgslug, routePaths.org.admin.people.group(groupId)))
  }

  return <EditSheet open={open} onOpenChange={onOpenChange} color="#7cc4ff" title="New group" description="A group shares plans and a chat with the staff you add to it."
    footer={<button type="button" onClick={() => void create()} disabled={busy || !name.trim()} className="h-10 rounded-lg bg-black px-4 text-xs font-bold text-white disabled:opacity-50">
      {busy ? 'Creating…' : picked.length ? `Create group with ${picked.length} ${picked.length === 1 ? 'person' : 'people'}` : 'Create group'}
    </button>}>
    <form onSubmit={create}>
      <label className="block text-xs font-bold uppercase tracking-wide text-gray-500">Name
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required autoFocus placeholder="Fall cohort"
          className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm font-medium normal-case text-gray-900" />
      </label>
    </form>
    <DraftPeople value={picked} onChange={setPicked} />
  </EditSheet>
}
