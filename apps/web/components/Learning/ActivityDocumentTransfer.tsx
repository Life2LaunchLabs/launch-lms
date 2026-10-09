'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { Download, FileJson, Loader2 } from 'lucide-react'
import {
  ACTIVITY_DOCUMENT_FORMAT,
  createActivityFromDocument,
  getActivityDocument,
} from '@services/learning/activityDocuments'

function fileName(title: string) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'activity'
  return `${slug}.activity.json`
}

function problemsText(error: any) {
  const errors = Array.isArray(error?.detail?.errors) ? error.detail.errors : []
  if (!errors.length) return error?.message || 'Import failed'
  const listed = errors.slice(0, 3).map((item: any) => `${item.path}: ${item.message}`).join('\n')
  return `${error.message}\n${listed}${errors.length > 3 ? `\n…and ${errors.length - 3} more` : ''}`
}

// Download one activity as an Activity Document (the same JSON format the
// Claude connector reads and writes).
export function ExportActivityJsonButton({ activityUuid, accessToken }: { activityUuid: string; accessToken?: string }) {
  const [busy, setBusy] = React.useState(false)
  const download = async () => {
    setBusy(true)
    try {
      const { document } = await getActivityDocument(activityUuid, accessToken)
      const blob = new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      link.href = url
      link.download = fileName(document.activity.title)
      link.click()
      URL.revokeObjectURL(url)
    } catch (error: any) {
      toast.error(error?.message || 'Could not export this activity')
    } finally {
      setBusy(false)
    }
  }
  return (
    <button type="button" onClick={download} disabled={busy} title="Export activity as JSON" aria-label="Export activity as JSON" className="rounded-lg border border-border p-2 transition hover:bg-muted disabled:opacity-50">
      {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
    </button>
  )
}

// Add an activity to the draft from an exported (or Claude-written) document.
export function ImportActivityJsonButton({ badgeUuid, versionUuid, accessToken, onImported }: { badgeUuid: string; versionUuid?: string; accessToken?: string; onImported: () => void }) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  const importFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const document = JSON.parse(await file.text())
      if (document?.format !== ACTIVITY_DOCUMENT_FORMAT) throw new Error('This file is not a Launch LMS activity export.')
      const created = await createActivityFromDocument(badgeUuid, versionUuid, { ...document, activity: { ...document.activity, activity_uuid: null } }, accessToken)
      toast.success(`Imported “${created.document.activity.title}”`)
      onImported()
    } catch (error: any) {
      toast.error(problemsText(error), { duration: 8000 })
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <input ref={inputRef} type="file" accept=".json,application/json" className="hidden" onChange={importFile} />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-5 py-2 text-xs font-bold transition hover:bg-muted disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileJson className="h-4 w-4" />}
        Import JSON
      </button>
    </>
  )
}
