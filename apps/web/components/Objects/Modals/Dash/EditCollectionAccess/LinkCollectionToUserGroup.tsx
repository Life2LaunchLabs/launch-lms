'use client'
import { useCollection } from '@components/Contexts/CollectionContext'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getAPIUrl, getUriWithOrg } from '@services/config/config'
import { linkResourcesToUserGroup } from '@services/usergroups/usergroups'
import { swrFetcher } from '@services/utils/ts/requests'
import { Info } from 'lucide-react'
import Link from 'next/link'
import React, { useEffect } from 'react'
import toast from 'react-hot-toast'
import useSWR, { mutate } from 'swr'

type Props = {
  setUserGroupModal: (value: boolean) => void
}

function LinkCollectionToUserGroup({ setUserGroupModal }: Props) {
  const collectionState = useCollection()
  const collection = collectionState?.collection
  const org = useOrg() as any
  const session = useLHSession() as any
  const access_token = session?.data?.tokens?.access_token

  const { data: usergroups } = useSWR(
    collection && org ? `${getAPIUrl()}usergroups/org/${org.id}?org_id=${org.id}` : null,
    (url) => swrFetcher(url, access_token)
  )
  const [selectedUserGroup, setSelectedUserGroup] = React.useState<any>(null)

  useEffect(() => {
    if (usergroups && usergroups.length > 0) {
      setSelectedUserGroup(usergroups[0].id)
    }
  }, [usergroups])

  const handleLink = async () => {
    if (!collection || !selectedUserGroup) return
    const res = await linkResourcesToUserGroup(selectedUserGroup, collection.collection_uuid, org.id, access_token)
    if (res.status === 200) {
      setUserGroupModal(false)
      toast.success('User group linked to collection.')
      mutate(`${getAPIUrl()}usergroups/resource/${collection.collection_uuid}?org_id=${org.id}`)
    } else {
      toast.error(`Failed to link user group (${res.status}).`)
    }
  }

  return (
    <div className="flex flex-col space-y-1">
      <div className="flex bg-yellow-100 text-yellow-900 mx-auto w-fit mt-3 px-4 py-2 space-x-2 text-sm rounded-full items-center">
        <Info size={19} />
        <h1 className="font-medium">Linked user groups gain access to the collection and its courses.</h1>
      </div>
      <div className="p-4 flex-row flex justify-between items-center">
        {usergroups?.length >= 1 && (
          <div className="py-1">
            <span className="px-3 text-gray-400 font-bold rounded-full py-1 bg-gray-100 mx-3">User Group</span>
            <select onChange={(e) => setSelectedUserGroup(e.target.value)} defaultValue={selectedUserGroup}>
              {usergroups.map((group: any) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
          </div>
        )}
        {usergroups?.length === 0 && (
          <div className="flex space-x-3 items-center">
            <span className="px-3 text-yellow-700 font-bold rounded-full py-1 mx-3">No user groups found.</span>
            <Link
              className="px-3 text-blue-700 font-bold rounded-full py-1 bg-blue-100 mx-1"
              target="_blank"
              href={getUriWithOrg(org.slug, '/dash/users/settings/usergroups')}
            >
              Create a user group
            </Link>
          </div>
        )}
        <div className="py-3">
          <button
            onClick={handleLink}
            className="bg-green-700 text-white font-bold px-4 py-2 rounded-md shadow-sm"
          >
            Link
          </button>
        </div>
      </div>
    </div>
  )
}

export default LinkCollectionToUserGroup
