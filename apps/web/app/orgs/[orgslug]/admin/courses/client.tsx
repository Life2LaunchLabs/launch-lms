'use client'

import React, { useEffect, useState } from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { AlertTriangle, ChevronLeft, ChevronRight, Library, Loader2, Plus } from 'lucide-react'
import CollectionThumbnail from '@components/Objects/Thumbnails/CollectionThumbnail'
import AuthenticatedClientElement from '@components/Security/AuthenticatedClientElement'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import FeatureDisabledView from '@components/Dashboard/Shared/FeatureDisabled/FeatureDisabledView'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { createCollection, repairCourseCollection } from '@services/courses/collections'
import { getAPIUrl } from '@services/config/config'
import { revalidateTags, swrFetcher } from '@services/utils/ts/requests'

type RepairItem = {
  course: { course_uuid: string; name: string; description?: string }
  collections: Array<{ collection_uuid: string; name: string }>
}

type CourseProps = {
  orgslug: string
  org_id: string | number
  collections?: any[]
}

function CoursesHome({ orgslug, org_id, collections = [] }: CourseProps) {
  const org = useOrg() as any
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const [newCollectionModal, setNewCollectionModal] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState('')
  const [newCollectionDescription, setNewCollectionDescription] = useState('')
  const [isCreatingCollection, setIsCreatingCollection] = useState(false)
  const [repairModal, setRepairModal] = useState(false)
  const [repairIndex, setRepairIndex] = useState(0)
  const [selectedCollection, setSelectedCollection] = useState('')
  const [isRepairing, setIsRepairing] = useState(false)

  const { data: collectionsData, mutate: mutateCollections } = useSWR(
    accessToken && org_id
      ? `${getAPIUrl()}collections/org/${org_id}/page/1/limit/100?include_shared=false`
      : null,
    (url) => swrFetcher(url, accessToken),
    { fallbackData: collections, revalidateOnFocus: true }
  )
  const allCollections = collectionsData || collections

  const { data: repairs = [], mutate: mutateRepairs } = useSWR<RepairItem[]>(
    accessToken && org_id ? `${getAPIUrl()}collections/repair/org/${org_id}` : null,
    (url) => swrFetcher(url, accessToken),
    { revalidateOnFocus: true }
  )
  const currentRepair = repairs[repairIndex]

  useEffect(() => {
    setSelectedCollection('')
  }, [repairIndex, currentRepair?.course.course_uuid])

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) return
    setIsCreatingCollection(true)
    try {
      await createCollection(
        {
          name: newCollectionName.trim(),
          description: newCollectionDescription.trim(),
          public: true,
          courses: [],
          org_id: org.id,
        },
        accessToken
      )
      await revalidateTags(['collections'], orgslug)
      await mutateCollections()
      setNewCollectionModal(false)
      setNewCollectionName('')
      setNewCollectionDescription('')
      toast.success('Collection created.')
    } catch {
      toast.error('Failed to create collection.')
    } finally {
      setIsCreatingCollection(false)
    }
  }

  const handleRepair = async () => {
    if (!currentRepair || !selectedCollection) return
    setIsRepairing(true)
    try {
      await repairCourseCollection(
        currentRepair.course.course_uuid,
        selectedCollection,
        accessToken
      )
      const remaining = await mutateRepairs()
      await mutateCollections()
      toast.success(`"${currentRepair.course.name}" moved into its collection.`)
      if (!remaining?.length) {
        setRepairModal(false)
        setRepairIndex(0)
      } else if (repairIndex >= remaining.length) {
        setRepairIndex(remaining.length - 1)
      }
    } catch {
      toast.error('Failed to update the course collection.')
    } finally {
      setIsRepairing(false)
    }
  }

  return (
    <FeatureDisabledView featureName="courses" orgslug={orgslug} context="dashboard">
      <div className="h-full w-full bg-[#f8f8f8] px-10 py-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Collections</h1>
            <p className="mt-1 text-sm text-gray-500">Every course belongs to one collection.</p>
          </div>
          <div className="flex items-center gap-2">
            {repairs.length > 0 && (
              <button
                onClick={() => {
                  setRepairIndex(0)
                  setRepairModal(true)
                }}
                className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800 transition-colors hover:bg-amber-100"
              >
                <AlertTriangle className="h-4 w-4" />
                {repairs.length} {repairs.length === 1 ? 'course needs' : 'courses need'} fixing
              </button>
            )}
            <AuthenticatedClientElement checkMethod="roles" action="create" ressourceType="collections" orgId={org_id}>
              <button
                onClick={() => setNewCollectionModal(true)}
                className="flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white nice-shadow transition-transform hover:scale-105"
              >
                <Plus className="h-4 w-4" />
                New Collection
              </button>
            </AuthenticatedClientElement>
          </div>
        </div>

        {allCollections.length === 0 ? (
          <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
            <div>
              <Library size={36} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm text-gray-500">Create a collection before adding courses.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {allCollections.map((collection: any) => (
              <CollectionThumbnail
                key={collection.collection_uuid}
                collection={collection}
                orgslug={orgslug}
                org_id={org_id}
                isDashboard
              />
            ))}
          </div>
        )}

        <Modal
          isDialogOpen={newCollectionModal}
          onOpenChange={setNewCollectionModal}
          minHeight="no-min"
          minWidth="md"
          dialogTitle="New Collection"
          dialogDescription="Create a collection that will own its courses."
          dialogContent={
            <div className="flex flex-col gap-4 p-2">
              <input
                value={newCollectionName}
                onChange={(event) => setNewCollectionName(event.target.value)}
                placeholder="Collection name"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <textarea
                value={newCollectionDescription}
                onChange={(event) => setNewCollectionDescription(event.target.value)}
                placeholder="Optional description"
                rows={3}
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                onClick={handleCreateCollection}
                disabled={isCreatingCollection || !newCollectionName.trim()}
                className="ml-auto flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {isCreatingCollection && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Collection
              </button>
            </div>
          }
        />

        <Modal
          isDialogOpen={repairModal}
          onOpenChange={setRepairModal}
          minHeight="no-min"
          minWidth="md"
          dialogTitle="Fix course collections"
          dialogDescription="Choose the single collection that should own each course."
          dialogContent={
            currentRepair ? (
              <div className="space-y-5 p-2">
                <div className="rounded-lg bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Course {repairIndex + 1} of {repairs.length}
                  </div>
                  <h3 className="mt-1 text-lg font-bold">{currentRepair.course.name}</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {currentRepair.collections.length === 0
                      ? 'This course is not in a collection.'
                      : `Currently in: ${currentRepair.collections.map((collection) => collection.name).join(', ')}`}
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Owning collection</label>
                  <select
                    value={selectedCollection}
                    onChange={(event) => setSelectedCollection(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">Select a collection</option>
                    {allCollections.map((collection: any) => (
                      <option key={collection.collection_uuid} value={collection.collection_uuid}>
                        {collection.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setRepairIndex((index) => Math.max(0, index - 1))}
                    disabled={repairIndex === 0}
                    className="flex items-center gap-1 text-sm text-gray-500 disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4" /> Previous
                  </button>
                  <div className="flex items-center gap-3">
                    {repairIndex < repairs.length - 1 && (
                      <button
                        onClick={() => setRepairIndex((index) => index + 1)}
                        className="flex items-center gap-1 text-sm text-gray-500"
                      >
                        Skip <ChevronRight className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={handleRepair}
                      disabled={!selectedCollection || isRepairing}
                      className="flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white disabled:opacity-50"
                    >
                      {isRepairing && <Loader2 className="h-4 w-4 animate-spin" />}
                      Save collection
                    </button>
                  </div>
                </div>
              </div>
            ) : null
          }
        />
      </div>
    </FeatureDisabledView>
  )
}

export default CoursesHome
