'use client'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { useCollection, useCollectionDispatch } from '@components/Contexts/CollectionContext'
import { updateCollection } from '@services/courses/collections'
import { unLinkResourcesToUserGroup } from '@services/usergroups/usergroups'
import { swrFetcher } from '@services/utils/ts/requests'
import { mutate } from 'swr'
import useSWR from 'swr'
import { getAPIUrl } from '@services/config/config'
import { Globe, SquareUserRound, X } from 'lucide-react'
import toast from 'react-hot-toast'
import ConfirmationModal from '@components/Objects/StyledElements/ConfirmationModal/ConfirmationModal'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import LinkCollectionToUserGroup from '@components/Objects/Modals/Dash/EditCollectionAccess/LinkCollectionToUserGroup'
import { Switch } from '@components/ui/switch'

const CollectionEditAccess: React.FC = () => {
  const session = useLHSession() as any
  const org = useOrg() as any
  const collectionState = useCollection()
  const dispatch = useCollectionDispatch()
  const collection = collectionState?.collection
  const accessToken = session?.data?.tokens?.access_token

  const { data: usergroups } = useSWR(
    collection?.collection_uuid && org?.id
      ? `${getAPIUrl()}usergroups/resource/${collection.collection_uuid}?org_id=${org.id}`
      : null,
    (url) => swrFetcher(url, accessToken)
  )

  const [isClientPublic, setIsClientPublic] = useState<boolean | undefined>(undefined)
  const [isSharedAcrossOrgs, setIsSharedAcrossOrgs] = useState(false)
  const hasInitializedRef = useRef(false)
  const previousPublicRef = useRef<boolean | undefined>(undefined)
  const previousSharedRef = useRef(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (collection?.public !== undefined && !hasInitializedRef.current) {
      setIsClientPublic(collection.public)
      setIsSharedAcrossOrgs(collection.shared === true)
      previousPublicRef.current = collection.public
      previousSharedRef.current = collection.shared === true
      hasInitializedRef.current = true
    }
  }, [collection?.public, collection?.shared])

  const handleSetPublic = useCallback(
    async (value: boolean) => {
      if (!collection || isSaving) return
      setIsClientPublic(value)
      setIsSaving(true)
      try {
        const result = await updateCollection(collection.collection_uuid, { public: value }, accessToken)
        if (result) {
          mutate(`${getAPIUrl()}collections/${collection.collection_uuid}`)
          if (dispatch) dispatch({ type: 'setCollection', payload: { ...collection, public: value } })
          previousPublicRef.current = value
          toast.success('Access updated.')
        }
      } catch {
        setIsClientPublic(previousPublicRef.current)
        toast.error('Failed to update access.')
      } finally {
        setIsSaving(false)
      }
    },
    [collection, accessToken, dispatch, isSaving]
  )

  const handleSetShared = useCallback(
    async (value: boolean) => {
      if (!collection || isSaving) return
      setIsSharedAcrossOrgs(value)
      setIsSaving(true)
      try {
        const result = await updateCollection(collection.collection_uuid, { shared: value }, accessToken)
        if (result) {
          mutate(`${getAPIUrl()}collections/${collection.collection_uuid}`)
          if (dispatch) dispatch({ type: 'setCollection', payload: { ...collection, shared: value } })
          previousSharedRef.current = value
          toast.success('Sharing updated.')
        }
      } catch {
        setIsSharedAcrossOrgs(previousSharedRef.current)
        toast.error('Failed to update sharing.')
      } finally {
        setIsSaving(false)
      }
    },
    [collection, accessToken, dispatch, isSaving]
  )

  if (!collection) return null

  return (
    <div className="px-10 pb-10 pt-6">
      <section className="rounded-xl bg-white p-6 shadow-xs">
        <h2 className="text-lg font-bold text-gray-900">Settings</h2>
        <div className={`mt-4 divide-y divide-gray-100 ${isSaving ? 'opacity-50 pointer-events-none' : ''}`}>
          <SettingToggleRow
            icon={<Globe className="h-4 w-4" />}
            label="Public collection"
            description="Public collections are discoverable by anyone. Restricted collections require explicit user-group access."
            checked={isClientPublic === true}
            valueLabel={isClientPublic ? 'Public' : 'Restricted'}
            onCheckedChange={handleSetPublic}
          />
          <SettingToggleRow
            label="Shared across organizations"
            description="Let signed-in users discover this collection from other org sites. Courses inside the collection still keep their own access rules."
            checked={isSharedAcrossOrgs}
            valueLabel={isSharedAcrossOrgs ? 'Enabled' : 'Disabled'}
            onCheckedChange={handleSetShared}
          />
        </div>
        {!isClientPublic && <UserGroupsSection usergroups={usergroups} />}
      </section>
    </div>
  )
}

