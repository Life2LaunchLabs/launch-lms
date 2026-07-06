'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React from 'react'
import { Award, BookCopy, BookOpen, Download, FileArchive, Globe, Loader2, Plus, Search, Settings, Trash2, Upload, Wand2, X } from 'lucide-react'
import { motion } from 'motion/react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { Switch } from '@components/ui/switch'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUriWithOrg } from '@services/config/config'
import {
  analyzeLearningBadgeImportPackage,
  createLearningBadge,
  convertLearningBadgeCourseMigration,
  deleteLearningBadge,
  deleteLearningBadgeCollection,
  exportLearningBadgeCollection,
  importLearningBadgePackage,
  updateLearningBadgeCollection,
} from '@services/learning/learning'
import { analyzeTutorImportFiles, downloadBlob, importTutorCourses } from '@services/courses/transfer'
import toast from 'react-hot-toast'

const tabs = [
  { id: 'badges', label: 'Badges', icon: BookCopy },
  { id: 'settings', label: 'Settings', icon: Settings },
]

function cleanCollectionId(value: string) {
  return String(value || '').replace(/^badge_collection_/, '')
}

function cleanBadgeId(value: string) {
  return String(value || '').replace(/^badge_/, '')
}

export default function AdminBadgeCollection({
  orgslug,
  orgId,
  collection,
  subpage = 'badges',
}: {
  orgslug: string
  orgId: number
  collection: any
  subpage?: string
}) {
  const activeSubpage = subpage === 'settings' ? 'settings' : 'badges'

  return (
    <div className="min-h-full w-full bg-[#f8f8f8]">
      <div className="relative z-10 bg-[#fcfbfc] pl-10 pr-10 tracking-tight nice-shadow">
        <div className="pb-4 pt-6">
          <Breadcrumbs items={[
            { label: 'Badges', href: '/admin/badges', icon: <BookOpen size={14} /> },
            { label: 'Collections', href: '/admin/badges', icon: <BookCopy size={14} /> },
            { label: collection.name },
          ]} />
        </div>
        <CollectionHeader collection={collection} />
        <div className="flex space-x-0.5 text-sm font-black">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeSubpage === tab.id
            return (
              <Link key={tab.id} href={getUriWithOrg(orgslug, `/admin/badges/collection/${cleanCollectionId(collection.collection_uuid)}/${tab.id}`)} replace>
                <div className={`w-fit cursor-pointer border-black py-2 text-center transition-all ease-linear ${isActive ? 'border-b-4' : 'opacity-50'}`}>
                  <div className="mx-2.5 flex items-center space-x-2.5">
                    <Icon size={16} />
                    <div>{tab.label}</div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
      <div className="h-6" />
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.1 }}>
        {activeSubpage === 'badges' ? <CollectionBadges orgslug={orgslug} orgId={orgId} collection={collection} /> : null}
        {activeSubpage === 'settings' ? <CollectionSettings orgslug={orgslug} collection={collection} /> : null}
      </motion.div>
    </div>
  )
}

function CollectionHeader({ collection }: { collection: any }) {
  return (
    <div className="my-2 flex flex-col gap-5 py-2 md:flex-row md:items-center">
      <div className="group relative aspect-video w-full max-w-[240px] shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
        <div className="flex h-full w-full flex-col items-center justify-center text-gray-400">
          <BookCopy size={32} strokeWidth={1.5} />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <h1 className="text-3xl font-black leading-tight text-gray-950">{collection.name}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">{collection.description || 'Manage badges in this collection.'}</p>
        <div className="mt-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400">
          <BookCopy size={14} />
          {(collection.badges || []).length} badges
        </div>
      </div>
    </div>
  )
}

