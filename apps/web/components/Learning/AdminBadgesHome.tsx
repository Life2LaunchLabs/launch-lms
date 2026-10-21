'use client'

import Link from 'next/link'
import React from 'react'
import { useRouter } from 'next/navigation'
import { Award, BookCopy, ChevronRight, Library, Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import FilterBar from '@components/Admin/Filters/FilterBar'
import { useFilters } from '@components/Admin/Filters/useFilters'
import OwnershipChip from '@components/Admin/Plans/OwnershipChip'
import PageWelcome from '@components/Admin/PageWelcome'
import { AddFromMarketplace, primaryActionClass } from '@components/Admin/Plans/PlansActions'
import { useCanEditPlans } from '@components/Admin/Plans/useCanEditPlans'
import { getUriWithOrg, routePaths } from '@services/config/config'
import { matchesSearch, type FilterSpec } from '@/lib/admin/filters'
import {
  createLearningBadge,
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
  const canEdit = useCanEditPlans() === true
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
    <div className="px-4 pb-10 pt-6 sm:px-10">
      <BadgeList orgslug={orgslug} orgId={orgId} collections={collections} canEdit={canEdit} />
      <section className="mt-8 rounded-xl bg-card p-6 shadow-xs" aria-label="Collections">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Collections</h2>
          <p className="mt-1 text-sm text-muted-foreground">Every badge belongs to one collection.</p>
        </div>
        {canEdit ? <div className="flex items-center gap-2">
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
        </div> : null}
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
                className={`absolute right-2 top-2 z-10 h-8 w-8 items-center justify-center rounded-md border border-red-100 bg-card text-red-600 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 disabled:opacity-60 ${collection.can_edit === false ? 'hidden' : 'flex'}`}
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
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {collection.can_edit === false ? `Issued by ${collection.creator_org?.name || 'another organization'}` : 'Edit'}
                  </span>
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

type BadgeRow = { badge: any; collection: any; owned: boolean; canEdit: boolean; ownerId: number; ownerName: string }

/** Every badge the organization has: its own (one per collection) and the ones it runs with another organization's permission. */
function badgeRows(collections: any[], orgId: number, orgName: string): BadgeRow[] {
  const seen = new Set<string>()
  const rows: BadgeRow[] = []
  for (const collection of collections) {
    for (const badge of collection.badges || []) {
      if (seen.has(badge.badge_uuid)) continue
      seen.add(badge.badge_uuid)
      const owned = badge.access_type ? badge.access_type === 'owned' : Number(badge.org_id) === orgId
      rows.push({
        badge, collection, owned, canEdit: owned && badge.can_edit !== false, ownerId: Number(badge.org_id),
        ownerName: owned ? orgName : collection.creator_org?.name || 'Another organization',
      })
    }
  }
  return rows.sort((a, b) => String(a.badge.name).localeCompare(String(b.badge.name)))
}

/** Plans › Badges: search and filter the badges, open one, create one, or add one from the marketplace. */
function BadgeList({ orgslug, orgId, collections, canEdit }: { orgslug: string; orgId: number; collections: any[]; canEdit: boolean }) {
  const org = useOrg() as { name?: string } | null
  const rows = React.useMemo(() => badgeRows(collections, orgId, org?.name || 'Your organization'), [collections, orgId, org?.name])
  const issuers = React.useMemo(() => {
    const byId = new Map<number, string>()
    rows.forEach((row) => byId.set(row.ownerId, row.owned ? 'Your org' : row.ownerName))
    return [...byId].map(([value, label]) => ({ value: String(value), label }))
  }, [rows])
  const specs = React.useMemo<FilterSpec[]>(() => [{ key: 'issuer', label: 'Issued by', options: [{ value: '', label: 'Anyone' }, ...issuers] }], [issuers])
  const filters = useFilters(specs)
  const { issuer } = filters.values
  const shown = rows.filter((row) => (!issuer || String(row.ownerId) === issuer)
    && matchesSearch(filters.query, row.badge.name, row.badge.description, row.ownerName, row.collection?.name))
  const hidden = rows.length - shown.length
  const ownCollections = collections.filter((collection) => Number(collection.org_id) === orgId && collection.can_edit !== false)
  return <section aria-label="Badges" className="flex flex-col gap-4">
    <FilterBar filters={filters} placeholder="Search badges"
      actions={<>{canEdit ? <NewBadgeModal orgslug={orgslug} orgId={orgId} collections={ownCollections} /> : null}<AddFromMarketplace type="badges" /></>}
      summary={`${rows.length} badge${rows.length === 1 ? '' : 's'} in your library${hidden ? ` · ${hidden} hidden by filters` : ''}`} />
    {shown.length ? <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))]">
      {shown.map((row) => <Link key={row.badge.badge_uuid} href={getUriWithOrg(orgslug, routePaths.org.admin.badge(row.badge.badge_uuid, 'analytics'))}
        className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300 hover:bg-gray-50">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-amber-200 bg-amber-50 text-amber-700">
            {row.badge.thumbnail_image ? <SafeImage src={row.badge.thumbnail_image} alt="" className="h-full w-full object-cover" /> : <Award size={22} aria-hidden="true" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block break-words text-base font-semibold text-gray-950">{row.badge.name}</span>
            <span className="block text-[13px] text-gray-500">Issued by {row.ownerName}</span>
          </span>
          <ChevronRight size={18} aria-hidden="true" className="mt-1 shrink-0 text-gray-400" />
        </div>
        {row.badge.description ? <p className="line-clamp-3 text-sm text-gray-700">{row.badge.description}</p> : null}
        <div className="mt-auto flex flex-wrap items-center gap-1.5">
          <OwnershipChip owned={row.owned} canEdit={row.canEdit} ownerName={row.ownerName} />
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">{row.badge.status === 'published' ? 'Live' : 'Draft'}</span>
          {row.collection?.name ? <span className="truncate text-xs text-gray-500">{row.collection.name}</span> : null}
        </div>
      </Link>)}
    </div> : rows.length ? <div className="flex items-center justify-center rounded-2xl border-2 border-dashed border-border px-4 py-12 text-center"><div>
      <Award size={36} className="mx-auto mb-3 text-gray-300" />
      <p className="text-sm text-muted-foreground">No badges match your search or filters.</p>
    </div></div>
      : <PageWelcome icon={<Award size={28} />} title="Badges: credentials learners earn"
        body="A badge says what a learner did and how. Link it to a template, and learners who finish that plan earn it. They keep it on their own profile."
        how={canEdit ? 'Use Create badge above to make your own, or Add from marketplace to use one another organization shares.' : 'Use Add from marketplace above to use one another organization shares.'} />}
  </section>
}

