'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle, Clock, ImageSquare, Info, PaperPlaneTilt, Sparkle, Warning, X } from '@phosphor-icons/react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs'
import { Textarea } from '@components/ui/textarea'
import { Button } from '@components/ui/button'
import { Badge } from '@components/ui/badge'
import { Alert, AlertDescription } from '@components/ui/alert'
import {
  CandidateFeedback, CandidateReleaseFeed, candidateAttachmentUrl,
  confirmCandidateFeedback, editCandidateFeedback, getCandidateFeedback,
  getCandidateReleases, markCandidateReleasesViewed, submitCandidateFeedback,
} from '@services/candidate/candidate'

export type CandidatePanel = 'feedback' | 'releases' | 'about'

interface FeedbackModalProps {
  open: boolean
  onOpenChange: React.ComponentProps<typeof Dialog>['onOpenChange']
  theme?: 'light' | 'dark'
  orgId?: number
  accessToken?: string
  initialPanel?: CandidatePanel
  feedbackConfigured?: boolean
  unstable?: boolean
  onReleasesViewed?: () => void
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Open', in_progress: 'In the works', awaiting_confirmation: 'Ready to test', solved: 'Solved', ignored: 'Closed',
}

export function FeedbackModal({ open, onOpenChange, theme = 'light', orgId, accessToken, initialPanel = 'feedback', feedbackConfigured = true, unstable = true, onReleasesViewed }: FeedbackModalProps) {
  const [panel, setPanel] = useState<CandidatePanel>(initialPanel)
  const [message, setMessage] = useState('')
  const [images, setImages] = useState<Array<{ file: File; preview: string }>>([])
  const [history, setHistory] = useState<CandidateFeedback[]>([])
  const [releases, setReleases] = useState<CandidateReleaseFeed | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editMessage, setEditMessage] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const isDark = theme === 'dark'

  useEffect(() => setPanel(initialPanel), [initialPanel, open])

  const load = useCallback(async () => {
    if (!open || !accessToken) return
    setLoading(true); setError('')
    try {
      const [feedbackResult, releaseResult] = await Promise.allSettled([
        orgId && feedbackConfigured ? getCandidateFeedback(orgId, accessToken) : Promise.resolve([]),
        getCandidateReleases(accessToken),
      ])
      if (feedbackResult.status === 'fulfilled') setHistory(feedbackResult.value)
      if (releaseResult.status === 'fulfilled') setReleases(releaseResult.value)
      if (feedbackResult.status === 'rejected' && releaseResult.status === 'rejected') throw feedbackResult.reason
      if (feedbackResult.status === 'rejected') setError(feedbackResult.reason instanceof Error ? feedbackResult.reason.message : 'Feedback history is unavailable')
      else if (releaseResult.status === 'rejected') setError('What’s new is temporarily unavailable')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load candidate updates')
    } finally { setLoading(false) }
  }, [accessToken, feedbackConfigured, open, orgId])

  useEffect(() => { void load() }, [load])

  const addImages = (files: File[]) => {
    const accepted = files.filter((file) => file.type.startsWith('image/')).slice(0, Math.max(0, 3 - images.length))
    setImages((current) => [...current, ...accepted.map((file) => ({ file, preview: URL.createObjectURL(file) }))].slice(0, 3))
  }

  const removeImage = (image: { file: File; preview: string }) => {
    URL.revokeObjectURL(image.preview)
    setImages((current) => current.filter((entry) => entry !== image))
  }

  const submit = async () => {
    if (!message.trim() || !orgId || !accessToken) return
    setLoading(true); setError('')
    try {
      const created = await submitCandidateFeedback(orgId, message, images.map((image) => image.file), accessToken)
      setHistory((current) => [created, ...current]); setMessage('')
      images.forEach((image) => URL.revokeObjectURL(image.preview)); setImages([])
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not send feedback') }
    finally { setLoading(false) }
  }

  const saveEdit = async (item: CandidateFeedback) => {
    if (!orgId || !accessToken) return
    try {
      const updated = await editCandidateFeedback(orgId, item.key, editMessage, accessToken)
      setHistory((current) => current.map((entry) => entry.key === item.key ? updated : entry)); setEditing(null)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not edit feedback') }
  }

  const confirm = async (item: CandidateFeedback, solved: boolean) => {
    if (!orgId || !accessToken) return
    try {
      const updated = await confirmCandidateFeedback(orgId, item.key, solved, accessToken)
      setHistory((current) => current.map((entry) => entry.key === item.key ? updated : entry))
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update feedback') }
  }

  const changePanel = async (value: string) => {
    setPanel(value as CandidatePanel)
  }

  useEffect(() => {
    if (!open || panel !== 'releases' || !releases?.has_unread || !accessToken) return
    let active = true
    void (async () => {
      try {
        await markCandidateReleasesViewed(accessToken)
        if (!active) return
        setReleases((current) => current ? { ...current, has_unread: false } : current)
        onReleasesViewed?.()
      } catch { /* retain unread when acknowledgement fails */ }
    })()
    return () => { active = false }
  }, [accessToken, onReleasesViewed, open, panel, releases?.has_unread])

  const downloadAttachment = async (item: CandidateFeedback, attachmentId: string, filename: string) => {
    if (!orgId || !accessToken) return
    const response = await fetch(candidateAttachmentUrl(orgId, item.key, attachmentId), { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!response.ok) return setError('Could not open that screenshot')
    const url = URL.createObjectURL(await response.blob())
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className={isDark ? 'max-h-[92dvh] sm:max-w-2xl border-white/10 bg-[#0f0f10] text-white' : 'max-h-[92dvh] sm:max-w-2xl'}>
      <DialogHeader><DialogTitle className={isDark ? 'text-white' : ''}>{unstable ? 'Unstable preview' : 'Feedback'}</DialogTitle><DialogDescription className={isDark ? 'text-white/55' : ''}>{unstable ? 'See what changed or tell us what needs attention.' : 'Tell us what needs attention. A quick sentence is plenty.'}</DialogDescription></DialogHeader>
      <Tabs value={panel} onValueChange={(value) => void changePanel(value)} className="mt-4 min-h-0">
        {unstable ? <TabsList className={isDark ? 'grid w-full grid-cols-3 bg-white/[0.07]' : 'grid w-full grid-cols-3'}>
          <TabsTrigger value="feedback"><PaperPlaneTilt className="mr-1" /> Feedback</TabsTrigger>
          <TabsTrigger value="releases"><Sparkle className="mr-1" /> What&apos;s new{releases?.has_unread ? <span className="ml-1 h-2 w-2 rounded-full bg-amber-500" /> : null}</TabsTrigger>
          <TabsTrigger value="about"><Info className="mr-1" /> About</TabsTrigger>
        </TabsList> : null}
        {error ? <Alert variant="destructive" className="mt-3"><AlertDescription>{error}</AlertDescription></Alert> : null}

        <TabsContent value="feedback" className="max-h-[68dvh] overflow-y-auto pr-1">
          {!feedbackConfigured ? <Alert className={isDark ? 'border-white/10 bg-white/[0.04] text-white' : ''}><AlertDescription>Feedback is temporarily unavailable because this preview is not connected to its Jira feedback board.</AlertDescription></Alert> : <>
            <div className={isDark ? 'rounded-xl border border-white/10 bg-white/[0.04] p-3' : 'rounded-xl border border-border bg-card p-3'} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addImages(Array.from(event.dataTransfer.files)) }} onPaste={(event) => addImages(Array.from(event.clipboardData.files))}>
              <Textarea autoFocus value={message} onChange={(event) => setMessage(event.target.value)} placeholder="What did you notice?" aria-label="Feedback message" className={isDark ? 'min-h-24 resize-none border-white/10 bg-black/20 text-white placeholder:text-white/30' : 'min-h-24 resize-none'} />
              {images.length ? <div className="mt-3 flex gap-2">{images.map((image) => <div key={image.preview} className="relative"><img src={image.preview} alt={image.file.name} className="h-16 w-16 rounded-lg object-cover" /><button type="button" aria-label={`Remove ${image.file.name}`} onClick={() => removeImage(image)} className="absolute -right-1 -top-1 rounded-full bg-black p-1 text-white"><X size={11} /></button></div>)}</div> : null}
              <div className="mt-3 flex items-center justify-between gap-3"><div><input ref={fileInput} className="hidden" type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple onChange={(event) => addImages(Array.from(event.target.files || []))} /><Button type="button" variant="ghost" size="sm" onClick={() => fileInput.current?.click()} disabled={images.length >= 3}><ImageSquare /> Add screenshots <span className="text-muted-foreground">{images.length}/3</span></Button></div><Button type="button" size="sm" onClick={() => void submit()} disabled={!message.trim() || loading}><PaperPlaneTilt weight="fill" /> {loading ? 'Sending…' : 'Send'}</Button></div>
              <p className={isDark ? 'mt-2 text-xs text-white/35' : 'mt-2 text-xs text-muted-foreground'}>Paste, drop, or choose up to 3 images.</p>
            </div>
            <div className={isDark ? 'my-5 flex items-center gap-3 text-xs text-white/35' : 'my-5 flex items-center gap-3 text-xs text-muted-foreground'}><span className="h-px flex-1 bg-current opacity-20" />Your submission history<span className="h-px flex-1 bg-current opacity-20" /></div>
            <div className="space-y-3">{!history.length && !loading ? <p className="py-8 text-center text-sm text-muted-foreground">Nothing here yet. A quick sentence is plenty.</p> : null}{history.map((item) => <article key={item.key} className={isDark ? 'rounded-xl border border-white/10 p-4' : 'rounded-xl border border-border p-4'}>
              <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Badge variant="outline" className={isDark ? 'border-white/15 text-white/70' : ''}>{STATUS_LABELS[item.status]}</Badge>{item.priority === 'high' ? <Badge variant="destructive">High priority</Badge> : null}</div><span className="text-xs text-muted-foreground">{item.created_at ? new Date(item.created_at).toLocaleDateString() : item.key}</span></div>
              {editing === item.key ? <div className="mt-3"><Textarea value={editMessage} onChange={(event) => setEditMessage(event.target.value)} /><div className="mt-2 flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button><Button size="sm" onClick={() => void saveEdit(item)}>Save</Button></div></div> : <button type="button" className="mt-3 w-full text-left text-sm leading-6" onClick={() => { setEditing(item.key); setEditMessage(item.message) }}>{item.message}<span className="ml-2 text-xs text-muted-foreground">Edit</span></button>}
              {item.attachments.length ? <div className="mt-3 flex flex-wrap gap-2">{item.attachments.map((attachment) => <Button key={attachment.id} variant="outline" size="sm" onClick={() => void downloadAttachment(item, attachment.id, attachment.filename)}><ImageSquare />{attachment.filename}</Button>)}</div> : null}
              {item.entries.length ? <div className="mt-4 space-y-2 border-l-2 border-amber-400/40 pl-3">{item.entries.map((entry) => <div key={entry.id}><p className="text-sm">{entry.message}</p><p className="mt-1 text-xs text-muted-foreground">{entry.author}</p></div>)}</div> : null}
              {item.status === 'awaiting_confirmation' ? <div className="mt-4 rounded-lg bg-amber-500/10 p-3"><p className="text-sm font-medium">Does the latest push solve this?</p><div className="mt-2 flex gap-2"><Button size="sm" onClick={() => void confirm(item, true)}><CheckCircle />Yes, solved</Button><Button size="sm" variant="outline" onClick={() => void confirm(item, false)}><Clock />Still happening</Button></div></div> : null}
            </article>)}</div>
          </>}
        </TabsContent>

        <TabsContent value="releases" className="max-h-[68dvh] overflow-y-auto pr-1">
          {releases?.unseen.length ? <section><Badge className="mb-3 bg-amber-500 text-black hover:bg-amber-500">New since you last tested</Badge><ReleaseList releases={releases.unseen} dark={isDark} /><div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />Earlier updates<span className="h-px flex-1 bg-border" /></div></section> : null}
          <ReleaseList releases={releases?.previous || []} dark={isDark} />
          {!loading && !releases?.unseen.length && !releases?.previous.length ? <p className="py-12 text-center text-sm text-muted-foreground">No GitHub changes are available for this build yet.</p> : null}
        </TabsContent>
        <TabsContent value="about"><Alert className={isDark ? 'border-amber-400/20 bg-amber-400/10 text-white' : 'border-amber-300 bg-amber-50'}><Warning className="text-amber-600" /><AlertDescription><strong>This is a testing version.</strong> Things may change or occasionally break. Data entered here may be reset and should not be treated as a permanent record. If something feels wrong, send a quick note in Feedback—screenshots help, but they are optional.</AlertDescription></Alert></TabsContent>
      </Tabs>
    </DialogContent>
  </Dialog>
}

function ReleaseList({ releases, dark }: { releases: CandidateReleaseFeed['unseen']; dark: boolean }) {
  return <div className="space-y-3">{releases.map((release) => <article key={release.revision} className={dark ? 'rounded-xl border border-white/10 p-4' : 'rounded-xl border border-border p-4'}><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{release.title}</h3><span className="font-mono text-xs text-muted-foreground">{release.revision.slice(0, 7)}</span></div><ul className="mt-3 space-y-2">{release.notes.map((note, index) => <li key={`${release.revision}-${index}`} className="flex gap-2 text-sm leading-6"><Sparkle className="mt-1 shrink-0 text-amber-500" />{note.url ? <a href={note.url} target="_blank" rel="noreferrer" className="hover:underline">{note.text}</a> : note.text}</li>)}</ul></article>)}</div>
}