function CollectionBadges({ orgslug, orgId, collection }: { orgslug: string; orgId: number; collection: any }) {
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const [search, setSearch] = React.useState('')
  const [modalOpen, setModalOpen] = React.useState(false)
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [creating, setCreating] = React.useState(false)
  const [deletingBadge, setDeletingBadge] = React.useState('')
  const [importOpen, setImportOpen] = React.useState(false)
  const [exporting, setExporting] = React.useState(false)

  const filteredBadges = (collection.badges || []).filter((badge: any) => {
    const query = search.trim().toLowerCase()
    if (!query) return true
    return badge.name?.toLowerCase().includes(query) || badge.description?.toLowerCase().includes(query)
  })

  const createBadge = async () => {
    if (!name.trim() || creating) return
    setCreating(true)
    try {
      await createLearningBadge({
        org_id: orgId,
        collection_id: collection.id,
        name: name.trim(),
        description: description.trim(),
        criteria: 'Complete the required learning path.',
        public: true,
        published: false,
      }, accessToken)
      toast.success('Badge created')
      setModalOpen(false)
      window.location.reload()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create badge')
    } finally {
      setCreating(false)
    }
  }

  const removeBadge = async (event: React.MouseEvent, badge: any) => {
    event.preventDefault()
    event.stopPropagation()
    if (deletingBadge) return
    if (!confirm(`Delete "${badge.name}"?`)) return
    setDeletingBadge(badge.badge_uuid)
    try {
      await deleteLearningBadge(badge.badge_uuid, accessToken)
      toast.success('Badge deleted')
      window.location.reload()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete badge')
    } finally {
      setDeletingBadge('')
    }
  }

  const exportCollection = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const blob = await exportLearningBadgeCollection(collection.collection_uuid, accessToken)
      const timestamp = new Date().toISOString().split('T')[0]
      downloadBlob(blob, `${collection.name.replace(/[^a-z0-9]/gi, '_')}-badges-${timestamp}.zip`)
      toast.success('Badge collection exported')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to export badge collection')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6 px-10 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search badges"
            className="w-full rounded-lg bg-white py-2.5 pl-10 pr-10 text-sm nice-shadow focus:outline-none focus:ring-2 focus:ring-black"
          />
          {search ? (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportCollection} disabled={exporting} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-800 nice-shadow transition-colors hover:bg-gray-50 disabled:opacity-50">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export
          </button>
          <Modal
            isDialogOpen={importOpen}
            onOpenChange={setImportOpen}
            minHeight="md"
            minWidth="lg"
            dialogTitle="Import Badges"
            dialogDescription={`Import badges into ${collection.name}.`}
            dialogContent={<LearningBadgeImport orgId={orgId} collection={collection} accessToken={accessToken} />}
            dialogTrigger={
              <button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-800 nice-shadow transition-colors hover:bg-gray-50">
                <Upload className="h-4 w-4" />
                Import
              </button>
            }
          />
          <Modal
            isDialogOpen={modalOpen}
            onOpenChange={setModalOpen}
            minHeight="md"
            minWidth="lg"
            dialogTitle="Create Badge"
            dialogDescription={`Create a badge in ${collection.name}.`}
            dialogContent={
              <div className="space-y-4 p-2">
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Badge name" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional badge description" rows={4} className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                <button onClick={createBadge} disabled={creating || !name.trim()} className="ml-auto flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white disabled:opacity-50">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Create Badge
                </button>
              </div>
            }
            dialogTrigger={
              <button className="flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white nice-shadow transition-transform hover:scale-105">
                <Plus className="h-4 w-4" />
                New Badge
              </button>
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {filteredBadges.map((badge: any) => (
          <Link key={badge.badge_uuid} href={getUriWithOrg(orgslug, `/admin/badges/badge/${cleanBadgeId(badge.badge_uuid)}/learning-path`)} className="group relative flex w-full flex-col overflow-hidden rounded-xl bg-white nice-shadow transition-all duration-300 hover:scale-[1.01]">
            <button
              onClick={(event) => removeBadge(event, badge)}
              disabled={deletingBadge === badge.badge_uuid}
              className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-md border border-red-100 bg-white text-red-600 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 disabled:opacity-60"
              title="Delete badge"
            >
              {deletingBadge === badge.badge_uuid ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
            <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-gray-50 text-lime-500">
              {badge.thumbnail_image ? <img src={badge.thumbnail_image} alt="" className="h-full w-full object-cover" /> : <Award size={42} strokeWidth={1.5} />}
            </div>
            <div className="flex flex-col space-y-1.5 p-3">
              <h2 className="line-clamp-1 text-base font-bold leading-tight text-gray-900">{badge.name}</h2>
              {badge.description ? <p className="min-h-[1.5rem] line-clamp-2 text-[11px] text-gray-500">{badge.description}</p> : null}
              <div className="flex items-center justify-between border-t border-gray-100 pt-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{badge.published ? 'Published' : 'Draft'}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Edit</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {filteredBadges.length === 0 ? (
        <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
          <div>
            <Award className="mx-auto mb-3 h-9 w-9 text-gray-300" />
            <p className="text-sm text-gray-500">{search ? 'No badges match your search.' : 'This collection does not have any badges yet.'}</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function LearningBadgeImport({ orgId, collection, accessToken }: { orgId: number; collection: any; accessToken?: string }) {
  const [source, setSource] = React.useState<'launch' | 'tutor'>('launch')
  const [file, setFile] = React.useState<File | null>(null)
  const [tutorFiles, setTutorFiles] = React.useState<File[]>([])
  const [analysis, setAnalysis] = React.useState<any>(null)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [namePrefix, setNamePrefix] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [result, setResult] = React.useState<any>(null)
  const [converting, setConverting] = React.useState(false)

  const analyze = async () => {
    if (loading) return
    setLoading(true)
    setResult(null)
    try {
      const nextAnalysis = source === 'tutor'
        ? { ...(await analyzeTutorImportFiles(tutorFiles, orgId, accessToken)), source_format: 'tutor-lms-json', requires_conversion: true }
        : await analyzeLearningBadgeImportPackage(file as File, orgId, accessToken)
      setAnalysis(nextAnalysis)
      const items = nextAnalysis.source_format === 'launch-lms-badge-export' ? nextAnalysis.badges || [] : nextAnalysis.courses || []
      setSelected(new Set(items.map((item: any) => item.badge_uuid || item.course_uuid).filter(Boolean)))
    } catch (error: any) {
      toast.error(error?.message || 'Failed to analyze import')
    } finally {
      setLoading(false)
    }
  }

  const importPackage = async () => {
    if (!analysis || loading) return
    setLoading(true)
    try {
      const sourceItems = analysis.source_format === 'launch-lms-badge-export' ? analysis.badges || [] : analysis.courses || []
      const selectedIds = sourceItems.map((item: any) => item.badge_uuid || item.course_uuid).filter((id: string) => selected.has(id))
      const payload = analysis.source_format === 'launch-lms-badge-export'
        ? {
            temp_id: analysis.temp_id,
            collection_uuid: collection.collection_uuid,
            badge_uuids: selectedIds,
            name_prefix: namePrefix || null,
          }
        : {
            temp_id: analysis.temp_id,
            course_uuids: selectedIds,
            name_prefix: namePrefix || null,
            set_private: true,
            set_unpublished: true,
          }
      const nextResult = analysis.source_format === 'tutor-lms-json'
        ? await importTutorCourses(
            analysis.temp_id,
            orgId,
            {
              course_uuids: selectedIds,
              name_prefix: namePrefix || null,
              set_private: true,
              set_unpublished: true,
              collection_uuid: null,
            },
            accessToken
          )
        : await importLearningBadgePackage(orgId, payload, accessToken)
      setResult(nextResult)
      toast.success('Import complete')
      if (analysis.source_format === 'launch-lms-badge-export') {
        window.location.reload()
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to import package')
    } finally {
      setLoading(false)
    }
  }

  const convertImported = async () => {
    const candidates = result?.migration_candidates || []
    if (!candidates.length || converting) return
    setConverting(true)
    try {
      for (const candidate of candidates) {
        await convertLearningBadgeCourseMigration(candidate.course_uuid, accessToken, collection.collection_uuid)
      }
      toast.success('Imported legacy courses converted to badges')
      window.location.reload()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to convert imported courses')
    } finally {
      setConverting(false)
    }
  }

  const items = analysis?.source_format === 'launch-lms-badge-export' ? analysis?.badges || [] : analysis?.courses || []
  const isLegacy = analysis?.source_format === 'launch-lms-course-export' || analysis?.source_format === 'tutor-lms-json'

  return (
    <div className="space-y-4 p-2">
      {!analysis ? (
        <>
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-1">
            <button onClick={() => { setSource('launch'); setFile(null); setTutorFiles([]) }} className={`rounded-md px-3 py-2 text-xs font-bold ${source === 'launch' ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500'}`}>Launch ZIP</button>
            <button onClick={() => { setSource('tutor'); setFile(null); setTutorFiles([]) }} className={`rounded-md px-3 py-2 text-xs font-bold ${source === 'tutor' ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500'}`}>Tutor JSON</button>
          </div>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center transition-colors hover:bg-gray-100">
            <input
              type="file"
              accept={source === 'tutor' ? '.json,application/json' : '.zip,application/zip'}
              multiple={source === 'tutor'}
              className="hidden"
              onChange={(event) => {
                if (source === 'tutor') setTutorFiles(Array.from(event.target.files || []))
                else setFile(event.target.files?.[0] || null)
              }}
            />
            <FileArchive className="h-10 w-10 text-gray-400" />
            <p className="mt-3 text-sm font-bold text-gray-900">
              {source === 'tutor'
                ? tutorFiles.length ? `${tutorFiles.length} Tutor file(s) selected` : 'Choose Tutor LMS JSON export files'
                : file?.name || 'Choose a Launch LMS badge or course export ZIP'}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {source === 'tutor'
                ? 'Tutor imports create legacy courses first, then can be converted into badges.'
                : 'New badge exports import directly. Legacy course exports can be converted after import.'}
            </p>
          </label>
          <button onClick={analyze} disabled={(source === 'tutor' ? tutorFiles.length === 0 : !file) || loading} className="ml-auto flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Analyze Package
          </button>
        </>
      ) : result ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-green-100 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
            Imported {result.successful || 0} item(s){result.failed ? `, ${result.failed} failed` : ''}.
          </div>
          {isLegacy && (result.migration_candidates || []).length > 0 ? (
            <div className="rounded-lg border border-amber-100 bg-amber-50 p-4">
              <h3 className="text-sm font-bold text-amber-900">Convert imported legacy courses?</h3>
              <p className="mt-1 text-xs leading-5 text-amber-800">This upload was an old course export. Convert the imported courses into new badges in this collection now, or skip and leave them as legacy courses.</p>
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => window.location.reload()} className="rounded-lg border border-amber-200 bg-white px-4 py-2 text-xs font-bold text-amber-900">Skip</button>
                <button onClick={convertImported} disabled={converting} className="flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                  {converting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  Convert now
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => window.location.reload()} className="ml-auto flex rounded-lg bg-black px-5 py-2 text-xs font-bold text-white">Done</button>
          )}
        </div>
      ) : (
        <>
          <div className={`rounded-lg border px-4 py-3 text-sm ${isLegacy ? 'border-amber-100 bg-amber-50 text-amber-800' : 'border-green-100 bg-green-50 text-green-800'}`}>
            {analysis.source_format === 'tutor-lms-json'
              ? 'Tutor LMS export detected. Import will create legacy courses first, then prompt you to convert them into badges.'
              : isLegacy ? 'Legacy course export detected. Import will create legacy courses first, then prompt you to convert them into badges.' : 'New badge export detected.'}
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {items.map((item: any) => {
              const id = item.badge_uuid || item.course_uuid
              return (
                <label key={id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-100 bg-white p-3">
                  <input type="checkbox" checked={selected.has(id)} onChange={(event) => {
                    const next = new Set(selected)
                    if (event.target.checked) next.add(id)
                    else next.delete(id)
                    setSelected(next)
                  }} className="mt-1" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-gray-900">{item.name}</p>
                    {item.description ? <p className="mt-0.5 truncate text-xs text-gray-500">{item.description}</p> : null}
                    <p className="mt-1 text-xs text-gray-400">{item.activities_count || 0} activities{item.pages_count != null ? `, ${item.pages_count} pages` : ''}</p>
                  </div>
                </label>
              )
            })}
          </div>
          <div className="space-y-2">
            <input value={namePrefix} onChange={(event) => setNamePrefix(event.target.value)} placeholder="Optional name prefix" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-between">
            <button onClick={() => { setAnalysis(null); setResult(null); setSelected(new Set()) }} className="rounded-lg border border-gray-200 px-4 py-2 text-xs font-bold text-gray-700">Back</button>
            <button onClick={importPackage} disabled={selected.size === 0 || loading} className="flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white disabled:opacity-50">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Import Selected
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function CollectionSettings({ orgslug, collection }: { orgslug: string; collection: any }) {
  const router = useRouter()
  const session = useLHSession() as any
  const accessToken = session.data?.tokens?.access_token
  const [isPublic, setIsPublic] = React.useState(collection.public === true)
  const [saving, setSaving] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  const updatePublic = async (value: boolean) => {
    setIsPublic(value)
    setSaving(true)
    try {
      await updateLearningBadgeCollection(collection.collection_uuid, { public: value }, accessToken)
      toast.success('Access updated')
    } catch (error: any) {
      setIsPublic(!value)
      toast.error(error?.message || 'Failed to update access')
    } finally {
      setSaving(false)
    }
  }

  const removeCollection = async () => {
    if (deleting) return
    if (!confirm(`Delete "${collection.name}" and its badges?`)) return
    setDeleting(true)
    try {
      await deleteLearningBadgeCollection(collection.collection_uuid, accessToken)
      toast.success('Badge collection deleted')
      router.push(getUriWithOrg(orgslug, '/admin/badges'))
      router.refresh()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete collection')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="px-10 pb-10 pt-6">
      <section className="rounded-xl bg-white p-6 shadow-xs">
        <h2 className="text-lg font-bold text-gray-900">Settings</h2>
        <div className={`mt-4 divide-y divide-gray-100 ${saving ? 'pointer-events-none opacity-50' : ''}`}>
          <div className="flex items-start justify-between gap-6 py-4 first:pt-0 last:pb-0">
            <div className="flex min-w-0 gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500">
                <Globe className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-gray-900">Public collection</h3>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-gray-500">Public collections are discoverable by learners. Restricted collections are hidden from public badge lists.</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-xs font-semibold text-gray-500">{isPublic ? 'Public' : 'Restricted'}</span>
              <Switch checked={isPublic} onCheckedChange={updatePublic} />
            </div>
          </div>
        </div>
      </section>
      <section className="mt-6 rounded-xl border border-red-100 bg-white p-6 shadow-xs">
        <h2 className="text-lg font-bold text-red-700">Danger Zone</h2>
        <div className="mt-4 flex items-start justify-between gap-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Delete collection</h3>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-gray-500">This permanently deletes the collection and the badges inside it.</p>
          </div>
          <button onClick={removeCollection} disabled={deleting} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-xs font-bold text-red-700 disabled:opacity-50">
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete
          </button>
        </div>
      </section>
    </div>
  )
}