/** Create a badge in one of the organization's collections (or a new collection), then open it. */
function NewBadgeModal({ orgslug, orgId, collections }: { orgslug: string; orgId: number; collections: any[] }) {
  const router = useRouter()
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const [open, setOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [collectionId, setCollectionId] = React.useState<string>(collections[0]?.id ? String(collections[0].id) : 'new')
  const [collectionName, setCollectionName] = React.useState('')
  const needsCollection = collectionId === 'new'
  const ready = name.trim().length >= 3 && (!needsCollection || !!collectionName.trim())
  const create = async () => {
    if (!ready || saving) return
    setSaving(true)
    try {
      let targetId = Number(collectionId)
      if (needsCollection) {
        const collection = await createLearningBadgeCollection({ org_id: orgId, name: collectionName.trim(), description: '', public: true }, accessToken)
        targetId = Number(collection?.id)
      }
      const badge = await createLearningBadge({
        org_id: orgId, collection_id: targetId, name: name.trim(), description: description.trim(),
        criteria: 'Complete a plan that earns this badge.', public: true, status: 'draft',
      }, accessToken)
      toast.success('Badge created')
      setOpen(false)
      router.push(getUriWithOrg(orgslug, routePaths.org.admin.badge(badge.badge_uuid, 'definition')))
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create badge')
    } finally {
      setSaving(false)
    }
  }
  return <Modal isDialogOpen={open} onOpenChange={setOpen} minHeight="no-min" minWidth="md" dialogTitle="Create badge"
    dialogDescription="Name the badge and pick its collection. You'll define it, add ways to earn it and publish it next."
    dialogTrigger={<button type="button" className={primaryActionClass}><Plus size={16} aria-hidden="true" />Create badge</button>}
    dialogContent={<form className="flex flex-col gap-4 p-2" onSubmit={(event) => { event.preventDefault(); void create() }}>
      <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Badge name" aria-label="Badge name" maxLength={100} className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
      <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional description" aria-label="Badge description" rows={3} className="w-full resize-none rounded-lg border border-border px-3 py-2 text-sm" />
      <label className="flex flex-col gap-1.5 text-xs font-bold">Collection
        <select value={collectionId} onChange={(event) => setCollectionId(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-2 text-sm font-normal">
          {collections.map((collection) => <option key={collection.id} value={String(collection.id)}>{collection.name}</option>)}
          <option value="new">New collection…</option>
        </select>
      </label>
      {needsCollection ? <input value={collectionName} onChange={(event) => setCollectionName(event.target.value)} placeholder="Collection name" aria-label="New collection name" className="w-full rounded-lg border border-border px-3 py-2 text-sm" /> : null}
      <button type="submit" disabled={saving || !ready} className="ml-auto inline-flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white disabled:opacity-50">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Create badge
      </button>
    </form>} />
}
