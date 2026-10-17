'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { BookOpen, FileText, Link2, NotebookPen, Search, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { Input } from '@components/ui/input'
import { Textarea } from '@components/ui/textarea'
import { uploadMediaAsset, type MediaType } from '@services/media/library'
import { getResourceUrlPreview, getResources, type Resource } from '@services/resources/resources'
import type { StepActions } from './registry'

/** What a board accepts as files: photos, videos and PDFs. */
export const BOARD_FILES = 'image/*,video/*,application/pdf'
const mediaType = (file: File): MediaType | null => file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type === 'application/pdf' ? 'document' : null
const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } }
const linkIn = (text: string) => text.trim().split(/\s+/).find((word) => /^https?:\/\/\S+$/i.test(word)) || ''

/** Adding to a board from anywhere: a pasted or dropped link (titled from the page), or files. */
export function useBoardIngest(actions: StepActions, token?: string, viewerUserId?: number) {
  const [adding, setAdding] = React.useState(0)
  const track = async (work: () => Promise<unknown>) => { setAdding((count) => count + 1); try { await work() } finally { setAdding((count) => count - 1) } }
  const addLink = (url: string, title = '') => track(async () => {
    const preview = title ? null : await getResourceUrlPreview(url, token).catch(() => null)
    const image = preview?.og_image || ''
    await actions.addEntry({ kind: 'link', url, title: title || preview?.title?.trim() || hostOf(url), data: image ? { image } : {} })
  })
  const addFiles = (files: File[]) => track(async () => {
    if (!viewerUserId || !token) return
    for (const file of files) {
      const type = mediaType(file)
      if (!type) { toast.error(`${file.name} isn’t a photo, video or PDF`); continue }
      try {
        const asset = await uploadMediaAsset({ type: 'user', id: viewerUserId }, type, file, token, file.name)
        await actions.addEntry({ kind: 'file', asset_uuid: asset.asset_uuid, url: asset.url, title: asset.title || file.name, data: { image: type === 'image' ? asset.url : asset.thumbnail_url || '', media_type: type } })
      } catch (error: any) { toast.error(error?.message || `Couldn’t add ${file.name}`) }
    }
  })
  /** Links and files from a drop or a paste; true when there was something to add. */
  const take = (data: DataTransfer | null) => {
    if (!data) return false
    const files = Array.from(data.files || [])
    if (files.length) { void addFiles(files); return true }
    const url = linkIn(data.getData('text/uri-list') || data.getData('text/plain'))
    if (url) { void addLink(url); return true }
    return false
  }
  return { adding: adding > 0, addLink, addFiles, take }
}

type Kind = 'link' | 'file' | 'resource' | 'note'
const KINDS: Array<{ kind: Kind; label: string; icon: React.ElementType }> = [
  { kind: 'link', label: 'Link', icon: Link2 }, { kind: 'file', label: 'Files', icon: FileText }, { kind: 'resource', label: 'From the library', icon: BookOpen }, { kind: 'note', label: 'Note', icon: NotebookPen },
]

type AddProps = { open: boolean; onOpenChange: (open: boolean) => void; actions: StepActions; ingest: ReturnType<typeof useBoardIngest>; orgId: number | null; token?: string } // eslint-disable-line no-unused-vars

/** The board's + : a link, files, a library resource or a note. */
export function AddToBoard({ open, onOpenChange, actions, ingest, orgId, token }: AddProps) {
  const [kind, setKind] = React.useState<Kind>('link')
  const [url, setUrl] = React.useState('')
  const [note, setNote] = React.useState('')
  const files = React.useRef<HTMLInputElement>(null)
  const done = () => { setUrl(''); setNote(''); onOpenChange(false) }
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader><DialogTitle>Add to the board</DialogTitle><DialogDescription>You can also drop or paste links and files straight onto the board.</DialogDescription></DialogHeader>
      <div role="tablist" aria-label="What to add" className="flex flex-wrap gap-1.5">
        {KINDS.filter((item) => item.kind !== 'resource' || orgId).map(({ kind: item, label, icon: Icon }) => <button key={item} type="button" role="tab" aria-selected={kind === item} onClick={() => setKind(item)}
          className={cn('flex items-center gap-1 rounded-full border-[1.5px] px-2.5 py-1 text-xs font-bold', kind === item ? 'border-[var(--plan-face)] bg-[color-mix(in_srgb,var(--plan-face)_15%,hsl(var(--card)))]' : 'text-muted-foreground')}><Icon size={13} aria-hidden="true" />{label}</button>)}
      </div>
      {kind === 'link' ? <form className="flex gap-2" onSubmit={async (event) => { event.preventDefault(); const link = linkIn(url) || (url.trim() && `https://${url.trim()}`); if (link) { done(); await ingest.addLink(link) } }}>
        <Input autoFocus value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Paste a link" aria-label="Link" />
        <Button type="submit" variant="plan" disabled={!url.trim()}>Add</Button>
      </form> : null}
      {kind === 'file' ? <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center"
        onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (ingest.take(event.dataTransfer)) done() }}>
        <Upload size={20} aria-hidden="true" className="text-[var(--plan-accent)]" />
        <p className="text-sm font-semibold">Photos, videos or PDFs</p>
        <input ref={files} type="file" multiple accept={BOARD_FILES} hidden onChange={(event) => { const picked = Array.from(event.target.files || []); event.target.value = ''; if (picked.length) { done(); void ingest.addFiles(picked) } }} />
        <Button type="button" variant="surface" onClick={() => files.current?.click()}>Choose files</Button>
      </div> : null}
      {kind === 'resource' && orgId ? <ResourceSearch orgId={orgId} token={token} onPick={async (resource) => { done(); await actions.addEntry({ kind: 'resource', resource_uuid: resource.resource_uuid }) }} /> : null}
      {kind === 'note' ? <form className="flex flex-col gap-2" onSubmit={async (event) => { event.preventDefault(); const text = note.trim(); if (text) { done(); await actions.addEntry({ kind: 'note', title: text.split('\n')[0].slice(0, 120), note: text }) } }}>
        <Textarea autoFocus rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Something you heard, read or noticed" aria-label="Note" />
        <Button type="submit" variant="plan" className="self-start" disabled={!note.trim()}>Add note</Button>
      </form> : null}
    </DialogContent>
  </Dialog>
}

// eslint-disable-next-line no-unused-vars
export function ResourceSearch({ orgId, token, onPick }: { orgId: number; token?: string; onPick: (resource: Resource) => void }) {
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<Resource[]>([])
  React.useEffect(() => {
    const text = query.trim()
    if (text.length < 2) return setResults([])
    const timer = setTimeout(() => { getResources(orgId, { query: text, limit: 6 }, token).then(setResults).catch(() => setResults([])) }, 250)
    return () => clearTimeout(timer)
  }, [query, orgId, token])
  return <div className="flex flex-col gap-1.5">
    <div className="relative"><Search size={15} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <Input autoFocus className="pl-8" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the library" aria-label="Search the library" /></div>
    {results.map((resource) => <button key={resource.resource_uuid} type="button" onClick={() => onPick(resource)} className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-left text-sm font-semibold hover:border-[var(--plan-face)]">
      <BookOpen size={15} aria-hidden="true" className="shrink-0 text-[var(--plan-accent)]" /><span className="truncate">{resource.title}</span>
    </button>)}
  </div>
}
