'use client'

import React from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { History, Loader2, RotateCcw, Upload } from 'lucide-react'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { programsApi } from '@services/programs/programs'
import { Button } from '@components/ui/button'
import { Textarea } from '@components/ui/textarea'
import { cn } from '@/lib/utils'

type TemplateVersion = {
  version_uuid: string
  number: number
  note: string
  published_at: string | null
  restored_from_number: number | null
  is_published: boolean
  objective_count: number
  activity_count: number
  assignment_count: number
}

type VersionStatus = {
  versioned: boolean
  published_version: TemplateVersion | null
  has_unpublished_changes: boolean
  versions: TemplateVersion[]
}

const publishedOn = (value: string | null) => (value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '')

/** The template's published version, whether its draft has unpublished changes, publishing, and rolling back. */
export default function TemplateVersionBar({ orgId, token, program, refresh }: { orgId: number; token?: string; program: any; refresh: () => Promise<any> }) {
  const key = orgId && token ? ['template-versions', orgId, program.program_uuid, program.version, program.update_date] : null
  const { data, mutate: reload } = useSWR<VersionStatus>(key, () => programsApi.versions(orgId, program.program_uuid, token))
  const [publishOpen, setPublishOpen] = React.useState(false)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState<string | null>(null)

  if (!data || !data.versioned) return null
  const live = data.published_version
  const nextNumber = (data.versions[0]?.number || 0) + 1

  const publish = async () => {
    setBusy('publish')
    try {
      await programsApi.publishVersion(orgId, program.program_uuid, note.trim(), token)
      await Promise.all([reload(), refresh()])
      setPublishOpen(false)
      setNote('')
      toast.success(`Version ${nextNumber} published. New plans use it; plans already handed out keep theirs.`)
    } catch (error: any) {
      toast.error(error?.message || 'Could not publish the template.')
    } finally {
      setBusy(null)
    }
  }

  const restore = async (version: TemplateVersion) => {
    setBusy(version.version_uuid)
    try {
      await programsApi.restoreVersion(orgId, program.program_uuid, version.number, token)
      await Promise.all([reload(), refresh()])
      toast.success(`Version ${version.number} is live again as version ${nextNumber}. Plans already handed out are unchanged.`)
    } catch (error: any) {
      toast.error(error?.message || 'Could not roll back the template.')
    } finally {
      setBusy(null)
    }
  }

  return <div className="flex flex-wrap items-center gap-2">
    <span className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-3 text-xs font-bold">
      <span className={cn('h-2 w-2 rounded-full', data.has_unpublished_changes ? 'bg-amber-500' : 'bg-emerald-500')} aria-hidden />
      {live ? `Version ${live.number} live` : 'Not published yet'}
      {data.has_unpublished_changes ? <span className="font-medium text-amber-700">· unpublished changes</span> : null}
    </span>
    {data.versions.length ? <Modal isDialogOpen={historyOpen} onOpenChange={setHistoryOpen} minHeight="no-min" minWidth="md" dialogTitle="Version history" dialogDescription="Each plan keeps the version it was handed out with. Making an earlier version live again only changes what new plans get." dialogTrigger={<button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-bold hover:bg-muted"><History size={14} />History</button>} dialogContent={<ol className="max-h-96 space-y-2 overflow-y-auto p-1">{data.versions.map((version) => <li key={version.version_uuid} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
      <div className="min-w-0">
        <p className="text-sm font-black">Version {version.number}{version.is_published ? <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-800">Live</span> : null}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{[publishedOn(version.published_at), `${version.objective_count} steps`, version.activity_count ? `${version.activity_count} activities` : null, `${version.assignment_count} handed out`].filter(Boolean).join(' · ')}</p>
        {version.note ? <p className="mt-1 text-xs leading-5">{version.note}</p> : null}
      </div>
      {version.is_published ? null : <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void restore(version)}>{busy === version.version_uuid ? <Loader2 className="animate-spin" /> : <RotateCcw />}Make live again</Button>}
    </li>)}</ol>} /> : null}
    <Modal isDialogOpen={publishOpen} onOpenChange={setPublishOpen} minHeight="no-min" minWidth="md" dialogTitle={`Publish version ${nextNumber}`} dialogDescription="New plans and badge starts will use this version. Plans already handed out keep the version they started with, along with their learners' answers." dialogTrigger={<Button variant="brand" size="sm" className="h-9 rounded-full" disabled={!data.has_unpublished_changes}><Upload />Publish</Button>} dialogContent={<div className="space-y-4 p-2">
      <Textarea autoFocus value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="What changed? (optional, shown in the version history)" aria-label="Version note" />
      <Button className="ml-auto flex" onClick={() => void publish()} disabled={busy !== null}>{busy === 'publish' ? <Loader2 className="animate-spin" /> : <Upload />}Publish version {nextNumber}</Button>
    </div>} />
  </div>
}
