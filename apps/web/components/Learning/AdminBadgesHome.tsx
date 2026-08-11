'use client'

import Link from 'next/link'
import React from 'react'
import { BookCopy, Library, Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUriWithOrg } from '@services/config/config'
import {
  createLearningBadgeCollection,
  deleteLearningBadgeCollection,
  getDeletedLearningBadgeCollections,
  getDeletedLearningBadges,
  restoreLearningBadge,
  restoreLearningBadgeCollection,
} from '@services/learning/learning'
import toast from 'react-hot-toast'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { SafeImage } from '@components/Objects/SafeImage'

function cleanCollectionId(value: string) {
  return String(value || '').replace(/^badge_collection_/, '')
}

export default function AdminBadgesHome({
  orgslug,
  orgId,
  collections,
}: {
  orgslug: string
  orgId: number
  collections: any[]
}) {
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [creating, setCreating] = React.useState(false)
  const [modalOpen, setModalOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState('')
  const [trashOpen, setTrashOpen] = React.useState(false)
  const [trash, setTrash] = React.useState<{ collections: any[]; badges: any[] }>({ collections: [], badges: [] })
  const [trashLoading, setTrashLoading] = React.useState(false)
  const [restoring, setRestoring] = React.useState('')

  const openTrash = async () => {
    setTrashOpen(true)
    setTrashLoading(true)
    try {
      const [deletedCollections, deletedBadges] = await Promise.all([
        getDeletedLearningBadgeCollections(orgId, accessToken),
        getDeletedLearningBadges(orgId, accessToken),
      ])
      setTrash({ collections: deletedCollections || [], badges: deletedBadges || [] })
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load trash')
    } finally {
      setTrashLoading(false)
    }
  }

  const restore = async (item: any, type: 'collection' | 'badge') => {
    const id = type === 'collection' ? item.collection_uuid : item.badge_uuid
    setRestoring(id)
    try {
      if (type === 'collection') await restoreLearningBadgeCollection(id, accessToken)
      else await restoreLearningBadge(id, accessToken)
      toast.success(`${type === 'collection' ? 'Collection' : 'Badge'} restored`)
      window.location.reload()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to restore item')
      setRestoring('')
    }
  }

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
    if (!confirm(`Move "${collection.name}" and its badges to trash? You can restore them for 14 days.`)) return
    setDeleting(collection.collection_uuid)
    try {
      await deleteLearningBadgeCollection(collection.collection_uuid, accessToken)
      toast.success('Badge collection moved to trash')
      window.location.reload()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete collection')
    } finally {
      setDeleting('')
    }
  }

  return (
    <div className="px-10 pb-10 pt-6">
      <section className="rounded-xl bg-card p-6 shadow-xs">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Collections</h2>
          <p className="mt-1 text-sm text-muted-foreground">Every badge belongs to one collection.</p>
        </div>
        <div className="flex items-center gap-2">
        <button onClick={openTrash} className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-xs font-bold text-foreground">
          <Trash2 className="h-4 w-4" /> Trash
        </button>
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
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              />
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional description"
                rows={3}
                className="w-full resize-none rounded-lg border border-border px-3 py-2 text-sm"
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
      </div>

      {collections.length === 0 ? (
        <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-border py-16 text-center">
          <div>
            <Library size={36} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-muted-foreground">Create a collection before adding badges.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {collections.map((collection) => (
            <Link
              key={collection.collection_uuid}
              href={getUriWithOrg(orgslug, `/admin/badges/collection/${cleanCollectionId(collection.collection_uuid)}`)}
              className="group relative flex w-full flex-col overflow-hidden rounded-xl bg-card nice-shadow transition-all duration-300 hover:scale-[1.01]"
            >
              <button
                onClick={(event) => deleteCollection(event, collection)}
                disabled={deleting === collection.collection_uuid}
                className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-md border border-red-100 bg-card text-red-600 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 disabled:opacity-60"
                title="Delete collection"
              >
                {deleting === collection.collection_uuid ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
              <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-muted text-gray-300">
                {collection.thumbnail_image ? (
                  <SafeImage src={collection.thumbnail_image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Library size={32} strokeWidth={1.5} />
                )}
              </div>
              <div className="flex flex-col space-y-1.5 p-3">
                <h2 className="line-clamp-1 text-base font-bold leading-tight text-foreground">{collection.name}</h2>
                {collection.description ? <p className="min-h-[1.5rem] line-clamp-2 text-[11px] text-muted-foreground">{collection.description}</p> : null}
                <div className="flex items-center justify-between border-t border-border pt-1.5">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <BookCopy size={12} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">{collection.badges?.length || 0} badges</span>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Edit</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      </section>
      <Modal
        isDialogOpen={trashOpen}
        onOpenChange={setTrashOpen}
        minHeight="no-min"
        minWidth="md"
        dialogTitle="Trash"
        dialogDescription="Deleted badges and collections can be restored for 14 days."
        dialogContent={
          <div className="max-h-[60vh] space-y-3 overflow-y-auto p-2">
            {trashLoading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : null}
            {!trashLoading && !trash.collections.length && !trash.badges.length ? <p className="py-8 text-center text-sm text-muted-foreground">Trash is empty.</p> : null}
            {[...trash.collections.map(item => ({ ...item, _type: 'collection' })), ...trash.badges.map(item => ({ ...item, _type: 'badge' }))].map(item => (
              <div key={item.collection_uuid || item.badge_uuid} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item._type === 'collection' ? 'Collection' : 'Badge'} · deleted {new Date(item.deleted_at).toLocaleDateString()}</p>
                </div>
                <button disabled={restoring === (item.collection_uuid || item.badge_uuid)} onClick={() => restore(item, item._type)} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-bold disabled:opacity-50">
                  {restoring === (item.collection_uuid || item.badge_uuid) ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Restore
                </button>
              </div>
            ))}
          </div>
        }
        dialogTrigger={<span className="hidden" />}
      />
    </div>
  )
}
