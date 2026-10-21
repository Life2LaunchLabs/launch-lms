'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { FileText, Link2, Loader2, Plus, Upload, X } from 'lucide-react'
import { Button } from '@components/ui/button'
import { Input } from '@components/ui/input'
import { uploadMediaAsset, type MediaType } from '@services/media/library'
import type { StepMaterial } from '@services/goals/types'

const FILES = 'application/pdf,image/*,video/*'
const mediaType = (file: File): MediaType | null => file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type === 'application/pdf' ? 'document' : null
const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } }

/** A step's files and links, as a list you rename or remove, a link box and an upload button. Files go to the org's media. */
export default function MaterialsEditor({ id, value, onChange, orgId, token, addLabel = 'Add' }: {
  id: string
  value: StepMaterial[]
  onChange: (value: StepMaterial[]) => void // eslint-disable-line no-unused-vars
  orgId?: number | null
  token?: string
  addLabel?: string
}) {
  const [link, setLink] = React.useState('')
  const [uploading, setUploading] = React.useState(false)
  const picker = React.useRef<HTMLInputElement>(null)
  const url = link.trim()
  const valid = /^https?:\/\/\S+\.\S+$/i.test(url)
  const addLink = () => {
    if (!valid) return
    onChange([...value, { kind: 'link', title: hostOf(url), url }])
    setLink('')
  }
  const addFiles = async (files: File[]) => {
    if (!orgId || !token) return
    setUploading(true)
    const added: StepMaterial[] = []
    for (const file of files) {
      const type = mediaType(file)
      if (!type) { toast.error(`${file.name} isn’t a PDF, photo or video`); continue }
      try {
        const asset = await uploadMediaAsset({ type: 'org', id: orgId }, type, file, token, file.name)
        added.push({ kind: 'file', title: asset.title || file.name, url: asset.url, asset_uuid: asset.asset_uuid, media_type: type })
      } catch (error: any) { toast.error(error?.message || `Couldn’t upload ${file.name}`) }
    }
    if (added.length) onChange([...value, ...added])
    setUploading(false)
  }
  const rename = (index: number, title: string) => onChange(value.map((item, at) => at === index ? { ...item, title } : item))
  return <div className="flex flex-col gap-2">
    {value.length ? <ul className="flex flex-col gap-1.5">
      {value.map((item, index) => {
        const Icon = item.kind === 'file' ? FileText : Link2
        return <li key={`${item.url}-${index}`} className="flex items-center gap-2 rounded-lg border bg-background px-2 py-1.5">
          <Icon size={15} aria-hidden="true" className="shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <Input aria-label="Title" value={item.title || ''} onChange={(event) => rename(index, event.target.value)} placeholder={item.url} className="h-7 border-0 px-1 font-semibold shadow-none focus-visible:ring-1" />
            {item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="block truncate px-1 text-[11px] text-muted-foreground hover:underline">{item.kind === 'file' ? 'Open file' : item.url}</a> : null}
          </div>
          <button type="button" onClick={() => onChange(value.filter((_, at) => at !== index))} aria-label={`Remove ${item.title || item.url}`} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X size={14} /></button>
        </li>
      })}
    </ul> : null}
    <div className="flex flex-wrap gap-2">
      <Input id={id} value={link} onChange={(event) => setLink(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addLink() } }}
        placeholder="Paste a link" className="h-8 min-w-[12rem] flex-1 text-sm" />
      <Button type="button" size="sm" variant="outline" disabled={!valid} onClick={addLink}><Plus size={14} />{addLabel}</Button>
      {orgId && token ? <>
        <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => picker.current?.click()}>{uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}Upload</Button>
        <input ref={picker} type="file" multiple accept={FILES} hidden onChange={(event) => { const files = Array.from(event.target.files || []); event.target.value = ''; if (files.length) void addFiles(files) }} />
      </> : null}
    </div>
  </div>
}
