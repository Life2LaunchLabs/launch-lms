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
import { Globe, Users, SquareUserRound, X } from 'lucide-react'
import toast from 'react-hot-toast'
import ConfirmationModal from '@components/Objects/StyledElements/ConfirmationModal/ConfirmationModal'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import LinkCollectionToUserGroup from '@components/Objects/Modals/Dash/EditCollectionAccess/LinkCollectionToUserGroup'

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
    <div>
      <div className="h-6"></div>
      <div className="mx-4 sm:mx-10 bg-white rounded-xl shadow-xs px-4 py-4">
        <div className="flex flex-col bg-gray-50 -space-y-1 px-3 sm:px-5 py-3 rounded-md mb-3">
          <h1 className="font-bold text-lg sm:text-xl text-gray-800">Access Control</h1>
          <h2 className="text-gray-500 text-xs sm:text-sm">Control guest visibility and whether this collection is shared across org sites.</h2>
        </div>
        <div className={`flex flex-col sm:flex-row sm:space-x-2 space-y-2 sm:space-y-0 mx-auto mb-3 ${isSaving ? 'opacity-50 pointer-events-none' : ''}`}>
          <ConfirmationModal
            confirmationButtonText="Make Public"
            confirmationMessage="This will make the collection visible to everyone, including anonymous users."
            dialogTitle="Make Collection Public?"
            dialogTrigger={
              <div className="w-full h-[200px] bg-slate-100 rounded-lg cursor-pointer hover:bg-slate-200 transition-all">
                {isClientPublic && (
                  <div className="bg-green-200 text-green-600 font-bold w-fit my-3 mx-3 absolute text-sm px-3 py-1 rounded-lg">Active</div>
                )}
                <div className="flex flex-col space-y-1 justify-center items-center h-full p-4">
                  <Globe className="text-slate-400" size={32} />
                  <div className="text-2xl text-slate-700 font-bold">Public</div>
                  <div className="text-gray-400 text-sm text-center leading-5">Anyone can discover and view this collection.</div>
                </div>
              </div>
            }
            functionToExecute={() => handleSetPublic(true)}
            status="info"
          />
          <ConfirmationModal
            confirmationButtonText="Make Restricted"
            confirmationMessage="Only users with explicit access via user groups will be able to view this collection."
            dialogTitle="Make Collection Restricted?"
            dialogTrigger={
              <div className="w-full h-[200px] bg-slate-100 rounded-lg cursor-pointer hover:bg-slate-200 transition-all">
                {!isClientPublic && (
                  <div className="bg-green-200 text-green-600 font-bold w-fit my-3 mx-3 absolute text-sm px-3 py-1 rounded-lg">Active</div>
                )}
                <div className="flex flex-col space-y-1 justify-center items-center h-full p-4">
                  <Users className="text-slate-400" size={32} />
                  <div className="text-2xl text-slate-700 font-bold">Restricted</div>
                  <div className="text-gray-400 text-sm text-center leading-5">Only users in linked user groups can access this collection.</div>
                </div>
              </div>
            }
            functionToExecute={() => handleSetPublic(false)}
            status="info"
          />
        </div>
        <div className={`mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 ${isSaving ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-800">Shared across organizations</h3>
              <p className="mt-1 text-sm text-slate-500">
                Let signed-in users discover this collection from other org sites. Courses inside the collection still keep their own access rules.
              </p>
            </div>
            <label className="inline-flex items-center gap-3">
              <input
                type="checkbox"
                checked={isSharedAcrossOrgs}
                onChange={(e) => handleSetShared(e.target.checked)}
              />
              <span className="text-sm font-medium text-slate-700">
                {isSharedAcrossOrgs ? 'Enabled' : 'Disabled'}
              </span>
            </label>
          </div>
        </div>
        {!isClientPublic && <UserGroupsSection usergroups={usergroups} />}
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
      <div className="flex flex-col bg-gray-50 -space-y-1 px-3 sm:px-5 py-3 rounded-md mb-3">
        <h1 className="font-bold text-lg sm:text-xl text-gray-800">User Groups</h1>
        <h2 className="text-gray-500 text-xs sm:text-sm">Link user groups to grant them access to this collection.</h2>
      </div>
      <div className="overflow-x-auto">
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
