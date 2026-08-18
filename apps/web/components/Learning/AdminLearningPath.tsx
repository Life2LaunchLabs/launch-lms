'use client'

import React from 'react'
import Link from 'next/link'
import { AlertTriangle, Copy, FileUp, ImageIcon, Loader2, Plus, Trash2 } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUriWithOrg } from '@services/config/config'
import { useOrg } from '@components/Contexts/OrgContext'
import {
  createLearningActivity,
  deleteLearningActivity,
  duplicateLearningActivity,
  importLearningActivity,
  updateLearningActivity,
} from '@services/learning/learning'
import toast from 'react-hot-toast'
import { SafeImage } from '@components/Objects/SafeImage'
import ImageMediaPicker from '@components/Objects/Media/ImageMediaPicker'
import { resolveLearningActivityImage } from '@services/learning/launchReadyImages'
import {
  parseGoogleFormsEditorHtml,
  type GoogleFormsImportPreview,
} from '@components/Learning/import/googleFormsHtml'

function cleanBadgeId(value: string) {
  return String(value || '').replace(/^badge_/, '')
}

function cleanActivityId(value: string) {
  return String(value || '').replace(/^learning_activity_/, '')
}

export default function AdminLearningPath({ orgslug, badgePath }: { orgslug: string; badgePath: any }) {
  const session = useLHSession() as any
  const org = useOrg() as any
  const accessToken = session.data?.tokens?.access_token
  const badge = badgePath.badge
  const canEdit = Number(org?.id) === Number(badge.org_id)
  const isDraft = badge.selected_version?.state === 'draft' && canEdit
  const versionUuid = badge.selected_version?.version_uuid
  const [title, setTitle] = React.useState('')
  const [busy, setBusy] = React.useState('')
  const [uploadingCover, setUploadingCover] = React.useState('')
  const [modalOpen, setModalOpen] = React.useState(false)
  const [importModalOpen, setImportModalOpen] = React.useState(false)
  const [importHtml, setImportHtml] = React.useState('')
  const [importPreview, setImportPreview] = React.useState<GoogleFormsImportPreview | null>(null)
  const [importError, setImportError] = React.useState('')

  const previewImport = (html = importHtml) => {
    try {
      const preview = parseGoogleFormsEditorHtml(html)
      setImportPreview(preview)
      setImportError('')
    } catch (error: any) {
      setImportPreview(null)
      setImportError(error?.message || 'Could not parse this Google Form HTML.')
    }
  }

  const selectImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const html = await file.text()
    setImportHtml(html)
    previewImport(html)
    event.target.value = ''
  }

  const importGoogleForm = async () => {
    if (!importPreview) return
    setBusy('import')
    try {
      const activity = await importLearningActivity({
        badge_uuid: badge.badge_uuid,
        version_uuid: versionUuid,
        title: importPreview.title,
        description: importPreview.description,
        pages: importPreview.pages,
        settings: {
          import: {
            source: 'google_forms_editor_html',
            imported_at: new Date().toISOString(),
            warnings: importPreview.warnings,
          },
        },
      }, accessToken)
      toast.success(`Imported ${importPreview.pages.length} questions`)
      setImportModalOpen(false)
      window.location.href = getUriWithOrg(
        orgslug,
        `/admin/badges/badge/${cleanBadgeId(badge.badge_uuid)}/learning-path/activity/${cleanActivityId(activity.activity_uuid)}/editor`
      )
    } catch (error: any) {
      toast.error(error?.message || 'Failed to import Google Form')
    } finally {
      setBusy('')
    }
  }

  const createActivity = async () => {
    if (!title.trim()) return
    setBusy('create')
    try {
      await createLearningActivity({ badge_uuid: badge.badge_uuid, version_uuid: versionUuid, title: title.trim() }, accessToken)
      toast.success('Activity created')
      setModalOpen(false)
      window.location.reload()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create activity')
    } finally {
      setBusy('')
    }
  }

  const duplicateActivity = async (activity: any) => {
    setBusy(activity.activity_uuid)
    try {
      await duplicateLearningActivity(activity.activity_uuid, accessToken)
      window.location.reload()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to duplicate activity')
    } finally {
      setBusy('')
    }
  }

  const removeActivity = async (activity: any) => {
    if (!confirm(`Delete "${activity.title}"?`)) return
    setBusy(activity.activity_uuid)
    try {
      await deleteLearningActivity(activity.activity_uuid, accessToken)
      window.location.reload()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete activity')
    } finally {
      setBusy('')
    }
  }

  const selectCover = async (activity: any, url: string) => {
    if (!accessToken || !org?.id) {
      toast.error('Please sign in to update a cover image.')
      return
    }

    setUploadingCover(activity.activity_uuid)
    try {
      await updateLearningActivity(
        activity.activity_uuid,
        { thumbnail_image: url },
        accessToken
      )
      toast.success('Cover image updated')
      window.location.reload()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to upload cover image.')
    } finally {
      setUploadingCover('')
    }
  }

  return (
    <div className="px-10 pb-10 pt-6">
      {isDraft ? <div className="mb-5 flex justify-end gap-2">
        <Modal
          isDialogOpen={importModalOpen}
          onOpenChange={(open) => {
            setImportModalOpen(open)
            if (!open) {
              setImportHtml('')
              setImportPreview(null)
              setImportError('')
            }
          }}
          minHeight="no-min"
          minWidth="lg"
          dialogTitle="Import Google Form"
          dialogDescription="Paste the full rendered Google Forms editor HTML or choose a saved HTML file. Each question becomes one activity page."
          dialogContent={
            <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto p-2">
              <textarea
                value={importHtml}
                onChange={(event) => {
                  setImportHtml(event.target.value)
                  setImportPreview(null)
                  setImportError('')
                }}
                placeholder="Paste Google Forms editor HTML here…"
                className="min-h-40 w-full resize-y rounded-lg border border-border px-3 py-2 font-mono text-xs outline-none focus:border-black"
              />
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-2 text-xs font-bold hover:bg-muted">
                  <FileUp size={15} />
                  Choose HTML file
                  <input type="file" accept=".html,.htm,text/html" className="hidden" onChange={selectImportFile} />
                </label>
                <button
                  type="button"
                  onClick={() => previewImport()}
                  disabled={!importHtml.trim()}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-bold hover:bg-muted disabled:opacity-50"
                >
                  Preview import
                </button>
              </div>
              {importError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{importError}</div>
              ) : null}
              {importPreview ? (
                <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
                  <div>
                    <label className="text-xs font-bold text-muted-foreground">Activity title</label>
                    <input
                      value={importPreview.title}
                      onChange={(event) => setImportPreview({ ...importPreview, title: event.target.value })}
                      className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {importPreview.pages.length} questions · {importPreview.sectionCount} sections · {importPreview.totalPoints} points
                  </p>
                  {importPreview.warnings.length ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                      <div className="flex items-center gap-2 text-xs font-bold">
                        <AlertTriangle size={15} />
                        {importPreview.warnings.length} item{importPreview.warnings.length === 1 ? '' : 's'} need review
                      </div>
                      <ul className="mt-2 max-h-32 list-disc space-y-1 overflow-y-auto pl-5 text-xs">
                        {importPreview.warnings.map((warning, index) => <li key={`${warning.code}-${warning.itemId || index}`}>{warning.message}</li>)}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-xs font-semibold text-emerald-700">No repairs detected.</p>
                  )}
                  <p className="text-xs text-muted-foreground">Section routing is not imported yet. Questions use a simple linear flow.</p>
                  <button
                    type="button"
                    onClick={importGoogleForm}
                    disabled={busy === 'import' || !importPreview.title.trim()}
                    className="ml-auto flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {busy === 'import' ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
                    Import activity
                  </button>
                </div>
              ) : null}
            </div>
          }
          dialogTrigger={
            <button className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-5 py-2 text-xs font-bold transition hover:bg-muted">
              <FileUp className="h-4 w-4" />
              Import Google Form
            </button>
          }
        />
        <Modal
          isDialogOpen={modalOpen}
          onOpenChange={setModalOpen}
          minHeight="no-min"
          minWidth="md"
          dialogTitle="New Activity"
          dialogDescription="Add an activity module to this badge learning path."
          dialogContent={
            <div className="flex flex-col gap-4 p-2">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Activity title"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm"
              />
              <button
                onClick={createActivity}
                disabled={busy === 'create' || !title.trim()}
                className="ml-auto inline-flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {busy === 'create' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Create Activity
              </button>
            </div>
          }
          dialogTrigger={
            <button className="inline-flex items-center gap-2 rounded-lg bg-black px-5 py-2 text-xs font-bold text-white nice-shadow transition-transform hover:scale-105">
              <Plus className="h-4 w-4" />
              New Activity
            </button>
          }
        />
      </div> : <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">{canEdit ? 'This published learning path is read only. Create a draft from the version toolbar to make changes.' : 'This learning path is read only for authorized issuers.'}</div>}

      <div className="space-y-3">
        {(badgePath.activities || []).map((activity: any, index: number) => {
          const locked = activity.settings?.system_required === true
          return (
          <div key={activity.activity_uuid} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-xs">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-lime-100 text-sm font-black text-lime-700">{index + 1}</div>
            <div className="hidden h-14 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted text-muted-foreground sm:flex sm:items-center sm:justify-center">
              {activity.thumbnail_image ? (
                <SafeImage src={resolveLearningActivityImage(activity.thumbnail_image)} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImageIcon size={20} />
              )}
            </div>
            <Link
              href={`${getUriWithOrg(orgslug, `/admin/badges/badge/${cleanBadgeId(badge.badge_uuid)}/learning-path/activity/${cleanActivityId(activity.activity_uuid)}/editor`)}?version=${versionUuid || ''}`}
              className="min-w-0 flex-1"
            >
              <h2 className="truncate text-base font-bold text-foreground">{activity.title}</h2>
              <p className="text-sm text-muted-foreground">{activity.pages?.length || 0} pages</p>
            </Link>
            <ImageMediaPicker
              owner={{ type: 'org', id: Number(org?.id) }}
              onSelect={(url) => selectCover(activity, url)}
              buttonText="Cover"
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-bold transition hover:bg-muted"
              disabled={!isDraft || uploadingCover === activity.activity_uuid}
            />
            {locked ? <span className="rounded-full border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground">Required</span> : isDraft ? <><button onClick={() => duplicateActivity(activity)} className="rounded-lg border border-border p-2"><Copy size={16} /></button><button onClick={() => removeActivity(activity)} className="rounded-lg border border-red-200 p-2 text-red-600"><Trash2 size={16} /></button></> : <span className="rounded-full border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground">Read only</span>}
          </div>
          )
        })}
        {(badgePath.activities || []).length === 0 ? (
          <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-16 text-center">
            <div>
              <p className="text-sm font-semibold text-muted-foreground">No activities yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Create the first activity in this badge learning path.</p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
