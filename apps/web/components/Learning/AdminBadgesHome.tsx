'use client'

import Link from 'next/link'
import React from 'react'
import { AlertTriangle, BookCopy, Eye, Library, Loader2, Plus, Trash2, Wand2 } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUriWithOrg } from '@services/config/config'
import {
  convertLearningBadgeCollectionMigration,
  convertLearningBadgeCourseMigration,
  createLearningBadgeCollection,
  deleteLearningBadgeCollection,
  previewLearningBadgeCollectionMigration,
} from '@services/learning/learning'
import toast from 'react-hot-toast'
import Modal from '@components/Objects/StyledElements/Modal/Modal'

function cleanCollectionId(value: string) {
  return String(value || '').replace(/^badge_collection_/, '')
}

export default function AdminBadgesHome({
  orgslug,
  orgId,
  collections,
  legacyCollections = [],
}: {
  orgslug: string
  orgId: number
  collections: any[]
  legacyCollections?: any[]
}) {
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [creating, setCreating] = React.useState(false)
  const [modalOpen, setModalOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState('')

  const createCollection = async () => {
    if (!name.trim()) return
    setCreating(true)
    try {
      await createLearningBadgeCollection({
        org_id: orgId,
        name: name.trim(),
        description: description.trim(),
        public: true,
      }, accessToken)
      toast.success('Badge collection created')
      setModalOpen(false)
      window.location.reload()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create collection')
    } finally {
      setCreating(false)
    }
  }

  const deleteCollection = async (event: React.MouseEvent, collection: any) => {
    event.preventDefault()
    event.stopPropagation()
    if (deleting) return
    if (!confirm(`Delete "${collection.name}" and its badges?`)) return
    setDeleting(collection.collection_uuid)
    try {
      await deleteLearningBadgeCollection(collection.collection_uuid, accessToken)
      toast.success('Badge collection deleted')
      window.location.reload()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete collection')
    } finally {
      setDeleting('')
    }
  }

  return (
    <div className="h-full min-h-screen w-full bg-[#f8f8f8] px-10 py-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-950">Badge Collections</h1>
          <p className="mt-1 text-sm text-gray-500">Every badge belongs to one collection.</p>
        </div>
        <Modal
          isDialogOpen={modalOpen}
          onOpenChange={setModalOpen}
          minHeight="no-min"
          minWidth="md"
          dialogTitle="New Badge Collection"
          dialogDescription="Create a collection that will own its badges."
          dialogContent={
            <div className="flex flex-col gap-4 p-2">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Collection name"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional description"
                rows={3}
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                onClick={createCollection}
                disabled={creating || !name.trim()}
                className="ml-auto inline-flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Collection
              </button>
            </div>
          }
          dialogTrigger={
            <button className="flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white nice-shadow transition-transform hover:scale-105">
              <Plus className="h-4 w-4" />
              New Collection
            </button>
          }
        />
      </div>

      {collections.length === 0 && legacyCollections.length === 0 ? (
        <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
          <div>
            <Library size={36} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-500">Create a collection before adding badges.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {legacyCollections.map((collection) => (
            <LegacyCollectionCard key={collection.collection_uuid} collection={collection} accessToken={accessToken} />
          ))}
          {collections.map((collection) => (
            <Link
              key={collection.collection_uuid}
              href={getUriWithOrg(orgslug, `/admin/badges/collection/${cleanCollectionId(collection.collection_uuid)}`)}
              className="group relative flex w-full flex-col overflow-hidden rounded-xl bg-white nice-shadow transition-all duration-300 hover:scale-[1.01]"
            >
              <button
                onClick={(event) => deleteCollection(event, collection)}
                disabled={deleting === collection.collection_uuid}
                className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-md border border-red-100 bg-white text-red-600 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 disabled:opacity-60"
                title="Delete collection"
              >
                {deleting === collection.collection_uuid ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
              <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-gray-50 text-gray-300">
                <Library size={32} strokeWidth={1.5} />
              </div>
              <div className="flex flex-col space-y-1.5 p-3">
                <h2 className="line-clamp-1 text-base font-bold leading-tight text-gray-900">{collection.name}</h2>
                {collection.description ? <p className="min-h-[1.5rem] line-clamp-2 text-[11px] text-gray-500">{collection.description}</p> : null}
                <div className="flex items-center justify-between border-t border-gray-100 pt-1.5">
                  <div className="flex items-center gap-1.5 text-gray-500">
                    <BookCopy size={12} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">{collection.badges?.length || 0} badges</span>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Edit</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function LegacyCollectionCard({ collection, accessToken }: { collection: any; accessToken?: string }) {
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [preview, setPreview] = React.useState<any>(null)
  const [loadingPreview, setLoadingPreview] = React.useState(false)
  const [converting, setConverting] = React.useState('')

  const loadPreview = async () => {
    setLoadingPreview(true)
    try {
      const data = await previewLearningBadgeCollectionMigration(collection.collection_uuid, accessToken)
      setPreview(data)
    } catch (error: any) {
      toast.error(error?.message || 'Failed to preview conversion')
    } finally {
      setLoadingPreview(false)
    }
  }

  const convertCollection = async () => {
    setConverting(collection.collection_uuid)
    try {
      await convertLearningBadgeCollectionMigration(collection.collection_uuid, accessToken)
      toast.success('Collection converted')
      window.location.reload()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to convert collection')
    } finally {
      setConverting('')
    }
  }

  const convertCourse = async (courseUuid: string) => {
    setConverting(courseUuid)
    try {
      await convertLearningBadgeCourseMigration(courseUuid, accessToken)
      toast.success('Badge converted')
      await loadPreview()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to convert badge')
    } finally {
      setConverting('')
    }
  }

  const warningCount = preview?.summary?.warnings ?? null

  return (
    <div className="relative flex w-full flex-col overflow-hidden rounded-xl border border-amber-200 bg-white nice-shadow">
      <div className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-700 shadow-sm" title="Legacy badge collection">
        <AlertTriangle className="h-4 w-4" />
      </div>
      <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-amber-50 text-amber-500">
        <Library size={32} strokeWidth={1.5} />
      </div>
      <div className="flex flex-col space-y-1.5 p-3">
        <h2 className="line-clamp-1 text-base font-bold leading-tight text-gray-900">{collection.name}</h2>
        {collection.description ? <p className="min-h-[1.5rem] line-clamp-2 text-[11px] text-gray-500">{collection.description}</p> : null}
        <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-4 text-amber-800">
          Legacy badge content. Preview and convert it before editing in the new learning path editor.
        </div>
        <div className="flex items-center justify-between border-t border-gray-100 pt-1.5">
          <div className="flex items-center gap-1.5 text-gray-500">
            <BookCopy size={12} />
            <span className="text-[10px] font-bold uppercase tracking-wider">{collection.courses?.length || 0} badges</span>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Update needed</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Modal
            isDialogOpen={previewOpen}
            onOpenChange={(open) => {
              setPreviewOpen(open)
              if (open && !preview) void loadPreview()
            }}
            minHeight="lg"
            minWidth="xl"
            dialogTitle={`Convert ${collection.name}`}
            dialogDescription="Preview what will be created in the new badge learning path system."
            dialogContent={
              <div className="max-h-[70vh] overflow-y-auto p-2">
                {loadingPreview ? (
                  <div className="flex items-center justify-center py-12 text-gray-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : preview ? (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <MigrationStat label="Badges" value={preview.summary?.badges ?? 0} />
                      <MigrationStat label="Warnings" value={preview.summary?.warnings ?? 0} tone={preview.summary?.warnings ? 'warn' : 'default'} />
                      <MigrationStat label="Target" value={preview.target?.collection_uuid || 'New collection'} small />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={convertCollection}
                        disabled={Boolean(converting)}
                        className="inline-flex h-9 items-center gap-2 rounded-lg bg-black px-4 text-xs font-bold text-white disabled:opacity-50"
                      >
                        {converting === collection.collection_uuid ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                        Convert collection
                      </button>
                    </div>
                    <div className="space-y-3">
                      {(preview.courses || []).map((coursePreview: any) => {
                        const courseUuid = coursePreview.source?.course_uuid
                        return (
                          <div key={courseUuid} className="rounded-xl border border-gray-200 bg-white p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="text-sm font-bold text-gray-950">{courseUuid}</p>
                                <p className="mt-1 text-xs text-gray-500">
                                  {coursePreview.summary?.activities || 0} activities · {coursePreview.summary?.pages || 0} pages · {coursePreview.summary?.warnings || 0} warnings
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => convertCourse(courseUuid)}
                                disabled={Boolean(converting)}
                                className="inline-flex h-8 shrink-0 items-center gap-2 rounded-lg border border-gray-200 px-3 text-xs font-bold text-gray-700 disabled:opacity-50"
                              >
                                {converting === courseUuid ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                                Convert badge
                              </button>
                            </div>
                            {(coursePreview.warnings || []).length ? (
                              <div className="mt-3 space-y-2">
                                {coursePreview.warnings.map((warning: any, index: number) => (
                                  <div key={`${warning.code}-${index}`} className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                    <span className="font-bold">{warning.code}</span>: {warning.message}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="py-10 text-center text-sm text-gray-500">No preview loaded.</div>
                )}
              </div>
            }
            dialogTrigger={
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-amber-200 bg-white px-3 text-xs font-bold text-amber-800"
              >
                <Eye className="h-4 w-4" />
                Preview
              </button>
            }
          />
          <button
            type="button"
            onClick={convertCollection}
            disabled={Boolean(converting)}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-amber-100 px-3 text-xs font-bold text-amber-800 disabled:opacity-50"
          >
            {converting === collection.collection_uuid ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Convert
          </button>
        </div>
        {warningCount !== null ? (
          <p className="text-[11px] font-semibold text-amber-700">{warningCount} conversion warnings found.</p>
        ) : null}
      </div>
    </div>
  )
}

function MigrationStat({ label, value, tone = 'default', small = false }: { label: string; value: any; tone?: 'default' | 'warn'; small?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${tone === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`${small ? 'truncate text-xs' : 'text-lg'} font-black ${tone === 'warn' ? 'text-amber-700' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}
