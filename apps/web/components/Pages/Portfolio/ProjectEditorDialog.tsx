'use client'

import { FormEvent, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

import { useLHSession } from '@components/Contexts/LHSessionContext'
import MediaPickerDialog from '@components/Objects/Media/MediaPickerDialog'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { type MediaAsset } from '@services/media/library'
import { normalizeMediaUrl } from '@services/media/media'
import { createPortfolioProject, updatePortfolioProject } from '@services/portfolio/portfolio'

import type { Project } from './PortfolioShell'
import { MonthDateRangeField } from './MonthDateRangeField'

export type ProjectDraft = {
  title: string
  start_date?: string | null
  end_date?: string | null
  is_ongoing?: boolean
  story?: string
  images?: MediaAsset[]
  cover_asset_uuid?: string | null
}

const inputClass = 'h-11 w-full rounded-md border border-input bg-background px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-ring'

export function ProjectDefinitionForm({ initialProject, initialDraft, onSubmit, onCancel, submitLabel = 'Add project', cancelLabel = 'Cancel' }: { initialProject?: Project; initialDraft?: ProjectDraft; onSubmit: (draft: ProjectDraft) => Promise<void> | void; onCancel: () => void; submitLabel?: string; cancelLabel?: string }) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  const userId = Number(session?.data?.user?.id || 0)
  const initialImages = initialDraft?.images || (initialProject?.blocks || []).filter((block) => block.block_type === 'image').map((block, index) => ({ id: index, asset_uuid: String(block.data.asset_uuid || ''), url: String(block.data.url || ''), title: String(block.data.caption || ''), owner_type: 'user' as const, source_type: 'upload' as const, media_type: 'image' as const, creation_date: '', update_date: '' } as MediaAsset))
  const initialStory = initialDraft?.story ?? String(initialProject?.blocks.find((block) => block.block_type === 'text')?.data?.text || initialProject?.summary || '')
  const [images, setImages] = useState<MediaAsset[]>(initialImages)
  const [coverUuid, setCoverUuid] = useState(initialDraft?.cover_asset_uuid || initialProject?.cover_asset_uuid || '')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    if (images.length && !coverUuid) return toast.error('Choose a cover image')
    setBusy(true)
    try {
      const isOngoing = data.get('is_ongoing') === 'true'
      await onSubmit({ title: String(data.get('title') || ''), start_date: String(data.get('start_date') || '') || null, end_date: isOngoing ? null : String(data.get('end_date') || '') || null, is_ongoing: isOngoing, story: String(data.get('story') || ''), images, cover_asset_uuid: coverUuid || null })
    } finally { setBusy(false) }
  }

  function addImage(asset: MediaAsset) {
    setImages((current) => current.some((item) => item.asset_uuid === asset.asset_uuid) ? current : [...current, asset])
    setCoverUuid((current) => current || asset.asset_uuid)
    setPickerOpen(false)
  }

  return <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
      <section className="border-b border-border pb-6"><h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">About</h2><label className="mt-4 grid gap-2 text-sm font-semibold">Project name<input autoFocus required name="title" defaultValue={initialDraft?.title || initialProject?.title} placeholder="What did you make, do, or lead?" className={inputClass}/></label></section>
      <section className="border-b border-border py-6"><h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Date</h2><div className="mt-4"><MonthDateRangeField startDate={initialDraft?.start_date || initialProject?.start_date} endDate={initialDraft?.end_date || initialProject?.end_date} isCurrent={initialDraft?.is_ongoing ?? initialProject?.is_ongoing} currentFieldName="is_ongoing" /></div></section>
      <section className="border-b border-border py-6"><h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Description</h2><textarea name="story" defaultValue={initialStory} rows={7} placeholder="What was the goal, what did you contribute, and what happened?" className="mt-4 w-full resize-y rounded-md border border-input bg-background p-3 text-sm leading-6"/></section>
      <section className="pt-6"><div className="flex items-center justify-between gap-4"><div><h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Media</h2><p className="mt-1 text-sm text-muted-foreground">Add images and choose a cover for this project.</p></div><Button type="button" variant="outline" onClick={() => setPickerOpen(true)}><Plus className="mr-2 h-4 w-4"/>Add media</Button></div>{images.length > 0 && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{images.map((image) => <div key={image.asset_uuid} className={`group relative overflow-hidden rounded-xl border-2 ${coverUuid === image.asset_uuid ? 'border-foreground' : 'border-transparent'}`}><button type="button" onClick={() => setCoverUuid(image.asset_uuid)} className="block aspect-square w-full"><img src={normalizeMediaUrl(image.url)} alt="" className="h-full w-full object-cover"/><span className="absolute bottom-2 left-2 rounded-full bg-black/75 px-2 py-1 text-[11px] font-semibold text-white">{coverUuid === image.asset_uuid ? 'Cover' : 'Make cover'}</span></button><button type="button" aria-label="Remove image" onClick={() => { const remaining = images.filter((item) => item.asset_uuid !== image.asset_uuid); setImages(remaining); if (coverUuid === image.asset_uuid) setCoverUuid(remaining[0]?.asset_uuid || '') }} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/75 text-white"><Trash2 className="h-4 w-4"/></button></div>)}</div>}</section>
    </div>
    <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-popover px-6 py-4"><Button type="button" variant="ghost" onClick={onCancel}>{cancelLabel}</Button><Button disabled={busy}>{busy ? 'Saving…' : submitLabel}</Button></div>
    <MediaPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} title="Add project media" description="Upload an image or choose one from your media library." owner={{ type: 'user', id: userId }} mediaType="image" accessToken={token} onSave={addImage}/>
  </form>
}

export function ProjectEditorDialog({ open, onOpenChange, initialProject, initialTitle, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; initialProject?: Project; initialTitle?: string; onSaved?: (project: Project) => void }) {
  const session = useLHSession() as any
  const token = session?.data?.tokens?.access_token
  async function save(draft: ProjectDraft) {
    if (!token) return
    try {
      const body = { title: draft.title, subtitle: '', start_date: draft.start_date, end_date: draft.end_date, is_ongoing: draft.is_ongoing, cover_asset_uuid: draft.cover_asset_uuid, blocks: [{ block_type: 'text', data: { text: draft.story || '' } }, ...(draft.images || []).map((image) => ({ block_type: 'image', data: { asset_uuid: image.asset_uuid, url: image.url, caption: image.title || '' } }))] }
      const saved = initialProject ? await updatePortfolioProject(initialProject.project_uuid, { ...body, revision: initialProject.revision }, token) : await createPortfolioProject({ ...body, idempotency_key: crypto.randomUUID() }, token)
      toast.success(initialProject ? 'Project updated' : 'Project added')
      onOpenChange(false)
      onSaved?.(saved as Project)
    } catch (error: any) { toast.error(error?.message || 'Could not save this project'); throw error }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="flex max-h-[92dvh] max-w-3xl grid-cols-none grid-rows-none flex-col overflow-hidden p-0"><DialogHeader className="shrink-0 border-b border-border px-6 pb-4 pr-12 pt-6"><DialogTitle>{initialProject ? 'Edit project' : 'Add project'}</DialogTitle><DialogDescription>{initialProject ? 'Update this project’s details.' : 'Show what you made, did, learned, or led.'}</DialogDescription></DialogHeader><ProjectDefinitionForm key={`${initialProject?.project_uuid || initialTitle || 'new'}-${open}`} initialProject={initialProject} initialDraft={initialTitle ? { title: initialTitle } : undefined} onSubmit={save} onCancel={() => onOpenChange(false)}/></DialogContent></Dialog>
}