function SettingToggleRow({
  icon,
  label,
  description,
  checked,
  valueLabel,
  onCheckedChange,
}: {
  icon?: React.ReactNode
  label: string
  description: string
  checked: boolean
  valueLabel: string
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-4 first:pt-0 last:pb-0">
      <div className="flex min-w-0 gap-3">
        {icon ? (
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-gray-500">{description}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-xs font-semibold text-gray-500">{valueLabel}</span>
        <Switch checked={checked} onCheckedChange={onCheckedChange} />
      </div>
    </div>
  )
}

function UserGroupsSection({ usergroups }: { usergroups: any[] }) {
  const collectionState = useCollection()
  const collection = collectionState?.collection
  const [userGroupModal, setUserGroupModal] = useState(false)
  const session = useLHSession() as any
  const access_token = session?.data?.tokens?.access_token
  const org = useOrg() as any

  const removeUserGroupLink = async (usergroup_id: number) => {
    if (!collection) return
    try {
      const res = await unLinkResourcesToUserGroup(usergroup_id, collection.collection_uuid, org.id, access_token)
      if (res.status === 200) {
        toast.success('User group unlinked.')
        mutate(`${getAPIUrl()}usergroups/resource/${collection.collection_uuid}?org_id=${org.id}`)
      } else {
        toast.error(`Failed to unlink user group (${res.status}).`)
      }
    } catch {
      toast.error('Failed to unlink user group.')
    }
  }

  return (
    <>
      <h3 className="mt-6 border-t border-gray-100 pt-5 text-sm font-semibold text-gray-900">User Groups</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="table-auto w-full text-left whitespace-nowrap rounded-md overflow-hidden">
          <thead className="bg-gray-100 text-gray-500 rounded-xl uppercase">
            <tr className="font-bolder text-sm">
              <th className="py-3 px-4">Name</th>
              <th className="py-3 px-4">Actions</th>
            </tr>
          </thead>
          <tbody className="mt-5 bg-white rounded-md">
            {usergroups?.map((usergroup: any) => (
              <tr key={usergroup.id} className="border-b border-gray-100 text-sm">
                <td className="py-3 px-4">{usergroup.name}</td>
                <td className="py-3 px-4">
                  <ConfirmationModal
                    confirmationButtonText="Unlink"
                    confirmationMessage="Remove this user group's access to the collection?"
                    dialogTitle="Unlink User Group?"
                    dialogTrigger={
                      <button className="mr-2 flex space-x-2 hover:cursor-pointer p-1 px-3 bg-rose-700 rounded-md font-bold items-center text-sm text-rose-100">
                        <X className="w-4 h-4" />
                        <span>Unlink</span>
                      </button>
                    }
                    functionToExecute={() => removeUserGroupLink(usergroup.id)}
                    status="warning"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-row-reverse mt-3 mr-2">
        <Modal
          isDialogOpen={userGroupModal}
          onOpenChange={() => setUserGroupModal(!userGroupModal)}
          minHeight="no-min"
          minWidth="md"
          dialogContent={<LinkCollectionToUserGroup setUserGroupModal={setUserGroupModal} />}
          dialogTitle="Link User Group"
          dialogDescription="Grant a user group access to this collection."
          dialogTrigger={
            <button className="flex space-x-2 hover:cursor-pointer p-1 px-3 bg-green-700 rounded-md font-bold items-center text-sm text-green-100">
              <SquareUserRound className="w-4 h-4" />
              <span>Link to User Group</span>
            </button>
          }
        />
      </div>
    </>
  )
}

export default CollectionEditAccess
