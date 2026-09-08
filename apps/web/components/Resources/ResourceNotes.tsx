'use client'

import { Clipboard, ExternalLink, FileText, Image as ImageIcon, Link2, Loader2, LockKeyhole, Paperclip, Pencil, Plus, Trash2 } from 'lucide-react'
import { ClipboardEvent, DragEvent, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import useSWR from 'swr'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import MediaPickerDialog from '@components/Objects/Media/MediaPickerDialog'
import { Button } from '@components/ui/button'
import { Card } from '@components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu'
import { Input } from '@components/ui/input'
import { Textarea } from '@components/ui/textarea'
import { MediaAsset, MediaType } from '@services/media/library'
import { getResourceNoteMediaDirectory, normalizeMediaUrl } from '@services/media/media'
import {
  createResourceNote,
  deleteResourceNote,
  getResourceNotes,
  ResourceNoteBlock,
  updateResourceNote,
  uploadResourceNote,
} from '@services/resources/resources'

const WEB_URL = /^https?:\/\/\S+$/i

function requireSuccess(result: any) {
  if (!result?.success) throw new Error(result?.data?.detail || 'Request failed')
}

export default function ResourceNotes({ resourceUuid, compact = false, onNotesChange }: { resourceUuid: string; compact?: boolean; onNotesChange?: () => void }) {
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const userUuid = session?.data?.user?.user_uuid
  const userId = session?.data?.user?.id
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState('')
  const [linkDraft, setLinkDraft] = useState('')
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editing, setEditing] = useState<ResourceNoteBlock | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [compactTextOverride, setCompactTextOverride] = useState<string | null>(null)
  const [pickerType, setPickerType] = useState<Extract<MediaType, 'image' | 'document'> | null>(null)

  const swrKey = useMemo(
    () => resourceUuid && accessToken ? ['resource-notes', resourceUuid, accessToken] : null,
    [resourceUuid, accessToken]
  )
  const { data: notes = [], mutate } = useSWR(swrKey, () => getResourceNotes(resourceUuid, accessToken))

  const addText = async () => {
    if (!accessToken || !draft.trim()) return
    setIsSaving(true)
    try {
      const created = await createResourceNote(resourceUuid, { block_type: 'text', content: draft.trim() }, accessToken)
      setDraft('')
      mutate([...notes, created], false)
      onNotesChange?.()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to add note')
    } finally {
      setIsSaving(false)
    }
  }

  const addLink = async (rawUrl: string) => {
    const url = rawUrl.trim()
    if (!accessToken || !WEB_URL.test(url)) {
      toast.error('Paste a complete http or https link')
      return
    }
    setIsSaving(true)
    try {
      const created = await createResourceNote(resourceUuid, { block_type: 'link', url }, accessToken)
      setLinkDraft('')
      setShowLinkInput(false)
      mutate([...notes, created], false)
      onNotesChange?.()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to add link')
    } finally {
      setIsSaving(false)
    }
  }

  const addFiles = async (files: File[]) => {
    if (!accessToken || files.length === 0) return
    setIsSaving(true)
    try {
      const created = []
      for (const file of files) {
        created.push(await uploadResourceNote(resourceUuid, file, accessToken))
      }
      mutate([...notes, ...created], false)
      onNotesChange?.()
      toast.success(created.length === 1 ? 'Media added to Notes' : `${created.length} items added to Notes`)
    } catch (error: any) {
      toast.error(error?.message || 'Failed to upload media')
      mutate()
    } finally {
      setIsSaving(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files)
    if (files.length > 0) {
      event.preventDefault()
      void addFiles(files)
      return
    }
    const pasted = event.clipboardData.getData('text').trim()
    if (!draft.trim() && WEB_URL.test(pasted)) {
      event.preventDefault()
      void addLink(pasted)
    }
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    void addFiles(Array.from(event.dataTransfer.files))
  }

  const startEdit = (note: ResourceNoteBlock) => {
    setEditing(note)
    setEditContent(note.content || '')
    setEditUrl(note.url || '')
    setEditTitle(note.title || '')
    setEditDescription(note.description || '')
  }

  const saveEdit = async () => {
    if (!editing || !accessToken) return
    setIsSaving(true)
    try {
      const updated = await updateResourceNote(
        editing.note_uuid,
        editing.block_type === 'text'
          ? { content: editContent.trim() }
          : { url: editUrl.trim(), title: editTitle.trim(), description: editDescription.trim() },
        accessToken
      )
      mutate(notes.map((note) => note.note_uuid === editing.note_uuid ? updated : note), false)
      setEditing(null)
      onNotesChange?.()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update note')
    } finally {
      setIsSaving(false)
    }
  }

  const removeNote = async (noteUuid: string) => {
    if (!accessToken) return
    try {
      requireSuccess(await deleteResourceNote(noteUuid, accessToken))
      mutate(notes.filter((note) => note.note_uuid !== noteUuid), false)
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete note')
    }
  }

  const mediaUrl = (note: ResourceNoteBlock) => (
    note.url
      ? normalizeMediaUrl(note.url)
      : note.filename && userUuid
      ? getResourceNoteMediaDirectory(userUuid, resourceUuid, note.filename, note.storage_directory || 'notes')
      : ''
  )

  const attachMediaAsset = async (asset: MediaAsset) => {
    if (!accessToken) return
    const created = await createResourceNote(resourceUuid, {
      block_type: asset.media_type === 'image' ? 'image' : 'file',
      media_asset_uuid: asset.asset_uuid,
      title: asset.title,
      preview_image_url: asset.thumbnail_url || undefined,
    }, accessToken)
    mutate([...notes, created], false)
    onNotesChange?.()
  }

  const textNotes = notes.filter((note) => note.block_type === 'text')
  const attachmentNotes = notes.filter((note) => note.block_type !== 'text')
  const compactText = compactTextOverride ?? textNotes.map((note) => note.content || '').filter(Boolean).join('\n\n')

  const saveCompactText = async () => {
    if (!accessToken || isSaving) return
    setIsSaving(true)
    try {
      const content = compactText.trim()
      let savedMeaningfulChange = false
      let updatedNotes = notes.filter((note) => note.block_type !== 'text')
      if (textNotes.length > 0) {
        if (content) {
          const updated = await updateResourceNote(textNotes[0].note_uuid, { content }, accessToken)
          updatedNotes = [updated, ...updatedNotes]
          savedMeaningfulChange = true
        } else {
          await deleteResourceNote(textNotes[0].note_uuid, accessToken)
        }
        for (const extraNote of textNotes.slice(1)) {
          await deleteResourceNote(extraNote.note_uuid, accessToken)
        }
      } else if (content) {
        const created = await createResourceNote(resourceUuid, { block_type: 'text', content }, accessToken)
        updatedNotes = [created, ...updatedNotes]
        savedMeaningfulChange = true
      }
      mutate(updatedNotes, false)
      setCompactTextOverride(null)
      if (savedMeaningfulChange) onNotesChange?.()
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save note')
    } finally {
      setIsSaving(false)
    }
  }

  if (!accessToken) {
    return (
      <Card size={compact ? 'none' : 'sm'} className={compact ? 'rounded-xl p-3' : ''}>
        <h2 className={compact ? 'text-sm font-semibold text-foreground' : 'text-base font-semibold text-foreground'}>Notes</h2>
        <p className={compact ? 'mt-1 text-xs text-muted-foreground' : 'mt-2 text-sm text-muted-foreground'}>Sign in to keep private notes and media with this resource.</p>
      </Card>
    )
  }

  if (compact) {
    return (
      <Card
        size="none"
        className={`${isDragging ? 'bg-muted/40' : ''} rounded-none border-0 p-4 shadow-none sm:p-5`}
        onDragEnter={(event) => { event.preventDefault(); setIsDragging(true) }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDragging(false)
        }}
        onDrop={handleDrop}
      >
        <Textarea
          value={compactText}
          onChange={(event) => setCompactTextOverride(event.target.value)}
          onBlur={() => {
            if (compactTextOverride !== null) void saveCompactText()
          }}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files)
            if (files.length > 0) {
              event.preventDefault()
              void addFiles(files)
              return
            }
            const pasted = event.clipboardData.getData('text').trim()
            if (WEB_URL.test(pasted)) {
              event.preventDefault()
              void addLink(pasted)
            }
          }}
          rows={4}
          placeholder="Add a note about what you learned…"
          className="min-h-28 resize-none rounded-xl border-0 bg-muted/45 px-4 py-3 text-sm leading-6 shadow-none focus-visible:bg-muted/60 focus-visible:ring-1"
        />

        <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
          <LockKeyhole className="h-3.5 w-3.5" />
          <span>{isSaving ? 'Saving…' : 'Only you can see your notes'}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto h-7 gap-1.5 px-2 text-[11px]"
                disabled={isSaving || !userId}
              >
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                Add media
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setPickerType('image')}><ImageIcon className="mr-2 h-4 w-4" /> Image</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setPickerType('document')}><FileText className="mr-2 h-4 w-4" /> PDF</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="sr-only" aria-live="polite">{isDragging ? 'Drop to attach' : ''}</span>
        </div>

        {attachmentNotes.length > 0 && (
          <div className="-mx-1 mt-3 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1" aria-label="Note attachments">
            {attachmentNotes.map((note) => {
              const href = note.block_type === 'link' ? note.url || '#' : mediaUrl(note)
              const preview = note.block_type === 'image' ? mediaUrl(note) : note.preview_image_url
              return (
                <div key={note.note_uuid} className="group relative w-24 shrink-0 snap-start overflow-hidden rounded-lg border border-border/60 bg-muted/35">
                  <a href={href} target="_blank" rel="noreferrer" className="block">
                    {preview ? (
                      <div className="h-12 bg-muted bg-cover bg-center" style={{ backgroundImage: `url("${preview.replace(/"/g, '%22')}")` }} />
                    ) : (
                      <div className="flex h-12 items-center justify-center bg-muted"><FileText className="h-4 w-4 text-muted-foreground" /></div>
                    )}
                    <p className="truncate px-1.5 py-1 text-[9px] text-muted-foreground">{note.title || note.original_filename || note.url}</p>
                  </a>
                  <button type="button" onClick={() => void removeNote(note.note_uuid)} className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-background/85 text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100" aria-label="Remove attachment">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
        {pickerType && userId && (
          <MediaPickerDialog
            open
            onOpenChange={(open) => { if (!open) setPickerType(null) }}
            title={`Add ${pickerType === 'image' ? 'an image' : 'a PDF'} to Notes`}
            description="Upload something new or choose it from your media library."
            owner={{ type: 'user', id: Number(userId) }}
            mediaType={pickerType}
            initialTab="library"
            accessToken={accessToken}
            onSave={attachMediaAsset}
          />
        )}
      </Card>
    )
  }

  return (
    <Card
      size={compact ? 'none' : 'sm'}
      className={`${compact ? 'rounded-xl border-border/60 p-3 shadow-none' : ''} ${isDragging ? 'border-[var(--org-primary-color)] bg-muted' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault()
        setIsDragging(true)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDragging(false)
      }}
      onDrop={handleDrop}
    >
      <div className={`flex items-start justify-between ${compact ? 'gap-2' : 'gap-4'}`}>
        <div>
          <h2 className={compact ? 'text-sm font-semibold text-foreground' : 'text-base font-semibold text-foreground'}>Notes</h2>
          <p className={compact ? 'mt-0.5 text-[11px] leading-4 text-muted-foreground' : 'mt-1 text-sm text-muted-foreground'}>Private to you. Paste or drop text, links, images, or PDFs.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={compact ? 'h-7 w-7 shrink-0' : ''}
          aria-label="Add media to Notes"
          title="Add media"
          onClick={() => fileInputRef.current?.click()}
          disabled={isSaving}
        >
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className={compact ? 'h-3.5 w-3.5' : ''} />}
        </Button>
        <input
          ref={fileInputRef}
          className="hidden"
          type="file"
          accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt"
          multiple
          onChange={(event) => void addFiles(Array.from(event.target.files || []))}
        />
      </div>

      {isDragging && (
        <div className={`${compact ? 'mt-2 rounded-lg p-3 text-xs' : 'mt-4 rounded-2xl p-8 text-sm'} flex items-center justify-center gap-2 border-2 border-dashed border-[var(--org-primary-color)] font-medium`}>
          <Clipboard /> Drop media into Notes
        </div>
      )}

      <div className={`${compact ? 'mt-2 max-h-28 space-y-1.5 overflow-y-auto pr-1' : 'mt-5 space-y-3'}`}>
        {notes.map((note) => (
          <div key={note.note_uuid} className={`group border border-border bg-background ${compact ? 'rounded-lg p-2.5' : 'rounded-2xl p-4'}`}>
            {editing?.note_uuid === note.note_uuid ? (
              <div className="space-y-3">
                {note.block_type === 'text' ? (
                  <Textarea value={editContent} onChange={(event) => setEditContent(event.target.value)} rows={4} />
                ) : (
                  <>
                    <Input value={editUrl} onChange={(event) => setEditUrl(event.target.value)} aria-label="Link URL" />
                    <Input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} placeholder="Card title" />
                    <Textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} placeholder="Card description" />
                  </>
                )}
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveEdit} disabled={isSaving}>Save</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <>
                {note.block_type === 'text' && (
                  <p className={`whitespace-pre-wrap text-foreground ${compact ? 'text-xs leading-5' : 'text-sm leading-relaxed'}`}>{note.content}</p>
                )}
                {note.block_type === 'link' && (
                  <a href={note.url || '#'} target="_blank" rel="noreferrer" className="flex gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {note.preview_image_url ? (
                      <div
                        className={`${compact ? 'h-12 w-14 rounded-md' : 'h-20 w-24 rounded-xl'} shrink-0 bg-muted bg-cover bg-center`}
                        style={{ backgroundImage: `url("${note.preview_image_url.replace(/"/g, '%22')}")` }}
                        role="img"
                        aria-label=""
                      />
                    ) : (
                      <div className={`flex shrink-0 items-center justify-center bg-muted ${compact ? 'h-12 w-14 rounded-md' : 'h-20 w-24 rounded-xl'}`}><Link2 className={compact ? 'h-4 w-4' : ''} /></div>
                    )}
                    <div className="min-w-0 py-1">
                      <div className={`${compact ? 'line-clamp-1 text-xs' : 'line-clamp-2 text-sm'} font-semibold text-foreground`}>{note.title || note.url}</div>
                      {note.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{note.description}</p>}
                      <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground"><ExternalLink size={12} /> Open link</span>
                    </div>
                  </a>
                )}
                {note.block_type === 'image' && (
                  <a href={mediaUrl(note)} target="_blank" rel="noreferrer" className="block">
                    <div
                      className={`aspect-video bg-muted bg-contain bg-center bg-no-repeat ${compact ? 'max-h-24 rounded-md' : 'max-h-72 rounded-xl'}`}
                      style={{ backgroundImage: `url("${mediaUrl(note).replace(/"/g, '%22')}")` }}
                      role="img"
                      aria-label={note.original_filename || 'Note image'}
                    />
                    <span className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><ImageIcon size={13} /> {note.original_filename}</span>
                  </a>
                )}
                {note.block_type === 'file' && (
                  <a href={mediaUrl(note)} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl bg-muted p-3 text-sm font-medium text-foreground">
                    <FileText />
                    <span className="min-w-0 flex-1 truncate">{note.original_filename || 'Attachment'}</span>
                    <ExternalLink size={14} className="text-muted-foreground" />
                  </a>
                )}
                <div className={`${compact ? 'mt-1' : 'mt-2'} flex justify-end gap-1`}>
                  {(note.block_type === 'text' || note.block_type === 'link') && (
                    <Button size="icon" variant="ghost" className={compact ? 'h-6 w-6' : 'h-8 w-8'} aria-label="Edit note" onClick={() => startEdit(note)}><Pencil size={compact ? 12 : 14} /></Button>
                  )}
                  <Button size="icon" variant="ghost" className={`${compact ? 'h-6 w-6' : 'h-8 w-8'} text-destructive`} aria-label="Delete note" onClick={() => removeNote(note.note_uuid)}><Trash2 size={compact ? 12 : 14} /></Button>
                </div>
              </>
            )}
          </div>
        ))}
        {notes.length === 0 && !isDragging && (
          <div className={`${compact ? 'rounded-lg p-3 text-xs' : 'rounded-2xl p-5 text-sm'} border border-dashed border-border text-center text-muted-foreground`}>
            Add something you will want when you return to this resource.
          </div>
        )}
      </div>

      <div className={`${compact ? 'mt-2 space-y-1.5 pt-2' : 'mt-4 space-y-3 pt-4'} border-t border-border`}>
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onPaste={handlePaste}
          rows={compact ? 2 : 3}
          className={compact ? 'min-h-16 resize-none text-xs' : ''}
          placeholder="Write a note, or paste a link or image…"
        />
        {showLinkInput && (
          <div className="flex gap-2">
            <Input value={linkDraft} onChange={(event) => setLinkDraft(event.target.value)} placeholder="https://…" />
            <Button variant="outline" onClick={() => void addLink(linkDraft)} disabled={isSaving}>Add link</Button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button size={compact ? 'sm' : 'default'} className={compact ? 'h-7 text-xs' : ''} onClick={addText} disabled={!draft.trim() || isSaving}>Add note</Button>
          <Button size={compact ? 'sm' : 'default'} className={compact ? 'h-7 text-xs' : ''} variant="ghost" onClick={() => setShowLinkInput((value) => !value)}><Link2 className={compact ? 'h-3.5 w-3.5' : ''} /> Add link</Button>
          {!compact && <span className="ml-auto text-xs text-muted-foreground">Paste and drag supported</span>}
        </div>
      </div>
    </Card>
  )
}
